// ============================================================
//  WP-00c session ③ — the village part of the core-extension suite (called from tests/suites/core-extension.mjs).
//  `_selftest` leaves a probe on the village page too: <div data-st="badge" data-page="village" …>. Commands go in as a CustomEvent
//  'st-cmd' { cmd, … } on the badge and come back in data-out (see features/_selftest/village.js); bus events it saw are in data-ev,
//  the per-frame hook counters in data-frames.
// ============================================================
import { adminPage, setFlag, setLive, expectClean, featureState, footprint } from './v4.mjs';

/** the 8-colour probe markers _selftest draws into the world's top-left corner (world px). The map's corner tree hides most of the ground marker, so (0,5) is the visible red one. */
const MARK = { ground: [0, 5, [255, 0, 0]], prop: [2, 2, [128, 0, 255]], overhead: [4, 4, [0, 255, 0]], fx: [5, 5, [0, 0, 255]] };

export default async function villageSteps(h, X) {
  const { ST, badge, visible, text, until, ready, patchManifest } = X;
  h.allowErrors(/uxrival/, /presence boom/);

  // ---------------------------------------------------------------- helpers
  const V = (extra = {}) => ({ seed: 30, time: 'day', ...ST, ...extra });                       // the usual demo world: 30 villagers, daylight, _selftest on
  const cmd = (p, c, a = {}) => p.evaluate(({ c, a }) => { const b = document.querySelector('[data-st="badge"]'); b.dispatchEvent(new CustomEvent('st-cmd', { detail: { cmd: c, ...a } })); return JSON.parse(b.dataset.out || 'null')?.val ?? null; }, { c, a });
  const evs = async p => JSON.parse((await badge(p))?.ev || '{}');
  const frames = async p => JSON.parse((await badge(p))?.frames || '{}');
  const num = async (p, k) => Number((await badge(p))?.[k] || 0);
  /** log every banner that reaches the screen (#arrival gets class "on") → window.__bl */
  const trackBanners = p => p.evaluate(() => {
    const el = document.querySelector('#arrival'), log = (window.__bl = []); let was = false, last = '';
    new MutationObserver(() => { const on = el.classList.contains('on'), t = el.textContent; if (on && (!was || t !== last)) log.push(t); was = on; last = t; })
      .observe(el, { attributes: true, attributeFilter: ['class'], childList: true, characterData: true, subtree: true });
  });
  const banners = p => p.evaluate(() => (window.__bl || []).slice());
  const px = (p, sel, pts) => p.evaluate(([sel, pts]) => { const g = document.querySelector(sel).getContext('2d'); return pts.map(([x, y]) => [...g.getImageData(x, y, 1, 1).data].slice(0, 3)); }, [sel, pts]);
  const near = (a, b, t = 8) => !!a && a.every((v, i) => Math.abs(v - b[i]) <= t);
  const markers = async p => { const r = await px(p, '#world', Object.values(MARK).map(([x, y]) => [x, y])); return Object.fromEntries(Object.keys(MARK).map((k, i) => [k, near(r[i], MARK[k][2])])); };
  /** screen point of a world point (TV: the canvas fills the screen) */
  const screenOf = (p, wx, wy) => p.evaluate(([wx, wy]) => { const r = document.querySelector('#world').getBoundingClientRect(); return [r.left + wx / 480 * r.width, r.top + wy / 272 * r.height]; }, [wx, wy]);
  const guestIds = p => h.store(p, s => new Promise(res => { const off = s.subscribeGuests(l => { off(); res(l.map(g => ({ id: g.id, name: g.name }))); }); }));
  const even = id => [...String(id)].reduce((a, c) => a + c.charCodeAt(0), 0) % 2 === 0;
  const villagersOf = async p => (await cmd(p, 'info')).villagers;
  const countN = async p => parseInt(await p.textContent('#count-n'), 10);                     // what the HUD counts (the villagers that are in)
  /** node-side polling of anything async; false when it never became true */
  const poll = async (fn, ms = 4000) => { const t0 = Date.now(); for (;;) { let v; try { v = await fn(); } catch { v = false; } if (v) return true; if (Date.now() - t0 > ms) return false; await h.wait(80); } };
  const states = p => p.evaluate(async () => (await import('/js/core/features.js')).featureStates().filter(s => s.on).map(s => s.id));
  /** a tiny JPEG snap for the TV's polaroid */
  const addSnap = (p, gid, name) => h.store(p, async (s, a) => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 48; const g = c.getContext('2d'); g.fillStyle = '#e8a'; g.fillRect(0, 0, 64, 48); g.fillStyle = '#fff'; g.fillRect(10, 10, 20, 20);
    return s.addSnap(a.gid, a.name, c.toDataURL('image/jpeg', 0.8), 'q', 0);
  }, { gid, name });
  const chime = p => p.addInitScript(() => {                                                    // count the notes the core plays (every chime = 4–6 oscillators)
    window.__osc = 0; const A = window.AudioContext || window.webkitAudioContext;
    if (A) { const o = A.prototype.createOscillator; A.prototype.createOscillator = function () { window.__osc++; return o.apply(this, arguments); }; }
  });
  const osc = p => p.evaluate(() => window.__osc || 0);

  // ================================================================ everything OFF
  await h.step('village, all features off: new containers empty and hidden, existing events still fire (v3.2)', async () => {
    const p = await h.page('tv', { tag: 'v-off' });
    await p.goto(h.url('village.html', { seed: 30, time: 'day' })); await p.waitForTimeout(1500);
    h.eq('four HUD zones exist and are empty + display:none (no stray gap)', await p.evaluate(() => [...document.querySelectorAll('.hud .hz')].map(z => [z.classList[1], z.children.length, getComputedStyle(z).display])),
      [['hz-tl', 0, 'none'], ['hz-tr', 0, 'none'], ['hz-rm', 0, 'none'], ['hz-tc', 0, 'none']]);
    h.eq('#spot is empty · #quiet-chip, #fsheet are hidden · body.quiet is off', await p.evaluate(() => [document.querySelector('#spot').children.length, document.querySelector('#quiet-chip').hidden, document.querySelector('#fsheet').hidden, document.body.classList.contains('quiet')]), [0, true, true, false]);
    h.eq('ticker: prefix and second line are empty, the second line takes no room', await p.evaluate(() => [document.querySelector('#ticker .pre2').textContent, document.querySelector('#ticker .msg2').textContent, getComputedStyle(document.querySelector('#ticker .msg2')).display]), ['', '', 'none']);
    h.eq('no feature is on', await states(p), []);
    h.check('html.f-boot is gone and nothing waits for a feature (30 villagers)', !(await p.evaluate(() => document.documentElement.classList.contains('f-boot'))) && parseInt(await p.textContent('#count-n'), 10) === 30);
    h.check('no banner on the screen after boot (the first sync is not an "arrival")', !(await p.evaluate(() => document.querySelector('#arrival').classList.contains('on'))));
    const last = await p.evaluate(async () => { const { last } = await import('/js/core/bus.js'); const g = last('village:guests'); return { lang: last('lang'), ready: last('village:ready'), guests: [g?.list.length, g?.allIds.size], level: last('village:level'), snaps: last('village:snaps') }; });
    h.eq('sticky bus values after the first sync: lang · ready · guests · level · snaps', last, { lang: { lang: 'ko' }, ready: { HOST: true, TOUCH: false, ME: null }, guests: [30, 30], level: { level: 4, celebrate: false }, snaps: { count: 0 } });
    await p.evaluate(async () => { window.__ve = []; (await import('/js/core/bus.js')).on('village:event', e => window.__ve.push(e)); });
    await p.keyboard.press('t'); await p.waitForTimeout(400);
    h.eq('key T does nothing without a feature that owns it', await p.evaluate(() => window.__ve.length), 0);
    await h.shot(p, 'village-1-off');
  });

  // ================================================================ A4: banner queue (core behaviour, no feature)
  await h.step('A4 five arrivals at once → ONE merged banner, and the level-up (high) is shown first', async () => {
    const p = await h.page('tv', { tag: 'v-a4' });
    await p.goto(h.url('village.html', { seed: 26, time: 'day' })); await p.waitForTimeout(1500);
    await trackBanners(p);
    h.eq('26 villagers, level 3', [parseInt(await p.textContent('#count-n'), 10), await p.textContent('#lv')], [26, '3']);
    await p.keyboard.press('l');                                                                 // demo: +5 guests in one sync → level 4
    h.check('two banners come, level-up first', await until(p, () => window.__bl.length >= 2, null, 20000));
    const b = await banners(p);
    h.check('A4 first the level-up (priority high jumped the queue)', /레벨 UP! Lv\.4/.test(b[0]), b[0]);
    h.check('A4 then one merged banner "A님 외 4명이 도착했어요!"', /^🎉 .+님 외 4명이 도착했어요!$/.test(b[1]), b[1]);
    await p.waitForTimeout(6800);
    const b2 = await banners(p);
    h.check('A4 no single "…님이 마을에 도착했어요!" banner at all (5 arrivals → 1 banner)', b2.length === 2 && !b2.some(t => t.includes('님이 마을에 도착했어요')), JSON.stringify(b2));
    h.eq('HUD: 31 villagers, level 4', [parseInt(await p.textContent('#count-n'), 10), await p.textContent('#lv')], [31, '4']);
    await h.shot(p, 'village-2-a4-merged');
  });

  // ================================================================ _selftest on the TV
  const tvCtx = await h.context('tv');
  const tv = await h.page(tvCtx, { tag: 'v-tv' });
  await tv.goto(h.url('village.html', V()));
  await ready(tv, 'village'); await tv.waitForTimeout(1500);

  await h.step('TV _selftest: ctx.v constants · sticky events replayed during setup · HUD zones sorted by order', async () => {
    const info = await cmd(tv, 'info');
    h.eq('HOST · TOUCH · ME and the world constants', [info.HOST, info.TOUCH, info.ME, info.W, info.H, info.TILE], [true, false, null, 480, 272, 16]);
    h.eq('Z is frozen (12 layers) · SP() names the 8 slot sets · phase = live', [info.zFrozen, info.zKeys, info.sp, info.phase], [true, 12, ['chat', 'dance', 'door', 'eat', 'fish', 'group', 'photo', 'walk'], 'live']);
    h.eq('guests() · allIds() · villagers() · couple() = 30 · 30 · 30 · 2', [info.guests, info.allIds, info.villagers, info.couple], [30, 30, 30, 2]);
    h.eq('audio() is the core AudioContext slot · sound is on', [info.audio, info.sound], ['object', true]);
    const ev = await evs(tv);
    h.check('the feature came up after the first sync: lang · ready · guests · level · snaps arrive by replay (flagged)', ['lang', 'village:ready', 'village:guests', 'village:level', 'village:snaps'].every(k => ev[k]?.n === 1 && ev[k].replay === true), JSON.stringify(Object.keys(ev)));
    h.eq('village:ready { HOST, TOUCH, ME } and village:level { level, celebrate }', [ev['village:ready'].last, ev['village:level'].last], [{ HOST: true, TOUCH: false, ME: null }, { level: 4, celebrate: false }]);
    h.eq('village:guests carries the villagers\' list and the id set of everybody (30 · 30)', [ev['village:guests'].last.list.length, ev['village:guests'].last.all], [30, 30]);
    const zones = await tv.evaluate(() => Object.fromEntries([...document.querySelectorAll('.hud .hz')].map(z => [z.classList[1], [...z.children].map(c => c.dataset.st)])));
    h.eq('HUD: order beats the order of registration (tl: order 10 before order 20); one chip in tr · rm · tc', zones, { 'hz-tl': ['hud-tl', 'hud-tl-b'], 'hz-tr': ['hud-tr'], 'hz-rm': ['hud-rm'], 'hz-tc': ['hud-tc'] });
    h.check('every chip is visible with a real size, and carries data-f (so switching off takes it along)', await tv.evaluate(() => [...document.querySelectorAll('.hud .hz [data-st]')].every(c => { const r = c.getBoundingClientRect(); return r.width > 20 && r.height > 8 && getComputedStyle(c).display !== 'none' && c.dataset.f === '_selftest'; })));
    h.check('ctx.rootClass: <html class="f-_selftest-on"> (the dashed outline CSS applies)', await tv.evaluate(() => document.documentElement.classList.contains('f-_selftest-on') && getComputedStyle(document.querySelector('.hud .hz-tl')).outlineStyle === 'dashed'));
    h.check('the TV hint line lists the key: "T 점검 장면"', (await text(tv, '.start-hint')).includes('T 점검 장면'), await text(tv, '.start-hint'));
    await h.shot(tv, 'village-3-selftest-tv');
  });

  await h.step('TV _selftest: onUpdate · three draw layers · prop · decorate · three overlay layers (order = the core\'s, not the registration order)', async () => {
    const f = await frames(tv);
    h.check('onUpdate runs every frame with finite dt/time; the hooks got complete info objects (bad = 0)', f.upd > 30 && f.bad === 0, JSON.stringify({ upd: f.upd, bad: f.bad }));
    h.eq('world layers run ground → overhead → fx every frame (registered in the opposite order)', f.order.slice(0, 3), ['ground', 'overhead', 'fx']);
    h.eq('overlay layers run under-tags → over-tags → top every frame (registered in the opposite order)', f.ovOrder.slice(0, 3), ['under-tags', 'over-tags', 'top']);
    h.check('every hook ran about once per frame (±2) · the prop was drawn each frame', [f.drawn.ground, f.drawn.overhead, f.drawn.fx, f.ov['under-tags'], f.ov['over-tags'], f.ov.top, f.propDraws].every(n => Math.abs(n - f.upd) <= 2), JSON.stringify(f).slice(0, 300));
    h.check('overlay info: X()/Y() map world → screen, k > 0, fs > 0, w × h = the screen', f.ovInfo.fsOk && f.ovInfo.k > 3 && f.ovInfo.w > 1800 && f.ovInfo.h === 1080, JSON.stringify(f.ovInfo));
    h.eq('pixels of the world: ground marker · prop over ground · overhead over prop · fx over overhead', await markers(tv), { ground: true, prop: true, overhead: true, fx: true });
    const ov = await px(tv, '#overlay', [[3, 3], [9, 3], [15, 3]]);
    h.check('pixels of the overlay: the three layer markers are all painted', near(ov[0], [255, 0, 0]) && near(ov[1], [0, 255, 0]) && near(ov[2], [0, 0, 255]), JSON.stringify(ov));
    h.check('decorate runs for villagers only (30 distinct ids — not the 2 couple members) with sane info', f.deco.length === 30 && new Set(f.deco).size === 30, `${f.deco.length}`);
    // the prop: its tap box, then remove()
    await cmd(tv, 'prop', { op: 'set', patch: { x: 200, y: 100, w: 30, h: 20 } });
    const [sx, sy] = await screenOf(tv, 215, 110);
    await tv.mouse.click(sx, sy); await tv.waitForTimeout(150);
    h.eq('prop.set moved the tap box: a tap inside carries prop = its kind', JSON.parse((await badge(tv)).tap || '{}').prop, 'f-_selftest-prop');
    await cmd(tv, 'prop', { op: 'remove' }); await tv.waitForTimeout(200);
    h.eq('prop.remove(): the purple square is gone on the next frame, the other layers stay', await markers(tv), { ground: true, prop: false, overhead: true, fx: true });
  });

  await h.step('TV _selftest: onTap · onGesture · key T · banners (high first) · spotlight queue · scene · couple · fx', async () => {
    // ---- tap & gesture
    const ids = (await evs(tv))['village:guests'].last.list;
    const pts = await tv.evaluate(ids => ids.map(id => { const b = document.querySelector('[data-st="badge"]'); b.dispatchEvent(new CustomEvent('st-cmd', { detail: { cmd: 'vil', gid: id, op: 'icon', args: ['😀', 0.2] } })); const o = JSON.parse(b.dataset.out).val; return { id, x: o.x, y: o.y }; }), ids);
    const lone = pts.map(a => ({ ...a, d: Math.min(...pts.filter(b => b.id !== a.id).map(b => Math.hypot(b.x - a.x, (b.y - a.y) * 0.8))) })).sort((a, b) => b.d - a.d)[0];   // the villager with the most room around it (a tap hits the one in front)
    const gid = lone.id, pos = await cmd(tv, 'vil', { gid, op: 'icon', args: ['😀', 0.2] });
    const [vx, vy] = await screenOf(tv, pos.x, pos.y - 10);
    const g0 = await num(tv, 'gest');
    await tv.mouse.click(vx, vy); await tv.waitForTimeout(150);
    const tap = JSON.parse((await badge(tv)).tap), ev = await evs(tv);
    h.check('onTap: a tap on a villager gives { wx, wy } in world pixels and that villager\'s gid', tap.gid === gid && Math.abs(tap.wx - pos.x) < 6 && Math.abs(tap.wy - (pos.y - 10)) < 6, JSON.stringify({ tap, gid, pos, room: Math.round(lone.d) }));
    h.eq('…and the same payload goes out on the bus as village:tap', ev['village:tap'].last, tap);
    const [ex, ey] = await screenOf(tv, 3, 252);
    await tv.mouse.click(ex, ey); await tv.waitForTimeout(150);
    h.eq('a tap on bare ground has gid null', JSON.parse((await badge(tv)).tap).gid, null);
    const t0 = await num(tv, 'taps');
    const chip = await tv.evaluate(() => { const r = document.querySelector('[data-st="hud-tr"]').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
    await tv.mouse.click(chip[0], chip[1]); await tv.waitForTimeout(150);
    h.eq('a click on a HUD item is not a world tap', await num(tv, 'taps'), t0);
    h.check('onGesture fires on user input (pointer / key) — tolerant of repeats (must be idempotent)', (await num(tv, 'gest')) > g0);

    // ---- banners: one burst of commands, high priority jumps ahead of the two normal ones
    await trackBanners(tv);
    await tv.evaluate(() => { const b = document.querySelector('[data-st="badge"]'), f = (cmd, a) => b.dispatchEvent(new CustomEvent('st-cmd', { detail: { cmd, ...a } })); f('banner', { text: 'N1', ms: 1500 }); f('banner', { text: 'N2', ms: 1500 }); f('banner', { text: 'H', ms: 1500, priority: 'high' }); });
    h.check('three banners shown', await until(tv, () => window.__bl.length >= 3, null, 12000));
    h.eq('ctx.v.banner: priority "high" is shown before the normal ones, which keep their order', await banners(tv), ['H', 'N1', 'N2']);

    // ---- spotlight: two requests are shown one after the other, never together
    await tv.evaluate(() => { window.__spotMax = 0; setInterval(() => { window.__spotMax = Math.max(window.__spotMax, document.querySelectorAll('[data-st="spot-box"]').length); }, 25); });
    await cmd(tv, 'spot', { key: 'f-_selftest-s1', tag: 'S1', ms: 1500 }); await cmd(tv, 'spot', { key: 'f-_selftest-s2', tag: 'S2', ms: 1500 });
    h.check('spotlight: both requests were shown and finished (the promise resolves)', await until(tv, () => Number(document.querySelector('[data-st="badge"]').dataset.spotDone) >= 2, null, 20000));
    h.eq('spotlight: shown in request order, render() cleanup ran for both, never two at once', [(await badge(tv)).spotLast, await num(tv, 'spotShown'), await num(tv, 'spotCleaned'), await tv.evaluate(() => window.__spotMax)], ['S2', 2, 2, 1]);
    h.check('spotlight: nothing stays behind once the fade-out is over', await poll(() => tv.evaluate(() => document.querySelector('#spot').children.length === 0 && !document.querySelector('#spot').dataset.owner), 3000));

    // ---- scene: key T → 6 villagers gather, count 3-2-1, wave, done
    const ve0 = (await evs(tv))['village:event']?.n || 0;
    await tv.keyboard.press('t');
    h.check('key T: the scene starts (state().event = scene f-_selftest-wave)', await until(tv, () => !!document.querySelector('[data-st="badge"]').dataset.scene, null, 4000));
    const st = await cmd(tv, 'state');
    h.eq('state().event', st.event, { type: 'scene', key: 'f-_selftest-wave' });
    const scene = JSON.parse((await badge(tv)).scene);
    const known = new Set((await evs(tv))['village:guests'].last.list);
    h.check('s.crowd(6): six different villagers, all known guests', scene.crowd.length === 6 && new Set(scene.crowd).size === 6 && scene.crowd.every(id => known.has(id)), JSON.stringify(scene));
    h.check('the scene ends by itself (s.done) after ~3 s, end() gets the same crowd', await until(tv, () => !!document.querySelector('[data-st="badge"]').dataset.sceneEnd, null, 8000));
    const end = JSON.parse((await badge(tv)).sceneEnd);
    h.check('scene time ≈ 3 s · same crowd in end()', end.t >= 2.9 && end.t <= 3.6 && JSON.stringify(end.crowd) === JSON.stringify(scene.crowd), JSON.stringify(end));
    const ev2 = (await evs(tv))['village:event'];
    h.eq('village:event: start and end of the scene (id = seed)', [ev2.n - ve0, ev2.hist.slice(-2).map(e => e.stage), ev2.hist.slice(-1)[0].key, ev2.hist.slice(-1)[0].id], [2, ['start', 'end'], 'f-_selftest-wave', 'st-seed']);
    h.eq('after the scene the core is free again', (await cmd(tv, 'state')).event, null);
    h.check('the key T keeps working (second run starts, then ends)', await (async () => { await tv.keyboard.press('t'); return until(tv, () => Number(document.querySelector('[data-st="badge"]').dataset.keyT) === 2, null, 3000); })());
    await tv.waitForTimeout(3600);

    // ---- couple handles + camFocus + fx (no errors, observable movement)
    const c0 = await cmd(tv, 'couple', { i: 1, op: 'face', args: ['down'] });
    await cmd(tv, 'couple', { i: 1, op: 'walkTo', args: [c0.x + 40, c0.y + 6, 200] }); await tv.waitForTimeout(900);
    const c1 = await cmd(tv, 'couple', { i: 1, op: 'face', args: ['down'] });
    h.check('couple[1].walkTo moves her in a straight line', c1.x > c0.x + 15, JSON.stringify([c0, c1]));
    await cmd(tv, 'couple', { i: 1, op: 'home', args: [200] });
    h.check('couple[1].home() walks her back to her place', await until(tv, (c0) => { const b = document.querySelector('[data-st="badge"]'); b.dispatchEvent(new CustomEvent('st-cmd', { detail: { cmd: 'couple', i: 1, op: 'face', args: ['down'] } })); const o = JSON.parse(b.dataset.out).val; return Math.abs(o.x - c0.x) <= 2 && Math.abs(o.y - c0.y) <= 2; }, c0, 8000));
    for (const [kind, args] of [['heart', [100, 100]], ['note', [120, 100]], ['flash', [140, 100]], ['sparkle', [160, 100, 12, ['#fff', '#f0f']]], ['confetti', [180, 100, 30]]]) await cmd(tv, 'fx', { kind, args });
    await cmd(tv, 'camfocus', { x: 100, y: 100, sec: 1 });
    await tv.waitForTimeout(400);
    h.check('fx.* · camFocus run without errors (the feature is still on, no error counted)', (await featureState(tv, '_selftest')).errors === 0, JSON.stringify(await featureState(tv, '_selftest')));
  });

  await h.step('TV _selftest: every misuse throws a coded error the feature can read (reserved key · bad name · bad arg · duplicate · outside a scene)', async () => {
    const m = await cmd(tv, 'misuse');
    h.eq('error codes for 16 wrong calls', m, [['reserved-key', 'reserved-key'], ['reserved-escape', 'reserved-key'], ['bad-key', 'bad-arg'], ['duplicate-key', 'duplicate'], ['bad-zone', 'bad-arg'], ['bad-layer', 'bad-arg'], ['bad-overlay', 'bad-arg'],
      ['bad-action-name', 'bad-name'], ['duplicate-action', 'duplicate'], ['bad-sheet-name', 'bad-name'], ['bad-scene-seed', 'bad-arg'], ['walk-outside-scene', 'not-in-scene'], ['bad-prop', 'bad-arg'], ['bad-banner-kind', 'bad-arg'], ['bad-emote', 'bad-arg'], ['bad-couple-dir', 'bad-arg']]);
    h.check('a coded error that the feature catches itself is not counted against it', (await featureState(tv, '_selftest')).errors === 0);
  });

  // ================================================================ layout of the TV with every probe on
  await h.step('TV _selftest: layout audit with all four zones filled (no overlaps · no sideways scroll)', async () => {
    await tv.mouse.click(960, 540); await tv.waitForTimeout(800);                                  // the first click hides the start hint
    const r = await h.layoutReport(tv);
    h.check('TV 1920×1080: no overlapping controls · no sideways scroll', r.overlaps.length === 0 && !r.hscroll, JSON.stringify(r).slice(0, 600));
    await h.shot(tv, 'village-4-selftest-tv-audit');
  });

  // ================================================================ A2: hot toggle on the village
  await h.step('A2 hot toggle on the village: on → everything appears without a reload · off → footprint 0, hooks stop, counters 0 · on again → once', async () => {
    const ctx = await h.context('tv');
    const p = await h.page(ctx, { tag: 'v-hot' });
    await patchManifest(p, "status: 'beta'");                                                    // a planned feature can't be flipped by the admin — as a beta it can
    await p.goto(h.url('village.html', { seed: 30, time: 'day' })); await p.waitForTimeout(1200);
    await expectClean(h, p, '_selftest', 'A2 before it is on');
    const admin = await adminPage(h, ctx);
    await p.bringToFront();                                                                        // keep the village the tab that gets frames (pixel checks below)
    await setFlag(h, admin, '_selftest', true);
    h.check('A2 on without a reload: five chips, the probe and the key hint appear', await until(p, () => document.querySelectorAll('.hud .hz [data-st]').length === 5 && !!document.querySelector('[data-st="badge"]') && document.querySelector('.start-hint').textContent.includes('T 점검 장면'), null, 8000));
    await p.bringToFront(); await p.waitForTimeout(600);                                          // the admin tab opened after it: a background tab gets no frames
    h.eq('…and it draws (all four markers)', await markers(p), { ground: true, prop: true, overhead: true, fx: true });
    const ev = await evs(p);
    h.check('…and got the sticky values by replay although the page booted long before (ready · guests · level · lang)', ['lang', 'village:ready', 'village:guests', 'village:level'].every(k => ev[k]?.replay === true));
    await h.shot(p, 'village-5-hot-on');
    await setFlag(h, admin, '_selftest', false);
    h.check('A2 off: every zone is empty again', await until(p, () => [...document.querySelectorAll('.hud .hz')].every(z => !z.children.length) && !document.querySelector('[data-st="badge"]'), null, 8000));
    await p.waitForTimeout(400);
    await expectClean(h, p, '_selftest', 'A2 hot off');
    const st = await featureState(p, '_selftest');
    h.eq('A2 hot off: no listeners · timers · raf · watchers · bus subscriptions left', st && st.live, { listeners: 0, timers: 0, raf: 0, watchers: 0, bus: 0 });
    h.eq('A2 hot off: the drawing hooks, the prop and the key hint are gone', [await markers(p), await p.evaluate(() => document.querySelector('.start-hint').textContent.includes('T 점검'))], [{ ground: false, prop: false, overhead: false, fx: false }, false]);
    await p.evaluate(async () => { window.__ve = []; (await import('/js/core/bus.js')).on('village:event', e => window.__ve.push(e)); });
    await p.keyboard.press('t'); await p.waitForTimeout(400);
    h.eq('A2 hot off: key T does nothing any more', await p.evaluate(() => window.__ve.length), 0);
    h.eq('A2 hot off: the village itself is untouched (30 villagers, couple)', parseInt(await p.textContent('#count-n'), 10), 30);
    await setFlag(h, admin, '_selftest', true);
    h.check('A2 on again: once each (tl holds 2 chips, 5 in all, one probe)', await until(p, () => document.querySelectorAll('.hud .hz [data-st]').length === 5 && document.querySelectorAll('.hud .hz-tl [data-st]').length === 2 && document.querySelectorAll('[data-st="badge"]').length === 1, null, 8000));
    await p.waitForTimeout(500);
    h.eq('…and draws again', await markers(p), { ground: true, prop: true, overhead: true, fx: true });
  });

  // ================================================================ A3: a feature that crashes
  await h.step('A3 fcrash=_selftest on the village: the breaker trips, the bouquet toss still completes with a winner', async () => {
    const p = await h.page('tv', { tag: 'v-crash' });
    await p.goto(h.url('village.html', V({ fcrash: '_selftest', seed: 26 })));
    h.check('the breaker trips on the village page', await until(p, async () => (await (await import('/js/core/features.js')).featureStates()).find(s => s.id === '_selftest')?.tripped === true, null, 15000));
    await p.waitForTimeout(400);
    await expectClean(h, p, '_selftest', 'A3 tripped');
    h.eq('tripped: HUD zones are empty and the village keeps its 26 villagers', [await p.evaluate(() => [...document.querySelectorAll('.hud .hz')].every(z => !z.children.length)), parseInt(await p.textContent('#count-n'), 10)], [true, 26]);
    const won = h.waitBanner(p, /부케를 받았어요/, 90000);
    await p.keyboard.press('b');
    const t = await won;
    h.check('A3 the bouquet toss completes with a winner (a feature error does not reset core events)', !!t, t);
    await h.shot(p, 'village-6-crash-bouquet');
  });

  // ================================================================ A5: quiet mode
  await h.step('A5 quiet mode: nothing shows or sounds while it is on (events still flow) · when it ends the held banners come back merged, level-up first', async () => {
    const ctx = await h.context('tv');
    const p = await h.page(ctx, { tag: 'v-quiet' });
    await chime(p);
    await p.goto(h.url('village.html', V({ seed: 26 })));
    await ready(p, 'village'); await p.mouse.move(300, 300); await p.waitForTimeout(1200);        // moving the mouse wakes the core's AudioContext
    const admin = await adminPage(h, ctx);
    await cmd(p, 'chime');
    h.check('baseline (not quiet): chime() really plays notes', (await osc(p)) > 0);
    const guests = await guestIds(p), gid = guests[0].id;
    await setLive(h, admin, { quiet: true });
    h.check('A5 body.quiet follows live.quiet (admin → TV)', await until(p, () => document.body.classList.contains('quiet'), null, 6000));
    h.eq('on the TV the "ceremony in progress" chip stays hidden', await p.evaluate(() => getComputedStyle(document.querySelector('#quiet-chip')).display), 'none');
    await trackBanners(p);
    const osc0 = await osc(p), ve0 = (await evs(p))['village:event']?.n || 0, lv0 = (await evs(p))['village:level'].n;
    await p.keyboard.press('l');                                                                 // +5 guests: five arrival banners and level 4
    h.check('level 4 reached (the bus tells, quiet or not)', await until(p, n => JSON.parse(document.querySelector('[data-st="badge"]').dataset.ev)['village:level'].n > n, lv0, 6000));
    await cmd(p, 'banner', { text: 'Q-NORMAL', ms: 1500 }); await cmd(p, 'banner', { text: 'Q-HIGH', ms: 1500, priority: 'high' });
    await cmd(p, 'chime', { big: true }); await cmd(p, 'fx', { kind: 'fireworks', args: [6] }); await p.keyboard.press('x');
    await cmd(p, 'spot', { tag: 'quiet' });
    await addSnap(p, gid, guests[0].name);
    await p.waitForTimeout(3500);
    const ev = await evs(p);
    h.eq('A5 while quiet: banners · notes played · fireworks · polaroid · spotlight are all zero', { banners: (await banners(p)).length, notes: (await osc(p)) - osc0, fireworks: (ev['village:event']?.n || 0) - ve0, polaroid: await p.evaluate(() => document.querySelector('#polaroid').classList.contains('on')), spot: await num(p, 'spotShown') }, { banners: 0, notes: 0, fireworks: 0, polaroid: false, spot: 0 });
    h.eq('…while the bus keeps telling: five arrivals', ev['village:arrived'].n, 5);
    await h.shot(p, 'village-7-quiet-on');
    await p.evaluate(() => { window.__both = 0; setInterval(() => { const pol = document.querySelector('#polaroid').classList.contains('on'), box = !!document.querySelector('[data-st="spot-box"]'); window.__polSeen ||= pol; window.__spotSeen ||= box; if (pol && box) window.__both++; }, 25); });
    await setLive(h, admin, { quiet: false });
    h.check('A5 quiet ends: body.quiet is gone', await until(p, () => !document.body.classList.contains('quiet'), null, 6000));
    h.check('A5 the held banners come back (five of them: level-up, high, merged arrivals, normal, photo)', await until(p, () => window.__bl.length >= 5, null, 45000));
    const b = await banners(p);
    h.check('A5 level-up first, then the high one', /레벨 UP! Lv\.4/.test(b[0]) && b[1] === 'Q-HIGH', JSON.stringify(b));
    h.check('A5 five arrivals became ONE banner', b.filter(t => /님 외 4명이 도착했어요/.test(t)).length === 1 && !b.some(t => t.includes('님이 마을에 도착했어요')), JSON.stringify(b));
    h.check('A5 the normal banner and the photo banner are there too', b.includes('Q-NORMAL') && b.some(t => /^📷 .+님이 사진을 올렸어요!$/.test(t)), JSON.stringify(b));
    h.check('A5 afterwards the polaroid and the spotlight both show', await poll(() => p.evaluate(() => window.__polSeen === true && window.__spotSeen === true), 45000), await p.evaluate(() => JSON.stringify({ pol: window.__polSeen, spot: window.__spotSeen })));
    h.eq('…they never overlapped in time', await p.evaluate(() => window.__both), 0);
    h.check('the notes play again after quiet (the polaroid chime)', (await osc(p)) > osc0);
    const ve1 = (await evs(p))['village:event']?.n || 0;
    await p.keyboard.press('x'); await p.waitForTimeout(300);
    h.eq('key X launches fireworks again (village:event fired)', ((await evs(p))['village:event']?.n || 0) - ve1, 1);
  });

  // ================================================================ A6: presence filter, arrive()
  await h.step('A6 presence filter (?st=presence): only even ids · refresh() applies at once · held-back guests are no arrivals, arrive() makes them one · a throwing rule fails open', async () => {
    const p = await h.page('tv', { tag: 'v-presence' });
    await p.goto(h.url('village.html', V({ st: 'presence' })));
    await ready(p, 'village'); await p.waitForTimeout(1800);
    const all = await guestIds(p), want = all.filter(g => even(g.id)).map(g => g.id).sort();
    h.check('the demo world is not degenerate (some even ids, some odd)', want.length > 3 && want.length < 27, `${want.length}/30`);
    h.eq('A6 villagers = the guests with an even id sum, and the HUD counts them', [await villagersOf(p), parseInt(await p.textContent('#count-n'), 10)], [want.length, want.length]);
    const ev = await evs(p);
    h.eq('village:guests: list = the villagers (sorted ids) · allIds = everybody (30)', [ev['village:guests'].last.list, ev['village:guests'].last.all], [want, 30]);
    await trackBanners(p);
    await cmd(p, 'presence', { op: 'clear' }); await cmd(p, 'refresh');
    h.check('A6 clearPresence() + refresh(): all 30 appear at once', await poll(async () => (await villagersOf(p)) === 30, 3000));
    await p.waitForTimeout(600);
    h.eq('guests that were only held back are no "arrivals": no village:arrived, no banner', [(await evs(p))['village:arrived']?.n || 0, (await banners(p)).length], [0, 0]);
    await cmd(p, 'presence', { op: 'set' }); await cmd(p, 'refresh');
    h.check('A6 the rule again + refresh(): back to the even ids', await poll(async () => (await villagersOf(p)) === want.length, 3000));
    const odd = all.filter(g => !even(g.id)), A = odd[0], B = odd[1];
    await cmd(p, 'arrive', { gid: A.id }); await cmd(p, 'arrive', { gid: B.id, via: 'new' });              // default via = 'checkin'
    await cmd(p, 'presence', { op: 'clear' }); await cmd(p, 'refresh');
    h.check('both marked guests walk in', await poll(async () => (await villagersOf(p)) === 30, 3000));
    h.check('arrive(): exactly the two marked guests are arrivals', await poll(async () => ((await evs(p))['village:arrived']?.n || 0) === 2, 3000));
    h.eq('…with their ids and via (the default is "checkin")', ((await evs(p))['village:arrived'].hist || []).map(e => `${e.gid}:${e.via}`).sort(), [`${A.id}:checkin`, `${B.id}:new`].sort());
    h.check('via "new": the core banner for B comes; via "checkin": none for A (the feature shows its own)', await poll(async () => (await banners(p)).includes(`🎉 ${B.name}님이 마을에 도착했어요!`), 8000) && !(await banners(p)).some(t => t.includes(`🎉 ${A.name}님이`)), JSON.stringify(await banners(p)));
    // a rule that throws: the guest list wins (never an empty village) and the failures count against the feature
    await cmd(p, 'presence', { op: 'clear' }); await cmd(p, 'presence', { op: 'set' }); await cmd(p, 'refresh');
    await poll(async () => (await villagersOf(p)) === want.length, 3000);
    await cmd(p, 'presence', { op: 'clear' }); await cmd(p, 'presence', { op: 'throw' });         // setPresence() judges everybody at once: the rule throws for each guest — the breaker trips inside the call
    h.check('a rule that throws fails open: all 30 are in the village (never an empty one)', await poll(async () => (await countN(p)) === 30, 3000));
    h.check('…and the errors trip the feature (it is switched off, the page goes on)', await until(p, async () => (await (await import('/js/core/features.js')).featureStates()).find(s => s.id === '_selftest')?.tripped === true, null, 8000));
    h.eq('…with the village intact', await countN(p), 30);
    await h.shot(p, 'village-8-presence');
  });

  // ================================================================ A8 + scene across two screens: a TV and a guest's phone in one world
  await h.step('A8 phone: one action inline · two → first + ⋯ · one sheet at a time · quiet chip · scene = same crowd on TV and phone', async () => {
    const ctx = await h.context('phone');                                                        // one device: the TV page uses ?host=1
    const tvh = await h.page(ctx, { tag: 'v-tvhost' });
    await tvh.goto(h.url('village.html', V({ seed: 16, host: 1 }))); await ready(tvh, 'village'); await tvh.waitForTimeout(1200);
    const me = (await guestIds(tvh))[0].id;
    const ph = await h.page(ctx, { tag: 'v-phone' });
    await ph.goto(h.url('village.html', V({ seed: null, me }))); await ready(ph, 'village'); await ph.waitForTimeout(1500);
    const bar = () => ph.evaluate(() => [...document.querySelectorAll('#mremote .fa')].map(b => b.dataset.fa));
    const sheets = () => ph.evaluate(() => ({ visible: [...document.querySelectorAll('.sheet')].filter(s => !s.hidden).map(s => s.id), owner: document.querySelector('#fsheet').dataset.owner || null, bg: !document.querySelector('#sheet-bg').hidden }));
    const audit = async label => { const r = await h.layoutReport(ph); h.check(`${label}: no overlaps · no sideways scroll · tap targets`, r.overlaps.length === 0 && !r.hscroll && r.small.length === 0, JSON.stringify(r).slice(0, 500)); };

    h.eq('remote bar: 5 emotes + 📷 + ONE feature action, inline (no ⋯)', await ph.evaluate(() => [document.querySelectorAll('#mremote .em').length, document.querySelectorAll('#mremote .snap').length, [...document.querySelectorAll('#mremote .fa')].map(b => b.dataset.fa)]), [5, 1, ['f-_selftest-a']]);
    h.eq('the TV (HOST) has no bar: actions are registered but nothing is drawn', await tvh.evaluate(() => document.querySelectorAll('.fa').length), 0);
    await audit('A8 one action');
    await h.shot(ph, 'village-9-phone-one');

    await cmd(ph, 'actions-mode', { mode: 'two' }); await ph.waitForTimeout(200);
    h.eq('A8 two actions → the first inline + "⋯"', await bar(), ['f-_selftest-a', 'more']);
    await audit('A8 two actions (8 buttons)');
    await h.shot(ph, 'village-10-phone-two');
    await ph.click('#mremote .fa.more');
    h.eq('"⋯" opens the shared sheet, owned by the core, listing the second action', [await sheets(), await text(ph, '#fsheet-title'), await ph.$$eval('#fsheet-body .fa-item', b => b.map(x => x.dataset.fa))], [{ visible: ['fsheet'], owner: 'core', bg: true }, '더보기', ['f-_selftest-b']]);
    await ph.waitForTimeout(400);                                                                // let the slide-up animation finish
    await h.shot(ph, 'village-11-phone-more');
    await ph.click('#fsheet-body .fa-item');
    h.eq('choosing it runs the action and closes the sheet', [await num(ph, 'actB'), (await sheets()).visible], [1, []]);
    await ph.click('#mremote .fa[data-fa="f-_selftest-a"]');
    h.eq('the inline action runs and opens the FEATURE\'s sheet (title · body · render() ran)', [await num(ph, 'actA'), (await sheets()).owner, await text(ph, '#fsheet-title'), await visible(ph, '[data-st="sheet-body"]'), await num(ph, 'sheetOpened')], [1, '_selftest', '점검 시트', true, 1]);
    await cmd(ph, 'sheet-open');
    h.eq('A8 one sheet at a time: opening again replaces it (the first one got onClose and its render cleanup)', [(await sheets()).visible, await num(ph, 'sheetOpened'), await num(ph, 'sheetClosed'), await num(ph, 'sheetCleaned')], [['fsheet'], 2, 1, 1]);
    await ph.keyboard.press('Escape');
    h.eq('Esc closes it · onClose + cleanup run · the backdrop goes', [await sheets(), await num(ph, 'sheetClosed'), await num(ph, 'sheetCleaned')], [{ visible: [], owner: null, bg: false }, 2, 2]);
    await cmd(ph, 'sheet-open'); await ph.mouse.click(30, 100);
    h.eq('a click on the backdrop closes it', [(await sheets()).visible, await num(ph, 'sheetClosed')], [[], 3]);
    await cmd(ph, 'sheet-open'); await ph.click('#fsheet-x');
    h.eq('✕ closes it', [(await sheets()).visible, await num(ph, 'sheetClosed'), await num(ph, 'sheetCleaned')], [[], 4, 4]);
    await ph.click('#mremote button.snap'); await ph.waitForTimeout(300);
    h.eq('the photo sheet is open…', (await sheets()).visible, ['snap-sheet']);
    await cmd(ph, 'sheet-open');
    h.eq('…a feature sheet makes it give way (never two sheets)', (await sheets()).visible, ['fsheet']);
    await ph.click('#fsheet-x');

    await cmd(ph, 'actions-mode', { mode: 'none' }); await ph.waitForTimeout(200);
    h.eq('when() = false → the bar has no feature button, nothing else moved', [await bar(), await ph.$$eval('#mremote .em', b => b.length)], [[], 5]);
    await cmd(ph, 'actions-mode', { mode: 'one' }); await ph.waitForTimeout(200);
    h.eq('…and it comes back', await bar(), ['f-_selftest-a']);

    // camFocus on a phone moves the camera (the follow-me camera is overridden for a few seconds)
    const cam0 = (await cmd(ph, 'state')).cam;
    await cmd(ph, 'camfocus', { x: 60, y: 60, sec: 2 }); await ph.waitForTimeout(900);
    const cam1 = (await cmd(ph, 'state')).cam;
    h.check('camFocus pans the phone\'s camera', Math.abs(cam1.x - cam0.x) + Math.abs(cam1.y - cam0.y) > 5, JSON.stringify([cam0, cam1]));

    // quiet chip on the phone, not on the TV
    const admin = await adminPage(h, ctx);
    await setLive(h, admin, { quiet: true });
    h.check('A5 phone: the chip "본식 진행 중이에요" shows under quiet mode', await until(ph, () => { const c = document.querySelector('#quiet-chip'); return !c.hidden && getComputedStyle(c).display !== 'none' && c.textContent.includes('본식 진행 중이에요'); }, null, 6000));
    h.check('A5 phone: the feature\'s top-centre item steps down under the chip — they never overlap and both stay on the screen', await ph.evaluate(() => { const a = document.querySelector('#quiet-chip').getBoundingClientRect(), b = document.querySelector('[data-st="hud-tc"]').getBoundingClientRect(); const hit = !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top); return !hit && b.width > 20 && b.right <= innerWidth && b.bottom <= innerHeight; }));
    h.eq('A5 TV page: no chip', await tvh.evaluate(() => getComputedStyle(document.querySelector('#quiet-chip')).display), 'none');
    await audit('A5 phone with the quiet chip');
    await h.shot(ph, 'village-12-phone-quiet');
    await setLive(h, admin, { quiet: false });
    h.check('…and it goes when quiet ends', await until(ph, () => document.querySelector('#quiet-chip').hidden, null, 6000));

    // scene: both screens run the same scene — same seed → the same six villagers (one after the other: a page in the background gets no frames)
    await tvh.bringToFront(); await cmd(tvh, 'scene');
    h.check('the scene ends on the TV page', await poll(async () => !!(await badge(tvh)).sceneEnd, 9000));
    await ph.bringToFront(); await cmd(ph, 'scene');
    h.check('the scene ends on the phone page', await poll(async () => !!(await badge(ph)).sceneEnd, 9000));
    const sc = [JSON.parse((await badge(tvh)).scene).crowd, JSON.parse((await badge(ph)).scene).crowd];
    h.check('scene: the same seed picks the same six villagers on the TV and on the phone', sc[0].length === 6 && JSON.stringify(sc[0]) === JSON.stringify(sc[1]), JSON.stringify(sc));
    h.eq('village:event goes out on both screens (start + end)', await Promise.all([tvh, ph].map(async q => ((await evs(q))['village:event'].hist || []).map(e => e.stage).join('>'))), ['start>end', 'start>end']);
  });

  // ================================================================ A8: a phone without a guestbook entry
  await h.step('A8 ME-less phone: the feature button sits right of the sign-in link — also at 320 · 375 px and in landscape; the 8-button bar fits too', async () => {
    const phones = [['390', 'phone'], ['375', 'phoneSE'], ['320', { viewport: { width: 320, height: 640 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }], ['landscape 844', 'phoneLandscape']];
    for (const [label, preset] of phones) {
      const ctx = await h.context(preset);
      const q = await h.page(ctx, { tag: `v-meless-${label.replace(/\W/g, '')}` });
      await q.goto(h.url('village.html', V({ seed: 12 }))); await ready(q, 'village'); await q.waitForTimeout(1300);
      const g = await q.evaluate(() => {
        const a = document.querySelector('#mremote a.sign'), f = document.querySelector('#mremote .fa'); if (!a || !f) return null;
        const ar = a.getBoundingClientRect(), fr = f.getBoundingClientRect();
        return { link: [Math.round(ar.left), Math.round(ar.right), Math.round(ar.top), Math.round(ar.bottom)], fa: [Math.round(fr.left), Math.round(fr.right), Math.round(fr.top), Math.round(fr.bottom)], w: Math.round(fr.width), h: Math.round(fr.height), vw: innerWidth };
      });
      h.check(`A8 ${label}: sign-in link + ONE feature button, the button right of the link on the same row`, !!g && g.fa[0] >= g.link[1] - 1 && Math.min(g.fa[3], g.link[3]) - Math.max(g.fa[2], g.link[2]) > 20 && g.fa[1] <= g.vw, JSON.stringify(g));
      h.check(`A8 ${label}: the feature button is at least a finger wide (≥ 44 px)`, !!g && g.w >= 44 && g.h >= 44, JSON.stringify(g));
      let r = await h.layoutReport(q);
      h.check(`A8 ${label} ME-less: no overlaps · no sideways scroll · tap targets`, r.overlaps.length === 0 && !r.hscroll && r.small.length === 0, JSON.stringify(r).slice(0, 500));
      if (label === '390') await h.shot(q, 'village-13-meless-phone');
      // now as a guest with a guestbook entry and two actions: 5 emotes + 📷 + inline + ⋯ = 8 buttons
      const me = (await guestIds(q))[0].id;
      await q.goto(h.url('village.html', V({ seed: null, me }))); await ready(q, 'village'); await q.waitForTimeout(1200);
      await cmd(q, 'actions-mode', { mode: 'two' }); await q.waitForTimeout(250);
      r = await h.layoutReport(q);
      h.eq(`A8 ${label}: 8 buttons on the bar`, await q.evaluate(() => document.querySelectorAll('#mremote button').length), 8);
      h.check(`A8 ${label} with 8 buttons: no overlaps · no sideways scroll · tap targets`, r.overlaps.length === 0 && !r.hscroll && r.small.length === 0, JSON.stringify(r).slice(0, 500));
      if (label === '320') await h.shot(q, 'village-14-bar-320');
    }
  });

  // ================================================================ A12: a second owner of a one-feature slot
  await h.step('A12 owner-conflict: while _selftest holds the presence slot a second feature claiming it fails — _selftest keeps working', async () => {
    const p = await h.page('tv', { tag: 'v-rival' });
    // a fake second feature "uxrival": it waits until _selftest surely holds the slot, then asks for it too
    await p.route('**/js/features/uxrival/index.js', route => route.fulfill({ contentType: 'text/javascript', body: 'export const i18n = { ko: {}, en: {} }; export async function setup(ctx) { await new Promise(r => setTimeout(r, 700)); ctx.v.setPresence(() => true); }' }));
    await p.route('**/js/features/index.js', async route => {
      const res = await route.fetch(), body = await res.text(), at = body.lastIndexOf('];');
      if (at < 0) throw new Error('features/index.js changed: no closing ] found');
      await route.fulfill({ response: res, body: body.slice(0, at) + "  F('uxrival', 'WP-00c', 'rival', 'rival', ['village'], ALL, { liveSafe: true, default: false }),\n" + body.slice(at) });
    });
    await p.goto(h.url('village.html', V({ ff: '_selftest,uxrival,-prereg', st: 'presence' })));   // prereg (ready, on by default) also asks for the presence slot
    await ready(p, 'village');
    const all = await (async () => { await p.waitForTimeout(2600); return guestIds(p); })();
    const want = all.filter(g => even(g.id)).length;
    const rival = await featureState(p, 'uxrival'), mine = await featureState(p, '_selftest');
    h.check('A12 the second claimant fails with owner-conflict (its setup threw, it is off)', rival && !rival.on && /owner-conflict|already used/.test(rival.lastError || ''), JSON.stringify(rival));
    h.check('A12 _selftest is still on, not tripped, no error counted — and keeps the slot', mine.on && !mine.tripped && mine.errors === 0, JSON.stringify(mine));
    h.eq('A12 the presence rule of the owner still applies (only even ids in the village)', [await villagersOf(p), await countN(p)], [want, want]);
    h.eq('the rival left nothing on the page', (await footprint(p, 'uxrival')), { nodes: 0, links: 0, styles: 0 });
  });

  // ================================================================ A13: the first sync waits for the gate features
  await h.step('A13 gate: the first village:guests comes only after a gate feature\'s setup is done (?st=gate = a 2-second setup)', async () => {
    const p = await h.page('tv', { tag: 'v-gate' });
    await p.goto(h.url('village.html', V({ st: 'gate' })));
    await ready(p, 'village'); await p.waitForTimeout(300);
    h.eq('while the gate feature is still setting up the village is the empty v3.2 one (no guest yet)', [await countN(p), (await evs(p))['village:guests']?.n || 0], [0, 0]);
    h.check('the gate feature\'s setup ends (≈ 2 s)', await until(p, () => !!document.querySelector('[data-st="badge"]').dataset.gateDone, null, 6000));
    h.check('…and then the village fills (30 villagers)', await poll(async () => (await countN(p)) === 30, 5000));
    const b = await badge(p), g = (await evs(p))['village:guests'], start = Number(b.gateStart), done = Number(b.gateDone);
    h.check('the gate feature really took ~2 s (the test is meaningful)', done - start >= 1900, `${start} → ${done}`);
    h.check('A13 first village:guests (a live one, not a replay) came AFTER the gate setup finished', g.first >= done && !g.replay, `first ${g.first} · gate done ${done} · replay ${g.replay}`);
    h.eq('…exactly once for the first sync, with everybody in', [g.last.list.length, g.last.all], [30, 30]);
    const lastReady = (await evs(p))['village:ready'];
    h.check('village:ready also came after the gate (first sync done)', lastReady.first >= done, JSON.stringify(lastReady));
  });
}

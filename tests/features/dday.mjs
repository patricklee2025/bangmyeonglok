// ============================================================
//  WP-03 dday — docs/v4/wp/WP-03-dday.md · 04-testing §4.1 (S1–S9) + A1–A6
//  The pre-wedding village: construction props that follow the days left, the D-day board, TV panel / phone chip, welcome chip.
//  Dates are pinned with Playwright's clock at LOCAL NOON (WP-03 §7 A2) — a UTC-midnight date would be off by one at the boundary.
// ============================================================
import fs from 'node:fs';
import path from 'node:path';
import { REPO } from '../lib/harness.mjs';
import { on, off, adminPage, setFlag, expectClean, footprint, expectDefault } from '../lib/v4.mjs';

const ID = 'dday';
export const meta = { title: 'dday: the pre-wedding village counts down — stage props, D-day board, TV panel, phone chip, welcome chip', timeout: 420000, tags: ['slow'] };

const HANGUL = /[ㄱ-힝]/;
const MIN_FPS = +(process.env.PERF_MIN_FPS || 24);
const PRE = { phase: null };                         // no ?phase= → the phase follows the (pinned) clock
const STAGES = [                                     // WP-03 §7 A2 — local noon (EST −05:00 until 3/14, EDT −04:00 after)
  { at: '2026-12-01T12:00:00-05:00', n: 130, stage: 0, props: 'sign wip scaffold scaffold crate crate crate' },
  { at: '2027-02-15T12:00:00-05:00', n: 54, stage: 1, props: 'sign wip scaffold crate crate ladder' },
  { at: '2027-03-20T12:00:00-04:00', n: 21, stage: 2, props: 'sign crate pennants' },
  { at: '2027-04-05T12:00:00-04:00', n: 5, stage: 3, props: 'sign pot pot pot pot pennants' },
  { at: '2027-04-09T12:00:00-04:00', n: 1, stage: 4, props: 'sign pot pot pot pot banner pennants' },
];

/** poll a page predicate (sync or async — waitForFunction would take an async function's promise as "true") */
const until = async (page, fn, arg, ms = 8000) => { const t0 = Date.now(); do { if (await page.evaluate(fn, arg).catch(() => false)) return true; await page.waitForTimeout(100); } while (Date.now() - t0 < ms); return false; };
/** a page whose Date is pinned (timers and animation frames keep running) */
async function pinned(h, ctx, at, tag) { const p = await h.page(ctx, { tag }); await p.clock.setFixedTime(new Date(at)); return p; }
const hudState = (p, sel) => p.evaluate(sel => { const e = document.querySelector(sel); return e && { stage: +e.dataset.stage, n: +e.dataset.n, props: e.dataset.props, text: e.textContent, zone: e.parentElement?.className || '' }; }, sel);
const panelParts = p => p.evaluate(() => { const q = s => document.querySelector('.f-dday-panel ' + s)?.textContent || ''; return { title: q('.f-dday-title'), big: q('.f-dday-big'), date: q('.f-dday-date'), res: q('.f-dday-res') }; });
/** pixels of the world canvas (480×272 = world px) that have exactly this colour inside a world rectangle */
const colourIn = (p, [x, y, w, h], hex) => p.evaluate(([x, y, w, h, hex]) => {
  const d = document.querySelector('#world').getContext('2d').getImageData(x, y, w, h).data;
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] === r && d[i + 1] === g && d[i + 2] === b) n++;
  return n;
}, [x, y, w, h, hex]);
const box = (p, sel) => p.evaluate(sel => { const r = document.querySelector(sel)?.getBoundingClientRect(); return r && r.width && r.height ? { l: r.left, t: r.top, r: r.right, b: r.bottom } : null; }, sel);
const hit = (a, b) => !!a && !!b && a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;

export default async (h) => {
  // ---------------------------------------------------------------- S1 off = no trace
  await h.step('S1 off: no trace on the guest page, the TV and the phone village (pre); the core still works', async () => {
    const tvc = await h.context('tv');
    const tv = await pinned(h, tvc, STAGES[0].at, 'off-tv');
    await tv.goto(h.url('village.html', { ...PRE, ff: off(ID), seed: 6, time: 'day' }));
    await until(tv, () => /^\d+$/.test(document.querySelector('#count-n')?.textContent || ''));
    await tv.waitForTimeout(800);
    await expectClean(h, tv, ID, 'S1 TV village');
    h.eq('S1 the TV village is in pre by the clock and counts 6 guests', await tv.evaluate(() => [document.documentElement.dataset.phase, document.querySelector('#count-n').textContent]), ['pre', '6']);
    await tvc.close();
    const pc = await h.context('phone');
    const p = await pinned(h, pc, STAGES[0].at, 'off-phone');
    await p.goto(h.url('index.html', { ...PRE, ff: off(ID, 'prereg') })); await p.waitForTimeout(800);   // prereg (default on) also uses the welcome slot in pre
    await expectClean(h, p, ID, 'S1 guest page');
    h.check('S1 the welcome slot is empty (dday and prereg off)', await p.evaluate(() => document.querySelector('#slot-welcome').children.length === 0));
    await p.goto(h.url('village.html', { ...PRE, ff: off(ID), seed: 6 })); await p.waitForTimeout(1200);
    await expectClean(h, p, ID, 'S1 phone village');
    await pc.close();
  });

  // ---------------------------------------------------------------- A2 the five dates → stage + props + D-n (TV)
  for (const s of STAGES) {
    await h.step(`A2 ${s.at} → D-${s.n} · stage ${s.stage}`, async () => {
      const ctx = await h.context('tv');
      const tv = await pinned(h, ctx, s.at, `tv-${s.stage}`);
      await tv.goto(h.url('village.html', { ...PRE, ff: on(ID), seed: 6, time: 'day' }));
      h.check(`A2 D-${s.n}: the TV panel is up`, await until(tv, () => !!document.querySelector('.f-dday-panel[data-stage]')));
      const st = await hudState(tv, '.f-dday-panel');
      h.eq(`A2 D-${s.n}: days left · stage`, [st?.n, st?.stage], [s.n, s.stage]);
      h.eq(`A2 D-${s.n}: the stage's props (WP-03 §3)`, st?.props, s.props);
      const parts = await panelParts(tv);
      h.eq(`A2 D-${s.n}: the big line`, parts.big, s.stage === 4 ? '내일 만나요! 🎉' : `D-${s.n}`);
      await tv.waitForTimeout(600);
      await h.shot(tv, `dday-${s.stage}-tv-D${s.n}`);
      await ctx.close();
    });
  }

  // ---------------------------------------------------------------- A2 the props are really on the world canvas (pixel colours)
  await h.step('A2 the props are drawn on the world: scaffold steel at stage 0, gone at stage 2; pennants from stage 2; pots at stage 3', async () => {
    const ctx = await h.context('tv');
    const look = async at => {
      const tv = await pinned(h, ctx, at, 'pixels');
      await tv.goto(h.url('village.html', { ...PRE, ff: on(ID), time: 'day' }));   // no villagers: nobody walks in front of a prop
      await until(tv, () => !!document.querySelector('.f-dday-panel[data-stage]')); await tv.waitForTimeout(700);
      const r = {
        steel: await colourIn(tv, [286, 14, 24, 48], '#5a5f6c'),           // the right scaffold's uprights
        pennant: await colourIn(tv, [108, 140, 136, 16], '#4f6fd1'),       // a blue pennant over the plaza
        pot: await colourIn(tv, [206, 60, 84, 52], '#c4614a'),             // terracotta pots beside the carpet
      };
      await tv.close();
      return r;
    };
    const s0 = await look(STAGES[0].at), s2 = await look(STAGES[2].at), s3 = await look(STAGES[3].at);
    h.check('A2 stage 0: scaffold steel on the world', s0.steel > 20, JSON.stringify(s0));
    h.check('A2 stage 0: no pennants, no pots yet', s0.pennant === 0 && s0.pot === 0, JSON.stringify(s0));
    h.check('A2 stage 2: the scaffold is gone and the pennants are up', s2.steel === 0 && s2.pennant > 10, JSON.stringify(s2));
    h.check('A2 stage 3: pots beside the carpet', s3.pot > 40, JSON.stringify(s3));
    await ctx.close();
  });

  // ---------------------------------------------------------------- A2 the 10-minute recheck swaps the set when the count crosses a boundary
  await h.step('A2 recheck: D-31 → D-30 while the page is open swaps stage 1 for stage 2 (no reload)', async () => {
    const ctx = await h.context('tv');
    const tv = await h.page(ctx, { tag: 'recheck' });
    await tv.clock.install({ time: new Date('2027-03-11T09:55:00Z') });            // live start 2027-04-10T10:00Z − 30 days − 5 min
    await tv.goto(h.url('village.html', { ...PRE, ff: on(ID), seed: 4, time: 'day' }));
    await until(tv, () => !!document.querySelector('.f-dday-panel[data-stage]'));
    const a = await hudState(tv, '.f-dday-panel');
    await tv.clock.fastForward(10 * 60e3 + 1000);
    const changed = await until(tv, () => document.querySelector('.f-dday-panel')?.dataset.stage === '2', null, 5000);
    const b = await hudState(tv, '.f-dday-panel');
    h.eq('A2 before: D-31 · stage 1', [a?.n, a?.stage], [31, 1]);
    h.check('A2 after 10 minutes: D-30 · stage 2 with the stage-2 props', changed && b?.n === 30 && b?.props === STAGES[2].props, JSON.stringify(b));
    await ctx.close();
  });

  // ---------------------------------------------------------------- A3 where the words are: TV tl panel · phone tc chip · welcome chip (order 1)
  await h.step('A3 TV: panel in the tl zone — 결혼식까지 / D-130 / 2027.04.10 (토) / 입주민 6명', async () => {
    const ctx = await h.context('tv');
    const tv = await pinned(h, ctx, STAGES[0].at, 'a3-tv');
    await tv.goto(h.url('village.html', { ...PRE, ff: on(ID), seed: 6, time: 'day' }));
    await until(tv, () => /입주민 6명/.test(document.querySelector('.f-dday-res')?.textContent || ''));
    const st = await hudState(tv, '.f-dday-panel');
    h.check('A3 the panel sits in the tl zone', /\bhz-tl\b/.test(st?.zone || ''), st?.zone);
    h.eq('A3 the panel lines', await panelParts(tv), { title: '결혼식까지', big: 'D-130', date: '2027.04.10 (토)', res: '입주민 6명' });
    h.eq('A3 no phone chip on the TV', await tv.$$eval('.f-dday-chip', n => n.length), 0);
    const lv = await box(tv, '.lvpanel'), pn = await box(tv, '.f-dday-panel');
    h.check('A3 the panel is under the level panel, not on it', !!pn && !hit(lv, pn) && pn.t >= lv.b - 1, JSON.stringify({ lv, pn }));
    await h.shot(tv, 'dday-a3-tv-panel');
    await ctx.close();
  });

  await h.step('A3 phone: one line in the tc zone — "D-130 · 입주민 6명"; nothing to tap', async () => {
    const ctx = await h.context('phone');
    const p = await pinned(h, ctx, STAGES[0].at, 'a3-phone');
    await p.goto(h.url('village.html', { ...PRE, ff: on(ID), seed: 6 }));
    await until(p, () => /입주민 6명/.test(document.querySelector('.f-dday-chip')?.textContent || ''));
    const st = await hudState(p, '.f-dday-chip');
    h.check('A3 the chip sits in the tc zone', /\bhz-tc\b/.test(st?.zone || ''), st?.zone);
    h.eq('A3 the chip text', st?.text, 'D-130 · 입주민 6명');
    h.eq('A3 no TV panel on the phone', await p.$$eval('.f-dday-panel', n => n.length), 0);
    h.eq('A3 the chip is not a tap target', await p.evaluate(() => getComputedStyle(document.querySelector('.f-dday-chip')).pointerEvents), 'none');
    await p.waitForTimeout(500);
    await h.shot(p, 'dday-a3-phone-chip');
    await ctx.close();
  });

  await h.step('A3 guest page: welcome chip "💒 결혼식까지 D-130" first in the welcome slot (order 1)', async () => {
    const ctx = await h.context('phone');
    const p = await pinned(h, ctx, STAGES[0].at, 'a3-guest');
    await p.goto(h.url('index.html', { ...PRE, ff: on(ID) }));
    await until(p, () => !!document.querySelector('#slot-welcome .f-dday-welcome'));
    h.eq('A3 welcome chip text', await p.textContent('#slot-welcome .f-dday-welcome'), '💒 결혼식까지 D-130');
    h.eq('A3 …at order 1, first in the slot', await p.evaluate(() => { const e = document.querySelector('#slot-welcome .f-dday-welcome'); return [e.dataset.order, e === document.querySelector('#slot-welcome').firstElementChild]; }), ['1', true]);
    const hero = await box(p, '.hero, #s-welcome .card'), chip = await box(p, '.f-dday-welcome'), start = await box(p, '#btn-start');
    h.check('A3 the chip sits between the hero card and the start button', !!chip && (!hero || chip.t >= hero.b - 1) && (!start || chip.b <= start.t + 1), JSON.stringify({ hero, chip, start }));
    await h.shot(p, 'dday-a3-welcome');
    // D-1 says "see you tomorrow" instead of a number
    await p.clock.setFixedTime(new Date(STAGES[4].at)); await p.reload();
    await until(p, () => !!document.querySelector('#slot-welcome .f-dday-welcome'));
    h.eq('A3 D-1 welcome chip', await p.textContent('#slot-welcome .f-dday-welcome'), '💒 내일 만나요! 🎉');
    await ctx.close();
  });

  // ---------------------------------------------------------------- A4 / S4 gates: live · after → not loaded; kiosk · admin pages → not loaded
  await h.step('A4 / S4 ?phase=live (and after) → not loaded anywhere; kiosk and admin never load it', async () => {
    const ctx = await h.context('tv');
    for (const phase of ['live', 'after']) {
      const tv = await pinned(h, ctx, STAGES[0].at, `gate-${phase}`);
      await tv.goto(h.url('village.html', { phase, ff: on(ID), seed: 4, time: 'day' }));
      await until(tv, () => /^\d+$/.test(document.querySelector('#count-n')?.textContent || '')); await tv.waitForTimeout(1000);
      await expectClean(h, tv, ID, `A4 TV village ?phase=${phase}`);
      await tv.close();
    }
    const g = await pinned(h, ctx, STAGES[0].at, 'gate-guest');
    await g.goto(h.url('index.html', { phase: 'live', ff: on(ID) })); await g.waitForTimeout(1000);
    await expectClean(h, g, ID, 'A4 guest page ?phase=live');
    await g.goto(h.url('kiosk.html', { ...PRE, ff: on(ID) })); await g.waitForTimeout(1000);
    await expectClean(h, g, ID, 'S4 kiosk (not in the manifest pages)');
    await g.close();
    const a = await adminPage(h, ctx, { params: { ...PRE, ff: on(ID) } }); await a.waitForTimeout(600);
    await expectClean(h, a, ID, 'S4 admin page (not in the manifest pages)');
    await ctx.close();
  });

  // ---------------------------------------------------------------- S5 phase flips to live while the TV is open → the feature disposes itself
  await h.step('S5 the clock reaches 06:00 on the day while the TV is open → props and panel go away (phase gate)', async () => {
    const ctx = await h.context('tv');
    const tv = await h.page(ctx, { tag: 'flip' });
    await tv.clock.install({ time: new Date('2027-04-10T09:59:30Z') });           // 05:59:30 local on the day: still pre, D-1
    await tv.goto(h.url('village.html', { ...PRE, ff: on(ID), seed: 4, time: 'day' }));
    await until(tv, () => !!document.querySelector('.f-dday-panel[data-stage]'));
    const before = await hudState(tv, '.f-dday-panel');
    h.eq('S5 05:59 on the day: stage 4 "see you tomorrow"', [before?.stage, before?.n], [4, 1]);
    await tv.clock.fastForward(5 * 60e3);
    const gone = await until(tv, () => !document.querySelector('[data-f="dday"]:not(link)') && document.documentElement.dataset.phase === 'live', null, 8000);
    h.check('S5 after 06:00 the phase is live and the panel is gone', gone, await tv.evaluate(() => document.documentElement.dataset.phase));
    await tv.waitForTimeout(400);
    await expectClean(h, tv, ID, 'S5 after the flip');
    await ctx.close();
  });

  // ---------------------------------------------------------------- S3 hot toggle (admin flag — beta is off by default)
  await h.step('S3 hot toggle: manifest default → admin on → appears without reload → off → gone → on again', async () => {
    const world = await h.context('laptop');
    const tv = await pinned(h, world, STAGES[1].at, 'hot');
    await tv.goto(h.url('village.html', { ...PRE, seed: 5, time: 'day' }));
    await until(tv, () => /^\d+$/.test(document.querySelector('#count-n')?.textContent || '')); await tv.waitForTimeout(800);
    await expectDefault(h, tv, ID, 'S3 default (no ?ff, no admin flag)');
    const admin = await adminPage(h, world, { params: PRE });
    await setFlag(h, admin, ID, true);
    h.check('S3 on: the panel appears without reload', await until(tv, () => !!document.querySelector('.f-dday-panel[data-stage="1"]')));
    await setFlag(h, admin, ID, false);
    await until(tv, () => !document.querySelector('[data-f="dday"]:not(link)'));
    await tv.waitForTimeout(300);
    await expectClean(h, tv, ID, 'S3 after off');
    h.check('S3 after off: no dday prop on the world (no scaffold steel)', await colourIn(tv, [286, 14, 24, 48], '#5a5f6c') === 0);
    await setFlag(h, admin, ID, true);
    const back = await until(tv, () => document.querySelector('.f-dday-panel')?.dataset.props === 'sign wip scaffold crate crate ladder');
    h.check('S3 on again: the panel is back with the stage-1 props, once (no duplicate panel)', back && await tv.$$eval('.f-dday-panel', n => n.length) === 1, JSON.stringify(await footprint(tv, ID)));
    await setFlag(h, admin, ID, null);
    await world.close();
  });

  // ---------------------------------------------------------------- S6 English
  await h.step('S6 English: TV panel, phone chip, welcome chip — no Hangul', async () => {
    const ctx = await h.context('tv');
    const tv = await pinned(h, ctx, STAGES[0].at, 'en-tv');
    await tv.addInitScript(() => localStorage.setItem('wgb_lang', 'en'));
    await tv.goto(h.url('village.html', { ...PRE, ff: on(ID), seed: 6, time: 'day' }));
    await until(tv, () => /residents/.test(document.querySelector('.f-dday-res')?.textContent || ''));
    const parts = await panelParts(tv);
    h.eq('S6 TV panel in English', parts, { title: 'Until the wedding', big: 'D-130', date: 'Sat, Apr 10, 2027', res: '6 residents' });
    await h.shot(tv, 'dday-s6-tv-en');
    await ctx.close();
    const pc = await h.context('phone');
    const p = await pinned(h, pc, STAGES[0].at, 'en-phone');
    await p.addInitScript(() => localStorage.setItem('wgb_lang', 'en'));
    await p.goto(h.url('village.html', { ...PRE, ff: on(ID), seed: 6 }));
    await until(p, () => /residents/.test(document.querySelector('.f-dday-chip')?.textContent || ''));
    h.eq('S6 phone chip in English', await p.textContent('.f-dday-chip'), 'D-130 · 6 residents');
    await p.goto(h.url('index.html', { ...PRE, ff: on(ID) }));
    await until(p, () => !!document.querySelector('.f-dday-welcome'));
    const w = await p.textContent('.f-dday-welcome');
    h.check('S6 welcome chip in English', w === '💒 130 days to go' && !HANGUL.test(w), w);
    // the language switch relabels a page that is already open
    await p.click('.lang [data-lang=ko]'); await p.waitForTimeout(300);
    h.eq('S6 switching to 한국어 relabels the chip', await p.textContent('.f-dday-welcome'), '💒 결혼식까지 D-130');
    await pc.close();
  });

  // ---------------------------------------------------------------- S7 data contract: none
  await h.step('S7 no data: the feature never touches ctx.db (WP-03: 데이터 없음)', async () => {
    const dir = path.join(REPO, 'public/js/features', ID);
    const src = fs.readdirSync(dir).filter(f => f.endsWith('.js')).map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
    h.check('S7 no ctx.db / localStorage in the feature source', !/ctx\.db\b|localStorage/.test(src));
  });

  // ---------------------------------------------------------------- edge cases (WP-03 §6)
  await h.step('§6 edges: 0 guests → 입주민 0명 · forced ?phase=pre after the day → stage 4 "see you tomorrow" (never D-0)', async () => {
    const ctx = await h.context('tv');
    const tv = await pinned(h, ctx, STAGES[2].at, 'edge-zero');
    await tv.goto(h.url('village.html', { ...PRE, ff: on(ID), time: 'day' }));
    await until(tv, () => !!document.querySelector('.f-dday-res')?.textContent);
    h.eq('§6 no guests: 입주민 0명', (await panelParts(tv)).res, '입주민 0명');
    await tv.close();
    const late = await pinned(h, ctx, '2027-04-12T12:00:00-04:00', 'edge-late');
    await late.goto(h.url('village.html', { phase: 'pre', ff: on(ID), seed: 3, time: 'day' }));
    await until(late, () => !!document.querySelector('.f-dday-panel[data-stage]'));
    const st = await hudState(late, '.f-dday-panel');
    h.check('§6 after the day with ?phase=pre: stage 4 and "내일 만나요! 🎉" (no D-0 / D--1)', st?.stage === 4 && (await panelParts(late)).big === '내일 만나요! 🎉' && !/D-(0|-)/.test(st?.text || ''), JSON.stringify(st));
    await ctx.close();
  });

  // ---------------------------------------------------------------- A5 / S8 layout
  for (const k of ['phoneSE', 'phoneLandscape', 'phone']) {
    await h.step(`A5 / S8 layout ${k}: the phone chip clears the level panel and the ⛶ buttons`, async () => {
      const ctx = await h.context(k);
      const p = await pinned(h, ctx, STAGES[0].at, `layout-${k}`);
      await p.goto(h.url('village.html', { ...PRE, ff: on(ID), seed: 12 }));
      await until(p, () => !!document.querySelector('.f-dday-chip')?.textContent);
      await p.waitForTimeout(600);
      const chip = await box(p, '.f-dday-chip'), lv = await box(p, '.lvpanel'), mctl = await box(p, '.mctl');
      h.check(`A5 ${k}: the chip is on screen`, !!chip && chip.l >= 0 && chip.t >= 0, JSON.stringify(chip));
      h.check(`A5 ${k}: chip × level panel — no overlap`, !hit(chip, lv), JSON.stringify({ chip, lv }));
      h.check(`A5 ${k}: chip × ⛶ buttons — no overlap`, !hit(chip, mctl), JSON.stringify({ chip, mctl }));
      const r = await h.layoutReport(p);
      h.check(`S8 ${k}: no overlaps`, !r.overlaps.length, r.overlaps.join(' | '));
      await h.shot(p, `dday-layout-${k}`);
      await ctx.close();
    });
  }
  await h.step('S8 layout: TV 1920×1080 and the guest page on phoneSE', async () => {
    const ctx = await h.context('tv');
    const tv = await pinned(h, ctx, STAGES[3].at, 'layout-tv');
    await tv.goto(h.url('village.html', { ...PRE, ff: on(ID), seed: 30, time: 'day' }));
    await until(tv, () => !!document.querySelector('.f-dday-panel[data-stage]')); await tv.waitForTimeout(800);
    let r = await h.layoutReport(tv);
    h.check('S8 TV: no overlaps', !r.overlaps.length, r.overlaps.join(' | '));
    const pn = await box(tv, '.f-dday-panel'), zone = await box(tv, '.hz-tl');
    h.check('S8 TV: the panel fits its zone (not clipped)', !!pn && !!zone && pn.b <= zone.b + 1, JSON.stringify({ pn, zone }));
    await ctx.close();
    const pc = await h.context('phoneSE');
    const p = await pinned(h, pc, STAGES[0].at, 'layout-guest');
    await p.goto(h.url('index.html', { ...PRE, ff: on(ID) }));
    await until(p, () => !!document.querySelector('.f-dday-welcome'));
    r = await h.layoutReport(p);
    h.check('S8 guest page phoneSE: no overlaps', !r.overlaps.length, r.overlaps.join(' | '));
    h.check('S8 guest page phoneSE: the start button is still above the fold', await p.evaluate(() => document.querySelector('#btn-start').getBoundingClientRect().bottom <= innerHeight));
    await h.shot(p, 'dday-layout-guest-phoneSE');
    await pc.close();
  });

  // ---------------------------------------------------------------- A6 perf: props on vs off, 50 villagers, night
  await h.step(`A6 perf: TV with 50 villagers at night — props on ≥ 95 % of off (and ≥ ${MIN_FPS} fps)`, async () => {
    const ctx = await h.context('tv');
    const measure = async ff => {
      const tv = await h.page(ctx, { tag: 'fps-' + ff, fps: true });
      await tv.clock.setFixedTime(new Date(STAGES[4].at));                      // stage 4 = the most props (pots, banner, pennants)
      await tv.goto(h.url('village.html', { ...PRE, ff, seed: 50, time: 'night' }));
      await until(tv, () => /^\d+$/.test(document.querySelector('#count-n')?.textContent || '')); await tv.waitForTimeout(2500);
      await tv.evaluate(() => window.__fps.reset()); await tv.waitForTimeout(4000);
      const m = await tv.evaluate(() => window.__fps.frames / ((performance.now() - window.__fps.since) / 1000));
      if (ff === on(ID)) await h.shot(tv, 'dday-a6-night');
      await tv.close();
      return m;
    };
    // interleaved, best of two each — the runner shares the machine with other suites
    const offs = [], ons = [];
    for (let i = 0; i < 2; i++) { offs.push(await measure(off(ID))); ons.push(await measure(on(ID))); }
    const o = Math.max(...offs), n = Math.max(...ons);
    h.check(`A6 ≥ ${MIN_FPS} fps with the props`, n >= MIN_FPS, `${n.toFixed(1)} fps`);
    h.check('A6 drop < 5 % versus off (best of two)', n >= o * 0.95, `off ${offs.map(x => x.toFixed(1)).join('/')} · on ${ons.map(x => x.toFixed(1)).join('/')}`);
    await ctx.close();
  });
};

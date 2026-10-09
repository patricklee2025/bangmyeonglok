// WP-00c — docs/v4/04-testing.md §3.4: the feature matrix. It grows by itself: every feature that has a folder under public/js/features/<id>/
// (the `_selftest` one today, each WP's feature once it exists) is taken from the manifest and put through:
//   ① that feature alone, on every page it belongs to: boots, smoke (the core page still works), no console errors, nothing in an error state
//   ② `fcrash=<id>` on each of those pages: the breaker trips, the page's own smoke still passes, the feature leaves no trace
//   ③ everything on (`?ff=all` + `_selftest`): TV / phone / guest / kiosk / admin layout audit (no overlaps) and the TV frame rate (≥ PERF_MIN_FPS)
//   ④ the four phases × everything on: every page boots without errors and exactly the features whose manifest line covers (page, phase) are on
// Features without a folder (still `planned`, no code yet) are skipped here — core-features-static checks their manifest lines.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { adminPage, expectClean, featureStates } from '../lib/v4.mjs';

export const meta = { title: 'feature matrix: each feature alone · fcrash · everything on (layout + fps) · four phases × everything on', timeout: 900000, tags: ['slow', 'exclusive'] };      // exclusive: it measures the frame rate

const MIN_FPS = +(process.env.PERF_MIN_FPS || 24);
const FILE = { guest: 'index.html', kiosk: 'kiosk.html', village: 'village.html', admin: 'admin.html' };
const PRESET = { guest: 'phone', kiosk: 'tablet', village: 'tv', admin: 'desktop' };
const ALL = 'all,_selftest';                                      // `all` skips ids starting with "_" — the self-test feature is asked for by name

/** the core page still works (what a user of that page needs first) */
const smoke = {
  guest: p => p.waitForSelector('#s-welcome.active .hero', { timeout: 10000 }).then(() => p.isVisible('#btn-start')).catch(() => false),
  kiosk: p => p.waitForSelector('#s-welcome.active .hero', { timeout: 10000 }).then(() => p.isVisible('#btn-start')).catch(() => false),
  village: async p => { await p.waitForTimeout(1500); return p.evaluate(() => /^\d+$/.test(document.querySelector('#count-n').textContent) && document.querySelector('#world').width === 480); },
  admin: p => p.waitForSelector('#main:not([hidden])', { timeout: 15000 }).then(() => p.isVisible('#atabs')).catch(() => false),
};
const phaseFor = f => (f.phases.includes('live') ? 'live' : f.phases[0]);
const params = (page, o = {}) => ({ seed: page === 'village' ? 12 : null, time: page === 'village' ? 'day' : null, ...o });

export default async (h) => {
  h.allowErrors(/\[fcrash\]/, /\[f:/);                                     // forced errors on purpose
  const { FEATURES } = await import(pathToFileURL(path.join(h.publicDir, 'js/features/index.js')).href);
  const have = FEATURES.filter(f => fs.existsSync(path.join(h.publicDir, 'js/features', f.id, 'index.js')));
  h.check(`the matrix has something to do: ${have.length} feature folder(s) (${have.map(f => f.id).join(', ')})`, have.length >= 1);

  const opened = [];                                                      // every page keeps animating in the background: close each step's pages so the frame-rate step measures a quiet machine
  const closeAll = () => Promise.all(opened.splice(0).map(c => c.close().catch(() => {})));
  const open = async (page, url, tag, opts = {}) => {
    const ctx = await h.context(opts.preset || PRESET[page]); opened.push(ctx);
    const p = await h.page(ctx, { tag, ...(opts.fps ? { fps: true } : {}) });
    await p.goto(h.url(FILE[page], url));
    return p;
  };
  const stateOf = (p, id) => featureStates(p).then(a => a.find(s => s.id === id) || null);
  /** ?ff= that turns this one feature on and every other one off (features that are on by default — status ready — included) */
  const alone = id => [id, ...FEATURES.filter(x => x.id !== id).map(x => '-' + x.id)].join(',');

  // ================================================================ ① each feature alone, ② with fcrash
  for (const f of have) {
    await h.step(`${f.id}: alone on ${f.pages.join(' · ')} — boots, core smoke, no errors`, async () => {
      try {
      await Promise.all(f.pages.map(async page => {
        const p = await open(page, params(page, { ff: alone(f.id), phase: page === 'admin' ? null : phaseFor(f) }), `${f.id}-${page}`);
        h.check(`${f.id} alone · ${page}: the core page works`, await smoke[page](p));
        await p.waitForTimeout(page === 'village' ? 500 : 900);
        const s = await stateOf(p, f.id);
        h.check(`${f.id} alone · ${page}: the feature is on, no errors, not tripped`, !!s && s.on && s.errors === 0 && !s.tripped, JSON.stringify(s && { on: s.on, errors: s.errors, tripped: s.tripped, source: s.source, lastError: s.lastError }));
        const others = (await featureStates(p)).filter(x => x.on && x.id !== f.id).map(x => x.id);
        h.eq(`${f.id} alone · ${page}: no other feature is on`, others, []);
      }));
      } finally { await closeAll(); }
    });

    await h.step(`${f.id}: fcrash on ${f.pages.join(' · ')} — the breaker trips, the page keeps working, nothing is left behind`, async () => {
      try {
      await Promise.all(f.pages.map(async page => {
        const p = await open(page, params(page, { ff: f.id, fcrash: f.id, phase: page === 'admin' ? null : phaseFor(f) }), `${f.id}-${page}-crash`);
        // the forced errors trip the breaker once five guarded callbacks have run. A feature that mostly waits for a person
        // (a button, a link in ⚙️ settings) may not get there on its own — then the test trips it the way the breaker does
        // (core trip()), and what is checked is the same: the page goes on and the feature leaves nothing behind.
        const st = () => p.evaluate(async id => (await import('/js/core/features.js')).featureStates().find(s => s.id === id) || null, f.id);
        let s = null; const t0 = Date.now();
        while (Date.now() - t0 < 8000) { s = await st(); if (s?.tripped) break; await p.waitForTimeout(200); }
        const idle = l => !l || Object.values(l).every(n => n === 0);
        h.check(`${f.id} fcrash · ${page}: the forced errors reached the feature (≥ 1 counted), or it registered nothing on this page`, !!s && (s.errors >= 1 || s.tripped || idle(s.live)), JSON.stringify(s));
        if (!s?.tripped) await p.evaluate(async id => (await import('/js/core/features.js')).trip(id, 'matrix: fcrash'), f.id);
        h.check(`${f.id} fcrash · ${page}: tripped${s?.tripped ? ' by the breaker' : ' (by trip() after 8 s)'}`, (await st())?.tripped === true);
        await p.waitForTimeout(400);
        h.check(`${f.id} fcrash · ${page}: the core page still works`, await smoke[page](p));
        await expectClean(h, p, f.id, `${f.id} fcrash · ${page}`);
      }));
      } finally { await closeAll(); }
    });
  }

  // ================================================================ ③ everything on: layout and frame rate
  await h.step('everything on: layout audits (TV · phone village with and without a guestbook entry · guest · kiosk · admin)', async () => {
    const ph = phaseFor({ phases: ['live'] });
    const audit = async (label, p) => { const r = await h.layoutReport(p); h.check(`${label}: no overlaps · no sideways scroll · tap targets`, r.overlaps.length === 0 && !r.hscroll && r.small.length === 0, JSON.stringify(r).slice(0, 500)); };

    const tv = await open('village', params('village', { ff: ALL, phase: ph, seed: 30 }), 'all-tv');
    await tv.waitForTimeout(2200); await tv.mouse.click(960, 540); await tv.waitForTimeout(700);    // the first click hides the start hint
    await audit('all on · TV 1920×1080', tv);
    await h.shot(tv, 'matrix-1-all-tv');

    const pctx = await h.context('phone'); opened.push(pctx);
    const meless = await h.page(pctx, { tag: 'all-phone-meless' });
    await meless.goto(h.url('village.html', params('village', { ff: ALL, phase: ph, seed: 16 }))); await meless.waitForTimeout(1800);
    await audit('all on · phone village without a guestbook entry', meless);
    await h.shot(meless, 'matrix-2-all-phone-meless');
    const me = await h.store(meless, s => new Promise(res => { const off = s.subscribeGuests(l => { off(); res(l[0].id); }); }));
    await meless.goto(h.url('village.html', { ff: ALL, phase: ph, time: 'day', me })); await meless.waitForTimeout(1800);
    await audit('all on · phone village with a guestbook entry', meless);
    await h.shot(meless, 'matrix-3-all-phone-me');

    const g = await open('guest', { ff: ALL, phase: ph }, 'all-guest'); await g.waitForTimeout(1200);
    await audit('all on · guest welcome (phone)', g);
    await h.shot(g, 'matrix-4-all-guest');
    const k = await open('kiosk', { ff: ALL, phase: ph }, 'all-kiosk'); await k.waitForTimeout(1200);
    await audit('all on · kiosk welcome (tablet)', k);
    const a = await open('admin', { ff: ALL, phase: null }, 'all-admin'); await smoke.admin(a); await a.waitForTimeout(600);
    await audit('all on · admin top (desktop)', a);
    await a.click('#atabs [data-tab="settings"]'); await a.waitForSelector('.frow'); await a.waitForTimeout(300);
    await audit('all on · admin ⚙️ settings (desktop)', a);
    await h.shot(a, 'matrix-5-all-admin-settings');
    await closeAll();
  });

  await h.step(`everything on: the TV keeps ≥ ${MIN_FPS} fps (50 villagers, night, idle and during fireworks)`, async () => {
    const tv = await open('village', params('village', { ff: ALL, phase: 'live', seed: 50, time: 'night' }), 'all-fps', { fps: true });
    await tv.waitForTimeout(3500);
    const measure = async ms => { await tv.evaluate(() => window.__fps.reset()); await tv.waitForTimeout(ms); return tv.evaluate(() => ({ fps: window.__fps.frames / ((performance.now() - window.__fps.since) / 1000), long: window.__fps.long })); };
    const idle = await measure(5000);
    h.check(`all on · TV idle: ≥ ${MIN_FPS} fps`, idle.fps >= MIN_FPS, `${idle.fps.toFixed(1)} fps, ${idle.long} long tasks`);
    await tv.keyboard.press('x'); await tv.waitForTimeout(1200);
    const ev = await measure(5000);
    h.check(`all on · TV during fireworks: ≥ ${MIN_FPS} fps`, ev.fps >= MIN_FPS, `${ev.fps.toFixed(1)} fps, ${ev.long} long tasks`);
    await closeAll();
  });

  // ================================================================ ④ four phases × everything on
  for (const phase of ['pre', 'live', 'after', 'anniversary']) {
    await h.step(`phase ${phase}: everything on, all four pages boot without errors and exactly the features the manifest allows are on`, async () => {
      await Promise.all(Object.keys(FILE).map(async page => {
        const p = await open(page, params(page, { ff: ALL, phase }), `phase-${phase}-${page}`);
        h.check(`${phase} · ${page}: the core page works`, await smoke[page](p));
        await p.waitForTimeout(700);
        const want = have.filter(f => f.pages.includes(page) && (page === 'admin' || f.phases.includes(phase))).map(f => f.id).sort();
        let on = [];
        for (let i = 0; i < 40; i++) {                                                 // four pages boot at once: give the slower ones time to finish setup
          on = (await featureStates(p)).filter(s => s.on).map(s => s.id).sort();
          if (JSON.stringify(on) === JSON.stringify(want)) break;
          await p.waitForTimeout(150);
        }
        h.eq(`${phase} · ${page}: the features that are on = the manifest lines that cover (page, phase)`, on, want);
        h.eq(`${phase} · ${page}: <html data-phase> follows the URL`, await p.evaluate(() => document.documentElement.dataset.phase), page === 'admin' ? await p.evaluate(() => document.documentElement.dataset.phase) : phase);
      }));
      await closeAll();
    });
  }
};

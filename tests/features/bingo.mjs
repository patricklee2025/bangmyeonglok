// ============================================================
//  WP-09 bingo — docs/v4/wp/WP-09-bingo.md · 04-testing §4.1 (S1–S9) + A1–A9
//  4×4 mix & mingle bingo: same guest = same card · honor / code / auto cells · lines · TV banner + crown + ranking · rules mirror · admin.
// ============================================================
import fs from 'node:fs';
import { signGuest, addGuests } from '../lib/flows.mjs';
import { zipRead } from '../lib/files.mjs';
import { on, off, adminPage, setFlag, setCfg, setLive, expectClean, dbGet, dbSet, dbCol, expectDefault } from '../lib/v4.mjs';

const ID = 'bingo';
export const meta = { title: 'bingo: same card per guest · honor/code/auto cells · lines · TV banner, crown, ranking · rules mirror · admin', timeout: 600000, tags: ['slow'] };

const HANGUL = /[ㄱ-힝]/;
const MIN_FPS = +(process.env.PERF_MIN_FPS || 24);
const EIGHT_OFF = ['m8', 'm9', 'm10', 'm11', 'm12', 'm13', 'm14', 'm15'];        // 16 left → every card holds m0–m7 and m16–m23
/** poll a page predicate (sync or async) */
const until = async (page, fn, arg, ms = 8000) => { const t0 = Date.now(); do { if (await page.evaluate(fn, arg).catch(() => false)) return true; await page.waitForTimeout(100); } while (Date.now() - t0 < ms); return false; };
const RECORD = `(() => { window.__bl = []; import('/js/core/bus.js').then(b => b.on('bingo:line', p => window.__bl.push(p))); })();`;
const emit = (p, type, payload) => p.evaluate(async ([t, x]) => (await import('/js/core/bus.js')).emit(t, x), [type, payload]);
const codeOf = (p, gid) => p.evaluate(async id => (await import('/js/core/ui.js')).guestCode(id), gid);
const cardIds = (p, root = '#s-f-bingo') => p.$$eval(`${root} .f-bingo-cell`, ns => ns.map(n => n.dataset.m));
const row = p => p.$('#s-done section.hub-row[data-hub="f-bingo"]');
const openBoard = async p => { const r = await row(p); await r.scrollIntoViewIfNeeded(); await r.click(); return until(p, () => document.querySelectorAll('#s-f-bingo.active .f-bingo-cell').length === 16); };
const cell = (p, id, root = '#s-f-bingo') => p.click(`${root} .f-bingo-cell[data-m="${id}"]`);
const back = (p, root = '#s-f-bingo') => p.click(`${root} .f-bingo-back`);
const honor = async (p, id, root = '#s-f-bingo') => { await cell(p, id, root); await p.click(`${root} .f-bingo-honor`); await p.click(`${root} .f-bingo-honor`); await until(p, ([r, m]) => !!document.querySelector(`${r} .f-bingo-dok`), [root, id]); await back(p, root); };
const tryCode = async (p, id, code, root = '#s-f-bingo') => {
  await cell(p, id, root); await p.fill(`${root} .f-bingo-input`, code); await p.click(`${root} .f-bingo-check`);
  await until(p, r => { const m = document.querySelector(r + ' .f-bingo-msg')?.textContent || ''; return m && !/확인하는 중|Checking/.test(m); }, root);
  const msg = await p.textContent(`${root} .f-bingo-msg`); await back(p, root); return msg;
};
const stamped = (p, id, root = '#s-f-bingo') => p.evaluate(([r, m]) => document.querySelector(`${r} .f-bingo-cell[data-m="${m}"]`)?.classList.contains('f-bingo-on') || false, [root, id]);

/** a world: admin (missions m8–m15 off) + guests on both sides + me (groom side) on a guest page */
async function world(h, preset = 'phone', { name = '빙고하객', side = 'groom', lang = null, params = {} } = {}) {
  const ctx = await h.context(preset);
  const a = await adminPage(h, ctx, { params: { ff: on(ID) } });
  await setCfg(h, a, ID, { off: EIGHT_OFF });
  const others = await h.store(a, async s => {
    const add = (name, side, activity) => s.addGuest({ name, side, message: '축하', avatar: {}, activity }, null).then(r => r.id);
    return { groom: await add('신랑친구', 'groom', 'dance'), bride: await add('신부친구', 'bride', 'fish'), both: await add('양가손님', 'both', 'walk') };
  });
  const g = await h.page(ctx, { tag: 'guest' });
  await g.addInitScript(RECORD);
  const { gid } = await signGuest(h, g, { name, msg: '축하해요', side, lang, act: 'dance', params: { ff: on(ID), ...params } });
  return { ctx, a, g, gid, others };
}

export default async (h) => {
  h.allowErrors(/permission-denied|invalid-argument|too fast|cannot be removed|cannot decrease/i);   // the rules-mirror checks reject on purpose

  // ---------------------------------------------------------------- S1 off
  await h.step('S1 off: no row, no TV crown/ranking, no admin tab; the core still works', async () => {
    const ctx = await h.context('phone');
    const p = await h.page(ctx, { tag: 'off' });
    const { gid } = await signGuest(h, p, { name: '끄기', msg: '끄기', params: { ff: off(ID) } });
    await expectClean(h, p, ID, 'S1 done screen');
    await p.goto(h.url('village.html', { me: gid, ff: off(ID) })); await p.waitForTimeout(1200);
    await expectClean(h, p, ID, 'S1 phone village');
    const a = await adminPage(h, ctx, { params: { ff: off(ID) } });
    await expectClean(h, a, ID, 'S1 admin');
    await ctx.close();
  });

  // ---------------------------------------------------------------- A2 the card
  let W = null;
  await h.step('A2 same guest → same card (another browser computes the same 16) · 16 distinct pool ids · my code on top', async () => {
    W = await world(h);
    const { g, gid } = W;
    const r = await row(g);
    h.eq('S2 the row: order 40 · 🎯 · "빙고 · 0줄 · 0/16"', r && await r.evaluate(n => [n.style.order, n.querySelector('.hub-ico').textContent, n.querySelector('.hub-title').textContent]), ['40', '🎯', '빙고 · 0줄 · 0/16']);
    h.check('S2 the row opens the board', await openBoard(g));
    const ids = await cardIds(g);
    h.check('A2 16 distinct ids from the pool (m0–m23)', ids.length === 16 && new Set(ids).size === 16 && ids.every(id => /^m([0-9]|1[0-9]|2[0-3])$/.test(id)), ids.join(','));
    h.check('A2 with m8–m15 switched off none of them is on the card', ids.every(id => !EIGHT_OFF.includes(id)));
    const other = await h.context('desktop');
    const q = await h.page(other, { tag: 'other' });
    await q.goto(h.url('index.html', { ff: on(ID) }));
    const there = await q.evaluate(async ([id, offIds]) => (await import('/js/features/bingo/shared.js')).cardFor(id, offIds), [gid, EIGHT_OFF]);
    h.eq('A2 another browser deals the same card for this guest', there, ids);
    const plain = await q.evaluate(async id => (await import('/js/features/bingo/shared.js')).cardFor(id, []), gid);
    h.check('A2 without switched-off missions the card is 16 of the 24 too', plain.length === 16 && new Set(plain).size === 16);
    await other.close();
    h.check('S2 "내 코드 XXXX" on top', (await g.textContent('#s-f-bingo .f-bingo-code')).includes(await codeOf(g, gid)));
    await h.shot(g, 'bingo-1-board');
  });

  // ---------------------------------------------------------------- A3 honor
  await h.step('A3 honor: "완료했어요!" → "정말 완료했나요?" → stamp now (local) → on the server after ~1.2 s', async () => {
    const { g, a, gid } = W;
    await cell(g, 'm16');
    h.eq('A3 the detail: mission text + done button', [await g.textContent('#s-f-bingo .f-bingo-dtitle'), await g.textContent('#s-f-bingo .f-bingo-honor')], ['댄스 플로어에서 춤추기 💃', '완료했어요!']);
    await g.click('#s-f-bingo .f-bingo-honor');
    h.eq('A3 asks once more', await g.textContent('#s-f-bingo .f-bingo-honor'), '정말 완료했나요?');
    await h.shot(g, 'bingo-2-honor-confirm');
    await g.click('#s-f-bingo .f-bingo-honor');
    h.check('A3 stamped', await until(g, () => !!document.querySelector('#s-f-bingo .f-bingo-dok')));
    h.check('A3 stored on this phone at once', await g.evaluate(id => JSON.parse(localStorage.getItem('wgb_f_bingo_' + id) || '{}').done?.includes('m16'), gid));
    const t0 = Date.now();
    h.check('A3 on the server after the 1.2 s debounce', await until(a, async id => (await (await import('/js/core/docdb.js')).getDB()).doc('bingo/' + id).get().then(d => d?.done?.includes('m16')), gid, 6000));
    h.check(`A3 …not before ~1 s (${Date.now() - t0} ms)`, Date.now() - t0 >= 900);
    await back(g);
    h.check('A3 the cell shows the stamp', await stamped(g, 'm16'));
  });

  // ---------------------------------------------------------------- A4 codes
  await h.step('A4 code cells: other side ✓ · my own ✗ · unknown ✗ · bad letters ✗ · m0 needs a groom guest ✗', async () => {
    const { g, gid, others } = W;
    const bride = await codeOf(g, others.bride), groom = await codeOf(g, others.groom), mine = await codeOf(g, gid);
    h.eq('A4 my own code → refused', await tryCode(g, 'm3', mine), '내 코드는 안 돼요 😉');
    h.eq('A4 a code nobody has → refused', await tryCode(g, 'm3', mine === 'ZZZZ' ? 'YYYY' : 'ZZZZ'), '없는 코드예요. 다시 확인해주세요');
    h.eq('A4 letters outside the code alphabet → refused at once', await tryCode(g, 'm3', 'O0I1'), '코드는 숫자·영문 4글자예요 (0·O·1·I·L 없음)');
    h.eq('A4 m0 with a bride guest\'s code → the rule says no', await tryCode(g, 'm0', bride), '이 미션은 신랑측 하객의 코드가 필요해요');
    h.check('A4 m0 still open', !(await stamped(g, 'm0')));
    h.eq('A4 m3 (other side) with the bride guest\'s code (lower case, spaced) → ✓ with her name', await tryCode(g, 'm3', bride.toLowerCase().split('').join(' ')), '신부친구님 코드 확인!');
    h.check('A4 m3 stamped', await stamped(g, 'm3'));
    h.eq('A4 m0 with the groom guest\'s code → ✓', await tryCode(g, 'm0', groom), '신랑친구님 코드 확인!');
    h.eq('A4 m4 (same activity: dance) with the groom friend (dance) → ✓', await tryCode(g, 'm4', groom), '신랑친구님 코드 확인!');
    h.eq('A4 m2 (anyone new) with the "both" guest → ✓', await tryCode(g, 'm2', await codeOf(g, others.both)), '양가손님님 코드 확인!');
    h.eq('A4 m1 with the bride guest\'s code → ✓', await tryCode(g, 'm1', bride), '신부친구님 코드 확인!');
    await h.shot(g, 'bingo-3-codes');
  });

  // ---------------------------------------------------------------- A5 auto
  await h.step('A5 auto cells: snap:uploaded → m5 · three snaps → m23 · remote:sent → m6 · vote:cast → m7 (only for my gid)', async () => {
    const { g, gid, others } = W;
    await cell(g, 'm6');
    h.check('A5 an auto cell explains itself and offers a shortcut', /자동으로 체크돼요/.test(await g.textContent('#s-f-bingo .f-bingo-detail')) && !!(await g.$('#s-f-bingo .f-bingo-go[data-go="remote"]')));
    await back(g);
    await emit(g, 'snap:uploaded', { gid: others.bride, slot: 0, where: 'done' });
    await g.waitForTimeout(200);
    h.check('A5 someone else\'s snap does nothing to my card', !(await stamped(g, 'm5')));
    await emit(g, 'snap:uploaded', { gid, slot: 0, where: 'done' });
    h.check('A5 my first snap → m5', await until(g, () => document.querySelector('#s-f-bingo .f-bingo-cell[data-m="m5"]')?.classList.contains('f-bingo-on')));
    h.check('A5 m23 not yet', !(await stamped(g, 'm23')));
    await emit(g, 'snap:uploaded', { gid, slot: 1, where: 'done' }); await emit(g, 'snap:uploaded', { gid, slot: 2, where: 'done' });
    h.check('A5 three snaps → m23', await until(g, () => document.querySelector('#s-f-bingo .f-bingo-cell[data-m="m23"]')?.classList.contains('f-bingo-on')));
    await emit(g, 'remote:sent', { gid, type: 'heart', where: 'done' });
    await emit(g, 'vote:cast', { pid: 'p1', gid, choice: 0 });
    h.check('A5 remote → m6 · vote → m7', await until(g, () => ['m6', 'm7'].every(m => document.querySelector(`#s-f-bingo .f-bingo-cell[data-m="${m}"]`)?.classList.contains('f-bingo-on'))));
    await cell(g, 'm7');
    h.check('A5 a done auto cell says ✓', /완료/.test(await g.textContent('#s-f-bingo .f-bingo-detail')));
    await back(g);
  });

  // ---------------------------------------------------------------- A6 lines
  await h.step('A6 lines: a row + a column + a diagonal = 3 · the first line cheers "🎯 빙고!" and emits bingo:line', async () => {
    const { g } = W;
    const calc = await g.evaluate(async () => {
      const { linesOf } = await import('/js/features/bingo/shared.js');
      const card = Array.from({ length: 16 }, (_, i) => 'm' + i);
      const done = new Set(['m0', 'm1', 'm2', 'm3', 'm4', 'm8', 'm12', 'm5', 'm10', 'm15']);   // row 0 · column 0 · diagonal 0-5-10-15
      return [linesOf(card, done), linesOf(card, []), linesOf(card, card)];
    });
    h.eq('A6 row + column + diagonal = 3 · empty = 0 · full = 10', calc, [3, 0, 10]);
    // finish the first line on the real card through the UI
    const ids = await cardIds(g);
    const st = await g.evaluate(() => [...document.querySelectorAll('#s-f-bingo .f-bingo-cell')].map(n => n.classList.contains('f-bingo-on')));
    const lines = [[0, 1, 2, 3], [4, 5, 6, 7], [8, 9, 10, 11], [12, 13, 14, 15], [0, 4, 8, 12], [1, 5, 9, 13], [2, 6, 10, 14], [3, 7, 11, 15], [0, 5, 10, 15], [3, 6, 9, 12]];
    const kindOf = id => (['m0', 'm1', 'm2', 'm3', 'm4'].includes(id) ? 'code' : ['m5', 'm6', 'm7', 'm23'].includes(id) ? 'auto' : 'honor');
    const open = lines.map(l => l.filter(i => !st[i]));
    const already = open.some(rest => rest.length === 0);              // codes + autos may have closed a line already (then it cheered back then)
    const best = open.filter(rest => rest.length && rest.every(i => kindOf(ids[i]) === 'honor')).sort((a, b) => a.length - b.length)[0];
    h.check('A6 a line is done already or only needs honor cells', already || !!best, JSON.stringify(open));
    if (!already) {
      for (const i of best) await honor(g, ids[i]);
      h.check('A6 the cheer overlay "🎯 빙고!"', await until(g, () => { const c = document.querySelector('.f-bingo-cheer'); return c && !c.hidden && /빙고/.test(c.textContent); }, null, 3000));
      await h.shot(g, 'bingo-4-cheer');
    }
    h.check('A6 the first bingo:line on this phone: { gid, lines: 1, all: false }', await until(g, id => window.__bl.length >= 1 && window.__bl[0].gid === id && window.__bl[0].lines === 1 && window.__bl[0].all === false, W.gid));
    h.check('A6 every bingo:line here has more lines than the one before', await g.evaluate(() => window.__bl.every((b, i, a) => i === 0 || b.lines > a[i - 1].lines)));
    h.check('A6 the status line counts the lines', /[1-9]\d*줄/.test(await g.textContent('#s-f-bingo .f-bingo-status')));
    await g.click('#s-f-bingo .f-bingo-leave');
    const want = await g.evaluate(() => document.querySelector('#s-f-bingo .f-bingo-board').dataset);
    h.check('A6 the hub row title follows the board ("빙고 · n줄 · d/16" — the core re-reads function titles)', await until(g, w => document.querySelector('#s-done section.hub-row[data-hub="f-bingo"] .hub-title')?.textContent === `빙고 · ${w.lines}줄 · ${w.cells}/16`, { lines: want.lines, cells: want.cells }));
  });

  // ---------------------------------------------------------------- A7 TV
  await h.step('A7 TV: another tab completes a line → banner "{name}님 빙고!" · bingo:line once · crown · ranking #1 · reload → nothing replayed', async () => {
    const { ctx, a, g, others } = W;
    // the phone saves 1.2 s after a change: let my line reach the server first (a TV opened before that would rightly announce it)
    h.check('A7 my line is on the server before the TV opens', await until(a, async id => ((await (await (await import('/js/core/docdb.js')).getDB()).doc('bingo/' + id).get())?.lines || 0) >= 1, W.gid, 8000));
    const tv = await h.page(ctx, { tag: 'tv' });
    await tv.setViewportSize({ width: 1920, height: 1080 });
    await tv.addInitScript(RECORD);
    await tv.goto(h.url('village.html', { ff: on(ID), tv: 1, time: 'day' }));
    await until(tv, () => /^\d+$/.test(document.querySelector('#count-n')?.textContent || ''));
    await tv.mouse.click(300, 1000).catch(() => {});
    await tv.waitForTimeout(1500);
    h.eq('A7 the first snapshot is only remembered (no bingo:line, no banner)', await tv.evaluate(() => window.__bl.length), 0);
    h.check('A7 my line from before is already on the ranking (#1)', await until(tv, id => document.querySelector('.hud .hz-rm .f-bingo-rrow')?.dataset.gid === id, W.gid));
    const crownPx = () => tv.evaluate(() => { const d = document.querySelector('#world').getContext('2d').getImageData(0, 0, 480, 272).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] === 0x8c && d[i + 1] === 0x6a && d[i + 2] === 0x12) n++; return n; });
    let crown = 0; for (let i = 0; i < 25 && !crown; i++) { crown = await crownPx(); if (!crown) await tv.waitForTimeout(200); }
    h.check('A7 a crown on my villager (crown rim pixels on the world)', crown > 0, String(crown));
    // the bride friend finishes a line in another tab (straight to the server: 4 cells of a row + lines 1)
    const card = await a.evaluate(async ([id, offIds]) => (await import('/js/features/bingo/shared.js')).cardFor(id, offIds), [others.bride, EIGHT_OFF]);
    const banner = h.waitBanner(tv, /🎯 신부친구님 빙고!/, 15000);
    const row = [0, 4, 8, 12].map(k => card.slice(k, k + 4)).find(r => !r.includes('m16'));   // a row without m16 — S9 counts m16 exactly (was a 1-in-4 flake)
    h.check('A7 the other guest\'s line is saved', (await dbSet(h, a, 'bingo/' + others.bride, { done: row, lines: 1, updatedAt: { $sv: 'ts' } })).ok);
    h.check('A7 TV banner "🎯 신부친구님 빙고!"', !!(await banner));
    h.check('A7 bingo:line { gid, lines: 1, all: false } once on the TV', await until(tv, id => window.__bl.length === 1 && window.__bl[0].gid === id && window.__bl[0].lines === 1 && window.__bl[0].all === false, others.bride));
    h.check('A7 two on the ranking', await until(tv, () => document.querySelectorAll('.hud .hz-rm .f-bingo-rrow').length === 2));
    await h.shot(tv, 'bingo-5-tv');
    // a poll on the TV takes the rm zone
    await setLive(h, a, { poll: 'pdemo' });
    h.check('A7 a poll on the TV hides the ranking', await until(tv, () => !document.querySelector('.f-bingo-rank')));
    await setLive(h, a, { poll: null });
    h.check('A7 …and it comes back after', await until(tv, () => !!document.querySelector('.f-bingo-rank')));
    await tv.reload(); await tv.waitForTimeout(2500);
    h.eq('A7 after a reload: no bingo:line replayed', await tv.evaluate(() => window.__bl.length), 0);
    h.check('A7 after a reload: no bingo banner', !/빙고!/.test(await tv.textContent('#arrival').catch(() => '')));
    await tv.close();
  });

  // ---------------------------------------------------------------- A8 rules mirror
  await h.step('A8 rules mirror: fewer cells · m24 · 17 cells · resave within 1 s · lower lines → refused', async () => {
    const { g, gid, others } = W;
    const cur = await dbGet(h, g, 'bingo/' + gid);
    await g.waitForTimeout(1100);
    h.check('A8 removing a cell is refused', (await dbSet(h, g, 'bingo/' + gid, { done: cur.done.slice(1), lines: cur.lines, updatedAt: { $sv: 'ts' } })).ok === false);
    h.check('A8 m24 is refused', (await dbSet(h, g, 'bingo/' + others.both, { done: ['m24'], lines: 0, updatedAt: { $sv: 'ts' } })).ok === false);
    h.check('A8 17 cells are refused', (await dbSet(h, g, 'bingo/' + others.both, { done: Array.from({ length: 17 }, (_, i) => 'm' + i), lines: 0, updatedAt: { $sv: 'ts' } })).ok === false);
    h.check('A8 lines going down are refused', (await dbSet(h, g, 'bingo/' + gid, { done: cur.done, lines: 0, updatedAt: { $sv: 'ts' } })).ok === false);
    h.check('A8 a first save for another guest passes', (await dbSet(h, g, 'bingo/' + others.both, { done: ['m1'], lines: 0, updatedAt: { $sv: 'ts' } })).ok);
    h.check('A8 …and the same again within 1 s is refused', (await dbSet(h, g, 'bingo/' + others.both, { done: ['m1', 'm2'], lines: 0, updatedAt: { $sv: 'ts' } })).ok === false);
    h.check('A8 a guest that does not exist cannot have a record', (await dbSet(h, g, 'bingo/gnobody', { done: [], lines: 0, updatedAt: { $sv: 'ts' } })).ok === false);
  });

  // ---------------------------------------------------------------- admin
  await h.step('S9 admin tab: ranking · per-mission counts · switch missions off (≥ 16 stay on) · delete a record · backup f-bingo/bingo.json', async () => {
    const { a, gid, others } = W;
    await a.click('#atabs [data-tab="f-bingo"]');
    h.check('S9 the ranking lists my record first', await until(a, id => document.querySelector('.f-bingo-arr')?.dataset.gid === id, gid));
    h.check('S9 m16 done by 1', await until(a, () => /^1/.test(document.querySelector('.f-bingo-am[data-m="m16"] .f-bingo-an')?.textContent || '')), await a.textContent('.f-bingo-am[data-m="m16"]'));
    h.check('S9 the 8 switched-off missions are ticked', await a.$$eval('.f-bingo-am input', ns => ns.filter(n => n.checked).map(n => n.dataset.m).join()) === EIGHT_OFF.join());
    await a.check('.f-bingo-am input[data-m="m16"]');
    h.check('S9 a 9th switch-off disables saving and says why', await a.evaluate(() => document.querySelector('.f-bingo-asave').disabled) && /16개 이상/.test(await a.textContent('.f-bingo-awarn')));
    await a.uncheck('.f-bingo-am input[data-m="m16"]');
    await a.uncheck('.f-bingo-am input[data-m="m8"]');
    h.check('S9 the warning about changing during the event', /행사 전에만/.test(await a.textContent('.f-bingo-awarn')));
    await a.click('.f-bingo-asave');
    await until(a, () => /저장했어요/.test(document.querySelector('.f-bingo-amsg')?.textContent || ''));
    h.eq('S9 saved to cfg.bingo.off (m8 back on)', (await dbGet(h, a, 'app/settings'))?.cfg?.bingo?.off, EIGHT_OFF.slice(1));
    await h.shot(a, 'bingo-6-admin');
    const zip = await h.download(a, () => a.click('#btn-zip'), 'bingo-backup.zip');
    const json = zip ? zipRead(fs.readFileSync(zip), 'f-bingo/bingo.json') : null;
    const n = (await dbCol(h, a, 'bingo')).length;
    h.check(`S9 backup has f-bingo/bingo.json with the ${n} records`, !!json && JSON.parse(json.toString()).length === n);
    await a.click(`.f-bingo-areset[data-gid="${others.both}"]`);
    await a.click(`.f-bingo-areset[data-gid="${others.both}"]`);
    h.check('S9 delete (two presses) removes the record', await until(a, id => !document.querySelector(`.f-bingo-arr[data-gid="${id}"]`), others.both));
    await W.ctx.close();
  });

  // ---------------------------------------------------------------- phone village
  await h.step('S7 phone village: 🎯 action → the same board in a sheet → a stamp there', async () => {
    const ctx = await h.context('phone');
    const g = await h.page(ctx, { tag: 'village' });
    const { gid } = await signGuest(h, g, { name: '마을빙고', msg: '축하', params: { ff: on(ID) } });
    await g.goto(h.url('village.html', { me: gid, ff: on(ID) })); await g.waitForTimeout(1500);
    h.check('S7 the 🎯 button is on the bar', await until(g, () => !!document.querySelector('#mremote [data-fa="f-bingo"]')));
    await g.click('#mremote [data-fa="f-bingo"]');
    h.check('S7 the sheet holds the 16 cells', await until(g, () => document.querySelectorAll('#fsheet .f-bingo-cell').length === 16));
    const ids = await cardIds(g, '#fsheet');
    const there = await g.evaluate(async id => (await import('/js/features/bingo/shared.js')).cardFor(id, []), gid);
    h.eq('S7 the same card as on the guest page', ids, there);
    const hon = ids.find(id => !['m0', 'm1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm23'].includes(id));
    await honor(g, hon, '#fsheet');
    h.check('S7 stamped in the sheet', await stamped(g, hon, '#fsheet'));
    const r = await h.layoutReport(g);
    h.check('A9 / S8 the sheet: no overlaps', !r.overlaps.length, r.overlaps.join(' | '));
    await h.shot(g, 'bingo-7-village-sheet');
    await ctx.close();
  });

  // ---------------------------------------------------------------- layout · gates · English · hot toggle · perf
  await h.step('A9 layout phoneSE: cells ≥ 72 px, no overlaps · the code detail fits', async () => {
    const ctx = await h.context('phoneSE');
    const g = await h.page(ctx, { tag: 'se' });
    await signGuest(h, g, { name: '배치', msg: '배치', params: { ff: on(ID) } });
    await openBoard(g);
    h.check('A9 every cell ≥ 72 × 72 px', await g.$$eval('#s-f-bingo .f-bingo-cell', ns => ns.every(n => { const r = n.getBoundingClientRect(); return r.width >= 72 && r.height >= 72; })), JSON.stringify(await g.$eval('#s-f-bingo .f-bingo-cell', n => n.getBoundingClientRect().width)));
    let r = await h.layoutReport(g);
    h.check('A9 board: no overlaps · no sideways scroll', !r.overlaps.length && !r.hscroll, JSON.stringify(r).slice(0, 300));
    await h.shot(g, 'bingo-8-phoneSE');
    const ids = await cardIds(g), codeCell = ids.find(id => ['m0', 'm1', 'm2', 'm3', 'm4'].includes(id));
    if (codeCell) { await cell(g, codeCell); r = await h.layoutReport(g); h.check('A9 code detail: no overlaps', !r.overlaps.length && !r.hscroll, JSON.stringify(r).slice(0, 300)); await h.shot(g, 'bingo-9-code-detail'); }
    await ctx.close();
  });

  await h.step('S5 / S4: simple mode hides the row · kiosk never loads · ?phase=pre nothing', async () => {
    const ctx = await h.context('phone');
    const s = await h.page(ctx, { tag: 'simple' });
    await signGuest(h, s, { name: '어르신', msg: '축하합니다', simple: true, params: { ff: on(ID) } });
    h.check('S5 simple mode: no bingo row', !(await row(s)) || !(await (await row(s)).isVisible()));
    const k = await h.page(ctx, { tag: 'kiosk' });
    await k.goto(h.url('kiosk.html', { ff: on(ID) })); await k.waitForTimeout(1000);
    await expectClean(h, k, ID, 'S4 kiosk');
    const p = await h.page(ctx, { tag: 'pre' });
    await signGuest(h, p, { name: '미리', msg: '미리', params: { ff: on(ID), phase: 'pre' } });
    await p.waitForTimeout(600);
    await expectClean(h, p, ID, 'S4 guest page in pre');
    await ctx.close();
  });

  await h.step('S6 English: row, board, detail — no Hangul', async () => {
    const ctx = await h.context('phone');
    const g = await h.page(ctx, { tag: 'en' });
    await signGuest(h, g, { name: 'Noah', msg: 'Congrats!', lang: 'en', params: { ff: on(ID) } });
    h.check('S6 row in English', /^Bingo · 0 lines · 0\/16$/.test(await g.textContent('#s-done section.hub-row[data-hub="f-bingo"] .hub-title')));
    await openBoard(g);
    const t = await g.textContent('#s-f-bingo');
    h.check('S6 board without Hangul', !HANGUL.test(t), t.slice(0, 200));
    await cell(g, (await cardIds(g))[0]);
    h.check('S6 detail without Hangul', !HANGUL.test(await g.textContent('#s-f-bingo .f-bingo-detail')));
    await ctx.close();
  });

  await h.step('S3 hot toggle: manifest default → admin on → row appears → off → gone', async () => {
    const ctx = await h.context('phone');
    const g = await h.page(ctx, { tag: 'hot' });
    await signGuest(h, g, { name: '토글', msg: '토글' });
    await expectDefault(h, g, ID, 'S3 default (no ?ff, no admin flag)');
    const a = await adminPage(h, ctx);
    await setFlag(h, a, ID, true);
    h.check('S3 on: the row appears without reload', await until(g, () => !!document.querySelector('#s-done section.hub-row[data-hub="f-bingo"]')));
    await setFlag(h, a, ID, false);
    await until(g, () => !document.querySelector('[data-f="bingo"]:not(link)'));
    await g.waitForTimeout(300);
    await expectClean(h, g, ID, 'S3 after off');
    await setFlag(h, a, ID, null);
    await ctx.close();
  });

  await h.step(`perf: TV with 50 villagers at night, 20 of them crowned → ≥ ${MIN_FPS} fps`, async () => {
    const ctx = await h.context('tv');
    const a = await adminPage(h, ctx, { params: { ff: on(ID) } });
    const ids = await addGuests(h, a, 50, '성능');
    for (const id of ids.slice(0, 20)) await dbSet(h, a, 'bingo/' + id, { done: ['m0', 'm1', 'm2', 'm3'], lines: 1, updatedAt: { $sv: 'ts' } });
    const tv = await h.page(ctx, { tag: 'fps', fps: true });
    await tv.goto(h.url('village.html', { ff: on(ID), time: 'night' }));
    await tv.waitForTimeout(3000);
    await tv.evaluate(() => window.__fps.reset()); await tv.waitForTimeout(4000);
    const fps = await tv.evaluate(() => window.__fps.frames / ((performance.now() - window.__fps.since) / 1000));
    h.check(`perf ≥ ${MIN_FPS} fps`, fps >= MIN_FPS, `${fps.toFixed(1)} fps`);
    await h.shot(tv, 'bingo-10-night-crowns');
    await ctx.close();
  });
};

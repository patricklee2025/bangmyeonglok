// ============================================================
//  WP-19 wall — docs/v4/wp/WP-19-wall.md · 04-testing §4.1 (S1–S9) + A1–A7
//  The guestbook wall (guest page + phone village) and the core "💌 only for the couple" message it relies on.
// ============================================================
import { signGuest } from '../lib/flows.mjs';
import { on, off, adminPage, setFlag, expectClean, featureState, footprint, dbCol, dbGet, dbSet, only } from '../lib/v4.mjs';

const ID = 'wall';
export const meta = { title: 'wall: other guests\' messages on the guest page and the phone village · private messages stay private', timeout: 360000, tags: ['slow'] };

const HANGUL = /[ㄱ-힝]/;
const PRIV_TEXT = '두 분만 보세요 비밀이에요';

/** five guests in this demo world: groom · bride · private · hidden · voice only. Returns their ids by key. */
const seed = (h, page) => h.store(page, async (s, PRIV) => {
  // 5 ms apart: two writes in the same millisecond share a createdAt and "newest first" would be a coin toss
  const add = async (g, x) => { const id = await s.addGuest({ avatar: {}, activity: 'walk', ...g }, x || null).then(r => r.id); await new Promise(r => setTimeout(r, 5)); return id; };
  const ids = {};
  ids.groom = await add({ name: '신랑친구', side: 'groom', message: '신랑 축하해!' });
  ids.bride = await add({ name: '신부친구', side: 'bride', message: '신부 예뻐요' });
  ids.priv = await add({ name: '비밀하객', side: 'both', message: PRIV, priv: true });
  ids.hidden = await add({ name: '숨김하객', side: 'both', message: '숨겨진 글' });
  ids.voice = await add({ name: '음성하객', side: 'groom', message: '' }, { voice: { data: 'data:audio/webm;base64,GkXfo0AAAAAAAAAf', mime: 'audio/webm' } });
  await s.setHidden(ids.hidden, true);
  return ids;
}, PRIV_TEXT);

const wallCards = page => page.$$eval('#s-f-wall .f-wall-card', ns => ns.map(n => ({ gid: n.dataset.gid, name: n.querySelector('.f-wall-name').textContent, side: n.querySelector('.f-wall-side').textContent, msg: n.querySelector('.f-wall-msg').textContent, me: n.classList.contains('f-wall-me'), priv: n.classList.contains('f-wall-priv') })));
/** poll a page predicate (sync or async — waitForFunction would take an async function's promise as "true") */
const until = async (page, fn, arg, ms = 8000) => { const t0 = Date.now(); do { if (await page.evaluate(fn, arg).catch(() => false)) return true; await page.waitForTimeout(100); } while (Date.now() - t0 < ms); return false; };

export default async (h) => {
  // ---------------------------------------------------------------- S1 off = no trace (guest page · phone village · admin)
  await h.step('S1 off: no trace on the done screen and the phone village; the core still works', async () => {
    const ctx = await h.context('phone');
    const p = await h.page(ctx, { tag: 'off' });
    await p.goto(h.url('index.html', { ff: off(ID) }));
    const { gid } = await signGuest(h, p, { name: '끄기하객', params: { ff: off(ID) } });
    await expectClean(h, p, ID, 'S1 done screen');
    h.check('S1 the core done screen is complete (snap uploader + remote)', await p.isVisible('#snap-done .snap-actions') && await p.isVisible('#remote-done'));
    await p.goto(h.url('village.html', { me: gid, ff: off(ID) })); await p.waitForTimeout(1500);
    await expectClean(h, p, ID, 'S1 phone village');
    h.check('S1 the phone village works (count + remote bar)', /^\d+$/.test(await p.textContent('#count-n')) && await p.isVisible('#mremote'));
  });

  // ---------------------------------------------------------------- A1–A4 on the guest page
  let world = null, me = null, ids = null;
  await h.step('A1 done screen: a 💌 row at order 65 → the wall: newest first, mine marked', async () => {
    world = await h.context('phone');
    const p = await h.page(world, { tag: 'guest' });
    await p.goto(h.url('index.html', { ff: on(ID) }));
    ids = await seed(h, p);
    me = (await signGuest(h, p, { name: '나하객', msg: '결혼 축하해요! 행복하세요', side: 'bride', params: { ff: on(ID) } })).gid;
    const row = await p.$('#s-done section.hub-row[data-hub="f-wall"]');
    h.check('A1 the row is on the done screen', !!row && await row.isVisible());
    h.eq('A1 …at order 65 with its title', row && await row.evaluate(n => [n.style.order, n.querySelector('.hub-title').textContent]), ['65', '다른 하객 방명록 보기']);
    await row.scrollIntoViewIfNeeded(); await p.waitForTimeout(400);       // screens fade in for 0.25 s
    await h.shot(p, 'wall-1-done-row');
    await row.click();
    h.check('A1 the row opens the wall screen', await until(p, () => document.querySelector('#s-f-wall.active .f-wall-card')));
    const cards = await wallCards(p);
    h.eq('A1 newest first (me, then the five seeded minus the hidden one, newest first)', cards.map(c => c.name), ['나하객', '음성하객', '비밀하객', '신부친구', '신랑친구']);
    h.eq('A1 my own card is marked "나"', cards.filter(c => c.me).map(c => c.gid), [me]);
    h.check('A1 the count says 5', (await p.textContent('#s-f-wall .f-wall-count')).includes('5명'));
    await p.waitForTimeout(400);
    await h.shot(p, 'wall-2-screen');

    // A2 filters
    const names = async k => { await p.click(`#s-f-wall .f-wall-segbtn[data-k="${k}"]`); return (await wallCards(p)).map(c => c.name); };
    h.eq('A2 신랑측 → groom-side guests only', await names('groom'), ['음성하객', '신랑친구']);
    h.eq('A2 신부측 → bride-side guests only', await names('bride'), ['나하객', '신부친구']);
    h.eq('A2 양가 → both-side guests only (the private one)', await names('both'), ['비밀하객']);
    h.eq('A2 전체 → everybody again', (await names('all')).length, 5);

    // A3 private · A4 hidden / voice only
    const priv = (await wallCards(p)).find(c => c.gid === ids.priv);
    h.check('A3 the private entry shows the name but not the text', priv && priv.priv && priv.msg === '💌 신랑·신부에게만 남긴 메시지예요', JSON.stringify(priv));
    h.check('A3 the private text appears nowhere on the page', !(await p.evaluate(t => document.body.innerText.includes(t), PRIV_TEXT)));
    h.check('A4 the hidden entry is not listed', !(await wallCards(p)).some(c => c.gid === ids.hidden));
    h.eq('A4 voice only → 🎤 line', (await wallCards(p)).find(c => c.gid === ids.voice)?.msg, '🎤 음성 메시지를 남겼어요');
    h.eq('A7 no photo or audio element on the wall (sprites are canvases)', await p.$$eval('#s-f-wall img, #s-f-wall audio, #s-f-wall video', n => n.length), 0);

    await p.click('#s-f-wall .f-wall-back');
    h.check('the back button returns to the done screen', await until(p, () => document.querySelector('#s-done.active')));
  });

  // ---------------------------------------------------------------- A3 the core part of "only for the couple"
  await h.step('A3 private message: public document empty + priv · admin-only note · TV placeholder · admin card and CSV', async () => {
    const p = await h.page(world, { tag: 'priv-ui' });
    const { gid } = await signGuest(h, p, { name: '체크하객', msg: '저희만 아는 이야기', priv: true, params: { ff: on(ID) } });
    const doc = (await dbCol(h, p, 'guests')).find(d => d.id === gid);
    h.eq('A3 the ticked box → public guest document has message "" and priv: true', doc && [doc.message, doc.priv], ['', true]);
    h.eq('A3 the text is kept apart (store.getNote)', await h.store(p, (s, id) => s.getNote(id), gid), '저희만 아는 이야기');
    const denied = await dbGet(h, p, 'notes/' + gid).then(() => 'read', e => e?.code || 'error').catch(e => e?.code);
    h.check('A3 docdb cannot read notes (v3-style, admin-only collection)', denied !== 'read', String(denied));
    h.eq('S7 docdb cannot write a guest document (store only)', (await dbSet(h, p, 'guests/x1', { name: 'x' })).error, 'permission-denied');
    // the TV puts a placeholder in the bubbles / ticker
    const tv = await h.page(world, { tag: 'priv-tv' });
    await tv.goto(h.url('village.html', { ff: on(ID), time: 'day' })); await tv.waitForTimeout(1500);
    const vg = await tv.evaluate(async id => (await import('/js/core/bus.js')).last('village:guests')?.list.find(g => g.id === id) || null, gid);
    h.eq('A3 TV: that guest\'s message is the placeholder', vg && [vg.message, vg.priv], ['💌 신랑·신부에게 마음을 전했어요', true]);
    h.check('A3 TV: the private text is nowhere in the village list', !(await tv.evaluate(async t => JSON.stringify((await import('/js/core/bus.js')).last('village:guests')).includes(t), '저희만 아는 이야기')));
    // admin sees it
    const admin = await adminPage(h, world);
    const card = await admin.waitForSelector(`#grid .gcard .msg.priv`, { timeout: 8000 }).catch(() => null);
    h.check('A3 admin: the card is marked 🔒 and shows the text', card && await until(admin, () => [...document.querySelectorAll('#grid .msg.priv')].some(m => m.textContent.includes('🔒') && m.textContent.includes('저희만 아는 이야기'))));
    const csv = await h.download(admin, () => admin.click('#btn-csv'), 'wall-guestbook.csv');
    const text = csv ? (await import('node:fs')).readFileSync(csv, 'utf8') : '';
    h.check('A3 admin CSV: [신랑·신부에게만] + the text', text.includes('[신랑·신부에게만] 저희만 아는 이야기'), text.slice(0, 200));
    await h.shot(admin, 'wall-3-admin-private');
  });

  // ---------------------------------------------------------------- A5 the phone village
  await h.step('A5 phone village (ME): 💌 action → everybody · tap a villager → that card · nothing on the TV', async () => {
    const p = await h.page(world, { tag: 'phone-village' });
    await p.goto(h.url('village.html', { me, ff: await only(ID, '_selftest'), time: 'day' })); await p.waitForTimeout(2200);   // other features' bar actions off
    // _selftest (used below to find a villager on screen) puts its own action first — take it off the bar
    await p.evaluate(() => document.querySelector('[data-st="badge"]').dispatchEvent(new CustomEvent('st-cmd', { detail: { cmd: 'actions-mode', mode: 'none' } })));
    await until(p, () => !!document.querySelector('#mremote [data-f="wall"]'), null, 3000);
    const act = await p.$('#mremote [data-f="wall"]');
    h.check('A5 the 💌 action is on the bottom bar', !!act && await act.isVisible());
    await act.click();
    h.check('A5 it opens the sheet with every villager\'s card', await until(p, () => document.querySelector('#fsheet:not([hidden]) .f-wall-card')));
    const n = await p.$$eval('#fsheet .f-wall-card', ns => ns.length), present = await p.evaluate(async () => (await import('/js/core/bus.js')).last('village:guests').list.length);
    h.eq('A5 one card per guest in the village', n, present);
    h.check('A5 the private one shows no text in the sheet', !(await p.evaluate(t => document.body.innerText.includes(t), PRIV_TEXT)));
    const r = await h.layoutReport(p);
    h.check('S8 phone sheet: no overlaps · no sideways scroll · tap targets', r.overlaps.length === 0 && !r.hscroll && r.small.length === 0, JSON.stringify(r).slice(0, 400));
    await h.shot(p, 'wall-4-village-sheet');
    await p.click('#fsheet .sheet-x, #fsheet [data-close], #fsheet button[aria-label]').catch(() => {});
    await p.evaluate(() => document.querySelector('#sheet-bg')?.click());
    // tap a villager (position from the _selftest probe — the test turns it on next to wall)
    let opened = null;
    for (let i = 0; i < 4 && !opened; i++) {
      const pos = await p.evaluate(id => { const b = document.querySelector('[data-st="badge"]'); b.dispatchEvent(new CustomEvent('st-cmd', { detail: { cmd: 'vil', gid: id, op: 'icon', args: ['·', 0.1] } })); const o = JSON.parse(b.dataset.out || 'null')?.val; if (!o) return null; const w = document.querySelector('#world').getBoundingClientRect(); return [w.left + o.x / 480 * w.width, w.top + (o.y - 10) / 272 * w.height]; }, ids.bride);
      if (!pos) break;
      await p.touchscreen.tap(pos[0], pos[1]);
      opened = await until(p, id => document.querySelector(`#fsheet:not([hidden]) .f-wall-card[data-gid="${id}"]`), ids.bride, 2500);
      if (!opened) { await p.evaluate(() => document.querySelector('#sheet-bg')?.click()); await p.waitForTimeout(300); }
    }
    h.check('A5 tapping a villager opens that guest\'s card', opened);
    await p.waitForTimeout(450);                                          // the sheet slides up
    await h.shot(p, 'wall-5-village-tap');
    const tv = await h.page(world, { tag: 'tv-none' });
    await tv.goto(h.url('village.html', { ff: on(ID), host: 1 })); await tv.waitForTimeout(1500);
    h.eq('A5 TV (host): the feature adds no element (only its stylesheet is loaded)', (await footprint(tv, ID)).nodes, 0);
    h.eq('A5 TV (host): no tap hook, no action', await tv.evaluate(() => document.querySelectorAll('#mremote [data-f="wall"], #fsheet [data-f="wall"]').length), 0);
  });

  // ---------------------------------------------------------------- A6 load failure → retry
  await h.step('A6 the list fails to load → message + retry → loads', async () => {
    const p = await h.page(world, { tag: 'fail' });
    await p.goto(h.url('index.html', { ff: on(ID) }));
    await p.evaluate(async () => {
      const D = (await import('/js/core/docdb.js')).docdb(); const orig = D.col.bind(D); window.__failWall = true;
      D.col = name => (name === 'guests' && window.__failWall ? { where() { return this; }, orderBy() { return this; }, limit() { return this; }, get: () => Promise.reject(Object.assign(new Error('offline'), { code: 'unavailable' })), watch: () => () => {} } : orig(name));
    });
    await p.evaluate(() => { const m = JSON.parse(localStorage.getItem('wgb_mine') || '[]'); return m.length; });
    await p.click('#btn-mysnap').catch(() => {});
    await p.waitForSelector('#s-remote.active section.hub-row[data-hub="f-wall"]', { timeout: 8000 });
    await p.click('#s-remote section.hub-row[data-hub="f-wall"]');
    h.check('A6 the error text and the retry button appear', await until(p, () => document.querySelector('#s-f-wall .f-wall-status')?.textContent.includes('불러오지 못했어요') && !document.querySelector('#s-f-wall .f-wall-retry').hidden));
    await p.evaluate(() => { window.__failWall = false; });
    await p.click('#s-f-wall .f-wall-retry');
    h.check('A6 retry loads the list', await until(p, () => document.querySelectorAll('#s-f-wall .f-wall-card').length >= 5));
    h.check('A6 the error is gone', !(await p.textContent('#s-f-wall .f-wall-status')).includes('불러오지'));
  });

  // ---------------------------------------------------------------- S3 hot toggle (status ready = on by default → the admin flag)
  await h.step('S3 hot toggle: on by default · admin off → no trace · on again · default again', async () => {
    const ctx = await h.context('phone');
    const p = await h.page(ctx, { tag: 'hot' });
    await signGuest(h, p, { name: '토글하객' });
    const admin = await adminPage(h, ctx);
    await p.bringToFront();
    const row = () => until(p, () => !!document.querySelector('#s-done section.hub-row[data-hub="f-wall"]'));
    h.check('S3 default (ready): the row is there without any flag', await row());
    await setFlag(h, admin, ID, false);
    h.check('S3 off: the row is gone', await until(p, () => !document.querySelector('[data-f="wall"]')));
    await p.waitForTimeout(300);
    await expectClean(h, p, ID, 'S3 off');
    const st = await featureState(p, ID);
    h.eq('S3 off: nothing registered', st && st.live, { listeners: 0, timers: 0, raf: 0, watchers: 0, bus: 0 });
    await setFlag(h, admin, ID, true);
    h.check('S3 on again: the row is back (setup twice is safe)', await row());
    await p.click('#s-done section.hub-row[data-hub="f-wall"]');
    h.check('S3 …and the wall works', await until(p, () => document.querySelectorAll('#s-f-wall .f-wall-card').length >= 1));
    await p.click('#s-f-wall .f-wall-back');
    await setFlag(h, admin, ID, false);
    h.check('S3 (off once more)', await until(p, () => !document.querySelector('[data-f="wall"]')));
    await setFlag(h, admin, ID, null);
    h.check('S3 back to the default → the row returns', await row());
  });

  // ---------------------------------------------------------------- S4 pages · S5 kiosk / simple
  await h.step('S4/S5 not on the kiosk or the admin page · shown in simple (elder) mode', async () => {
    const k = await h.page('tablet', { tag: 'kiosk' });
    await k.goto(h.url('kiosk.html', { ff: on(ID) })); await k.waitForTimeout(1200);
    await expectClean(h, k, ID, 'S4 kiosk');
    h.check('S4 kiosk: the feature is not loaded', !(await featureState(k, ID))?.on);
    const a = await adminPage(h, 'desktop', { params: { ff: on(ID) } });
    h.check('S4 admin: not loaded (pages = guest · village)', !(await featureState(a, ID))?.on);
    const s = await h.page('phone', { tag: 'simple' });
    await signGuest(h, s, { name: '어르신', msg: '축하합니다', simple: true, params: { ff: on(ID) } });
    h.check('S5 simple mode: the row is there (simple: true)', await s.isVisible('#s-done section.hub-row[data-hub="f-wall"]'));
  });

  // ---------------------------------------------------------------- S6 English · S8 layout
  await h.step('S6 English: no Korean in the wall\'s own text · S8 layout on phone and phone SE', async () => {
    for (const preset of ['phone', 'phoneSE']) {
      const ctx = await h.context(preset);
      const p = await h.page(ctx, { tag: 'en-' + preset });
      await p.goto(h.url('index.html', { ff: on(ID) }));
      await h.store(p, s => s.addGuest({ name: 'Emma', side: 'bride', message: 'So happy for you!', avatar: {}, activity: 'walk' }, null));
      await h.store(p, s => s.addGuest({ name: 'Liam', side: 'groom', message: 'secret', priv: true, avatar: {}, activity: 'walk' }, null));
      await signGuest(h, p, { name: 'Noah', msg: 'Congratulations!', lang: 'en', open: false, params: { ff: on(ID) } });
      await p.click('#s-done section.hub-row[data-hub="f-wall"]');
      await until(p, () => document.querySelectorAll('#s-f-wall .f-wall-card').length >= 3);
      if (preset === 'phone') {
        const own = await p.evaluate(() => [...document.querySelectorAll('#s-f-wall .f-wall-top, #s-f-wall .f-wall-count, #s-f-wall .f-wall-seg, #s-f-wall .f-wall-side, #s-f-wall .f-wall-mine, #s-f-wall .f-wall-priv .f-wall-msg, #s-f-wall .f-wall-back, #s-done .hub-row[data-hub="f-wall"]')].map(n => n.textContent).join(' | '));
        h.check('S6 English: the wall\'s own text has no Hangul', !HANGUL.test(own), own.slice(0, 300));
        h.check('S6 English: dates in English', /[A-Z][a-z]{2} \d{1,2}, 20\d\d/.test(await p.textContent('#s-f-wall .f-wall-time')));
        await p.waitForTimeout(400);
        await h.shot(p, 'wall-6-english');
      }
      const r = await h.layoutReport(p);
      h.check(`S8 ${preset}: wall screen — no overlaps · no sideways scroll · tap targets`, r.overlaps.length === 0 && !r.hscroll && r.small.length === 0, JSON.stringify(r).slice(0, 400));
    }
  });
};

// ============================================================
//  WP-06 translate — docs/v4/wp/WP-06-translate.md · 04-testing §4.1 (S1–S9) + A1–A11
//  A fake self.Translator (addInitScript) answers "[EN] …" / "[KO] …". TV ticker second line · saved translations · admin tab.
// ============================================================
import fs from 'node:fs';
import { zipRead } from '../lib/files.mjs';
import { on, off, adminPage, setFlag, setCfg, expectClean, dbGet, dbSet, dbCol, featureState, expectDefault } from '../lib/v4.mjs';

const ID = 'translate';
export const meta = { title: 'translate: TV ticker second line from saved / built-in translation · admin fill · manual · auto · TV off switch · backup', timeout: 420000, tags: ['slow'] };

const HANGUL = /[ㄱ-힝]/;
const until = async (page, fn, arg, ms = 10000) => { const t0 = Date.now(); do { if (await page.evaluate(fn, arg).catch(() => false)) return true; await page.waitForTimeout(150); } while (Date.now() - t0 < ms); return false; };
/** the fake built-in translator: availability from window.__trAvail (default 'available'), create() counted, translate = "[DST] text" */
const FAKE = `(() => { self.Translator = {
  availability: async () => (self.__trAvail || 'available'),
  create: async ({ targetLanguage, monitor }) => {
    self.__trCreated = (self.__trCreated || 0) + 1;
    if (monitor) { const t = new EventTarget(); monitor(t); setTimeout(() => t.dispatchEvent(Object.assign(new Event('downloadprogress'), { loaded: 1 })), 5); }
    return { translate: async text => '[' + targetLanguage.toUpperCase() + '] ' + text };
  },
}; })();`;
/** this Chromium ships a real Translator (model "downloadable"): pages that must have no engine get it removed */
const NOENGINE = `(() => { try { delete self.Translator; } catch {} try { if ('Translator' in self) Object.defineProperty(self, 'Translator', { value: undefined, configurable: true, writable: true }); } catch {} })();`;
const msg2 = tv => tv.evaluate(() => document.querySelector('.hud .ticker .msg2')?.textContent || '');
const addGuest = (h, page, name, message) => h.store(page, (s, a) => s.addGuest({ name: a.name, side: 'both', message: a.message, avatar: {}, activity: 'walk' }, null).then(r => r.id), { name, message });

async function world(h, { fake = true, avail = 'available', guests = [['민수', '결혼 축하해요! 행복하세요']] } = {}) {
  const ctx = await h.context('tv');
  const a = await adminPage(h, ctx, { params: { ff: on(ID) } });
  const ids = []; for (const [n, m] of guests) ids.push(await addGuest(h, a, n, m));
  const tv = await h.page(ctx, { tag: 'tv' });
  if (fake) { await tv.addInitScript(FAKE); if (avail !== 'available') await tv.addInitScript(`self.__trAvail = ${JSON.stringify(avail)};`); }
  else await tv.addInitScript(NOENGINE);
  await tv.goto(h.url('village.html', { ff: on(ID), time: 'day' }));
  await until(tv, () => /^\d+$/.test(document.querySelector('#count-n')?.textContent || ''));
  return { ctx, a, tv, ids };
}

export default async (h) => {
  // ---------------------------------------------------------------- S1 off
  await h.step('S1 off: no trace on the TV (no second line) and admin', async () => {
    const c2 = await h.context('tv');
    const t = await h.page(c2, { tag: 'off' });
    await t.addInitScript(FAKE);
    await t.goto(h.url('village.html', { ff: off(ID), seed: 2, time: 'day' })); await t.waitForTimeout(2500);
    await expectClean(h, t, ID, 'S1 TV');
    h.eq('S1 no second ticker line', await msg2(t), '');
    const a = await adminPage(h, c2, { params: { ff: off(ID) } });
    await expectClean(h, a, ID, 'S1 admin');
    await c2.close();
  });

  // ---------------------------------------------------------------- A3 · A2 TV
  await h.step('A3 no saved translation + an engine → "🌐 [EN] …" on the TV, nothing written', async () => {
    const { ctx, a, tv, ids } = await world(h);
    h.check('A3 the second line shows the built-in translation', await until(tv, () => (document.querySelector('.hud .ticker .msg2')?.textContent || '') === '🌐 [EN] 결혼 축하해요! 행복하세요', null, 15000), await msg2(tv));
    h.eq('A3 no translations written', (await dbCol(h, a, 'translations')).length, 0);
    await h.shot(tv, 'translate-1-tv-line');
    // A2: a saved one wins … until the message changes
    h.check('A2 save a translation (admin)', (await dbSet(h, a, 'translations/' + ids[0], { src: 'ko', ko: '결혼 축하해요! 행복하세요', en: 'Congratulations! Be happy', engine: 'manual', updatedAt: { $sv: 'ts' } })).ok);
    h.check('A2 the TV shows the saved translation', await until(tv, () => (document.querySelector('.hud .ticker .msg2')?.textContent || '') === '🌐 Congratulations! Be happy', null, 15000), await msg2(tv));
    await h.store(a, (s, id) => s.updateGuest(id, { message: '두 분 오래오래 행복하세요' }), ids[0]);
    h.check('A2 the message changed → the stale saved one is ignored, the engine translates the new text', await until(tv, () => (document.querySelector('.hud .ticker .msg2')?.textContent || '') === '🌐 [EN] 두 분 오래오래 행복하세요', null, 15000), await msg2(tv));
    // an English message → Korean
    await h.store(a, (s, id) => s.updateGuest(id, { message: 'Congrats to you both!' }), ids[0]);
    h.check('A2 an English message → "[KO] …"', await until(tv, () => (document.querySelector('.hud .ticker .msg2')?.textContent || '') === '🌐 [KO] Congrats to you both!', null, 15000), await msg2(tv));
    // A8 the TV switch
    await setCfg(h, a, ID, { tv: false });
    h.check('A8 cfg.translate.tv = false → no second line', await until(tv, () => !(document.querySelector('.hud .ticker .msg2')?.textContent), null, 10000));
    await setCfg(h, a, ID, { tv: true });
    h.check('A8 back on', await until(tv, () => !!document.querySelector('.hud .ticker .msg2')?.textContent, null, 10000));
    // A9 layout: two ticker lines vs the banner and the QR
    await tv.mouse.click(300, 1000).catch(() => {});
    await addGuest(h, a, '새손님', '축하드려요');                                   // an arrival banner
    await tv.waitForTimeout(1500);
    const r = await h.layoutReport(tv);
    h.check('A9 TV with a two-line ticker: no overlaps (banner · QR)', !r.overlaps.length, r.overlaps.join(' | '));
    await h.shot(tv, 'translate-2-tv-two-lines');
    await ctx.close();
  });

  await h.step('A4 no engine → no second line and no errors · emoji-only / private messages are skipped', async () => {
    const { ctx, tv } = await world(h, { fake: false, guests: [['하객', '축하해요'], ['이모지', '🎉🎉'], ['비밀', '']] });
    await tv.waitForTimeout(6000);
    h.eq('A4 no second line without an engine', await msg2(tv), '');
    const st = await featureState(tv, ID);
    h.check('A4 the feature is on with 0 errors', st?.on === true && st.errors === 0 && !st.tripped, JSON.stringify(st));
    h.eq('A4 emoji-only and empty messages have nothing to translate', await tv.evaluate(async () => { const m = await import('/js/features/translate/shared.js'); return [m.sourceOf({ message: '🎉🎉' }), m.sourceOf({ message: '' }), m.sourceOf({ message: '비밀', priv: true }), m.sourceOf({ message: '축하해요' })?.dst]; }), [null, null, null, 'en']);
    await ctx.close();
  });

  await h.step('S2 the model must be downloaded → one small hint banner → the first click creates the translator → the line appears', async () => {
    const { ctx, tv } = await world(h, { avail: 'downloadable' });
    h.check('S2 the hint banner', !!(await h.waitBanner(tv, /번역을 켜려면 화면을 한 번 클릭해주세요/, 10000)));
    h.eq('S2 nothing created before a click', await tv.evaluate(() => self.__trCreated || 0), 0);
    await tv.mouse.click(400, 600);
    h.check('S2 the click created the translators', await until(tv, () => (self.__trCreated || 0) >= 2, null, 5000));
    h.check('S2 …and the line appears', await until(tv, () => /^🌐 \[EN\]/.test(document.querySelector('.hud .ticker .msg2')?.textContent || ''), null, 15000), await msg2(tv));
    await ctx.close();
  });

  // ---------------------------------------------------------------- admin
  await h.step('A5 · A6 · A7 admin: fill all → engine chrome · a manual edit survives another fill · auto-translate new guests', async () => {
    const ctx = await h.context('desktop');
    const a = await adminPage(h, ctx, { params: { ff: on(ID) } });
    await a.close();
    const b = await h.page(ctx, { tag: 'admin' });
    await b.addInitScript(FAKE);
    await b.goto(h.url('admin.html', { ff: on(ID) })); await b.waitForSelector('#main:not([hidden])');
    const ids = [];
    for (const [n, m] of [['가', '행복하세요'], ['나', 'Best wishes!'], ['다', '사랑해요'], ['라', '🎉']]) ids.push(await addGuest(h, b, n, m));
    await b.click('#atabs [data-tab="f-translate"]');
    h.check('A5 engine ready', await until(b, () => document.querySelector('.f-translate-engine')?.dataset.state === 'ready'));
    h.eq('A5 three rows (the emoji-only message has nothing to translate) · all "없음"', await b.$$eval('.f-translate-row', ns => ns.map(n => n.dataset.st)), ['none', 'none', 'none']);
    await h.shot(b, 'translate-3-admin');
    await b.click('.f-translate-fill');
    h.check('A5 progress shows 3 / 3', await until(b, () => /3 \/ 3/.test(document.querySelector('.f-translate-progress')?.textContent || '')));
    h.check('A5 three documents, engine chrome', await until(b, async () => { const db = await (await import('/js/core/docdb.js')).getDB(); const l = await db.col('translations').get(); return l.length === 3 && l.every(d => d.engine === 'chrome'); }));
    const d0 = await dbGet(h, b, 'translations/' + ids[0]), d1 = await dbGet(h, b, 'translations/' + ids[1]);
    h.check('A5 ko → en and en → ko', d0?.src === 'ko' && d0.en === '[EN] 행복하세요' && d1?.src === 'en' && d1.ko === '[KO] Best wishes!', JSON.stringify([d0, d1]));
    // A6 manual
    await b.fill(`.f-translate-row[data-gid="${ids[0]}"] .f-translate-ta`, 'Be happy, you two');
    await b.click(`.f-translate-row[data-gid="${ids[0]}"] .f-translate-save`);
    h.check('A6 saved as manual', await until(b, id => document.querySelector(`.f-translate-row[data-gid="${id}"]`)?.dataset.st === 'manual', ids[0]));
    await h.store(b, (s, id) => s.updateGuest(id, { message: '정말 행복하세요' }), ids[2]);  // one stale automatic one
    h.check('A6 a changed message shows "원문이 바뀜"', await until(b, id => document.querySelector(`.f-translate-row[data-gid="${id}"]`)?.dataset.st === 'stale', ids[2]));
    await b.check('.f-translate-filter');                      // filter: missing or stale only
    h.eq('A6 the filter shows only the stale one', await b.$$eval('.f-translate-row', ns => ns.map(n => n.dataset.gid)), [ids[2]]);
    await b.uncheck('.f-translate-filter');
    await b.click('.f-translate-fill');
    h.check('A6 fill again: the stale automatic one is redone', await until(b, async id => (await (await (await import('/js/core/docdb.js')).getDB()).doc('translations/' + id).get())?.en === '[EN] 정말 행복하세요', ids[2]));
    h.eq('A6 …the manual one is kept', (await dbGet(h, b, 'translations/' + ids[0]))?.en, 'Be happy, you two');
    // A7 auto
    await b.check('.f-translate-autobox');
    const nid = await addGuest(h, b, '마', '오늘 정말 아름다워요');
    h.check('A7 a new guest is translated and saved within 30 s', await until(b, async id => (await (await (await import('/js/core/docdb.js')).getDB()).doc('translations/' + id).get())?.en === '[EN] 오늘 정말 아름다워요', nid, 30000));
    // A10 backup
    const zip = await h.download(b, () => b.click('#btn-zip'), 'translate-backup.zip');
    const json = zip ? zipRead(fs.readFileSync(zip), 'f-translate/translations.json') : null;
    const n = (await dbCol(h, b, 'translations')).length;
    h.check(`A10 backup has f-translate/translations.json with the ${n} documents`, !!json && JSON.parse(json.toString()).length === n);
    // S7 rules mirror: guests cannot write translations
    const g = await h.page(ctx, { tag: 'guest' });
    await g.goto(h.url('index.html', { ff: on(ID) }));
    h.check('S7 a guest page cannot write a translation', (await dbSet(h, g, 'translations/' + ids[1], { src: 'en', en: 'x', ko: 'y', engine: 'manual', updatedAt: { $sv: 'ts' } })).ok === false);
    await ctx.close();
  });

  await h.step('A11 ?phase=pre: the admin tab opens and saves (translate ahead) · A9 admin on phoneSE · unsupported note', async () => {
    const ctx = await h.context('phoneSE');
    const a = await h.page(ctx, { tag: 'admin-pre' });
    await a.addInitScript(NOENGINE);
    await a.goto(h.url('admin.html', { ff: on(ID), phase: 'pre' })); await a.waitForSelector('#main:not([hidden])', { timeout: 15000 });
    const id = await addGuest(h, a, '미리', '미리 축하해요');
    await a.click('#atabs [data-tab="f-translate"]');
    h.check('A11 the unsupported note (no engine on this browser)', await until(a, () => document.querySelector('.f-translate-engine')?.dataset.state === 'none'));
    await a.fill(`.f-translate-row[data-gid="${id}"] .f-translate-ta`, 'Congrats in advance');
    await a.click(`.f-translate-row[data-gid="${id}"] .f-translate-save`);
    h.check('A11 saved in pre', await until(a, gid => document.querySelector(`.f-translate-row[data-gid="${gid}"]`)?.dataset.st === 'manual', id));
    const r = await h.layoutReport(a);
    h.check('A9 admin tab on phoneSE: no overlaps · no sideways scroll', !r.overlaps.length && !r.hscroll, JSON.stringify(r).slice(0, 300));
    await h.shot(a, 'translate-4-admin-phoneSE');
    await ctx.close();
  });

  await h.step('S3 hot toggle · S4 gates (phone village · guest page · TV in pre) · S6 English admin', async () => {
    const ctx = await h.context('tv');
    const a = await adminPage(h, ctx);
    await addGuest(h, a, '민수', '결혼 축하해요! 행복하세요');
    const tv = await h.page(ctx, { tag: 'hot' });
    await tv.addInitScript(FAKE);
    await tv.goto(h.url('village.html', { time: 'day' }));                            // no ?ff — the admin flag decides
    await until(tv, () => /^\d+$/.test(document.querySelector('#count-n')?.textContent || ''));
    await tv.waitForTimeout(1500);
    await expectDefault(h, tv, ID, 'S3 default (no ?ff, no admin flag)');
    await setFlag(h, a, ID, true);
    h.check('S3 on: the second line appears without reload', await until(tv, () => !!document.querySelector('.hud .ticker .msg2')?.textContent, null, 15000));
    await setFlag(h, a, ID, false);
    h.check('S3 off: the second line goes away', await until(tv, () => !(document.querySelector('.hud .ticker .msg2')?.textContent), null, 10000));
    await tv.waitForTimeout(300);
    await expectClean(h, tv, ID, 'S3 TV after off');
    await setFlag(h, a, ID, true);
    h.check('S3 on again: back', await until(tv, () => !!document.querySelector('.hud .ticker .msg2')?.textContent, null, 15000));
    await setFlag(h, a, ID, null);
    const ph = await h.page(ctx, { tag: 'phone' });
    await ph.addInitScript(FAKE);
    await ph.goto(h.url('village.html', { ff: on(ID), me: 'gnobody', time: 'day' })); await ph.waitForTimeout(1500);
    h.check('S4 a non-TV village page has no translation line', !(await ph.evaluate(() => document.querySelector('.hud .ticker .msg2')?.textContent)));
    const g = await h.page(ctx, { tag: 'guest' });
    await g.goto(h.url('index.html', { ff: on(ID) })); await g.waitForTimeout(600);
    await expectClean(h, g, ID, 'S4 guest page');
    const pre = await h.page(ctx, { tag: 'pre' });
    await pre.addInitScript(FAKE);
    await pre.goto(h.url('village.html', { ff: on(ID), phase: 'pre', time: 'day' })); await pre.waitForTimeout(2500);
    await expectClean(h, pre, ID, 'S4 TV in pre');
    const en = await h.page(ctx, { tag: 'en' });
    await en.addInitScript(() => localStorage.setItem('wgb_lang', 'en'));
    await en.goto(h.url('admin.html', { ff: on(ID) })); await en.waitForSelector('#main:not([hidden])');
    await en.click('#atabs [data-tab="f-translate"]');
    await until(en, () => !!document.querySelector('.f-translate-engine')?.dataset.state);
    h.check('S6 the tab in English (no Hangul in its own words)', !HANGUL.test(await en.evaluate(() => [...document.querySelectorAll('.f-translate-engine, .f-translate-fill, .f-translate-check span, .f-translate-st')].map(n => n.textContent).join(' '))));
    await ctx.close();
  });
};

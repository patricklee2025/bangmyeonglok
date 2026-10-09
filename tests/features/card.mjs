// ============================================================
//  WP-11 card — docs/v4/wp/WP-11-card.md · 04-testing §4.1 (S1–S9) + A1–A7
//  My pixel card: a 1080×1350 PNG with my character, my message and the village — guest page (hub row 60 → f-card) and phone village (action → sheet).
// ============================================================
import fs from 'node:fs';
import path from 'node:path';
import { REPO } from '../lib/harness.mjs';
import { signGuest } from '../lib/flows.mjs';
import { isPng, pngSize } from '../lib/files.mjs';
import { on, off, ff, adminPage, setFlag, expectClean, footprint, expectDefault, only } from '../lib/v4.mjs';

const ID = 'card';
export const meta = { title: 'card: my pixel card — hub row → screen, themes, deterministic PNG 1080×1350, phase lines, long text, village sheet', timeout: 420000, tags: ['slow'] };

const HANGUL = /[ㄱ-힝]/;
const LONG_MSG = '결혼 진심으로 축하해요! '.repeat(30).slice(0, 300);
const LONG_NAME = '아주아주긴이름을가진하객입니다정말로길어요아주아주긴이름'.slice(0, 30);
const ONLY = await only(ID);                                 // the bar shows card's own button (no "⋯" — every other feature off)

/** poll a page predicate (sync or async) */
const until = async (page, fn, arg, ms = 10000) => { const t0 = Date.now(); do { if (await page.evaluate(fn, arg).catch(() => false)) return true; await page.waitForTimeout(100); } while (Date.now() - t0 < ms); return false; };
const st = (p, root = '') => p.evaluate(r => { const c = document.querySelector(r + ' .f-card-canvas'); return c?.dataset.st ? JSON.parse(c.dataset.st) : null; }, root);
/** FNV-1a over the card's pixels (the whole 1080×1350) */
const hash = (p, root = '') => p.evaluate(r => {
  const c = document.querySelector(r + ' .f-card-canvas'); if (!c || c.width !== 1080) return null;
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let x = 0x811c9dc5;
  for (let i = 0; i < d.length; i += 4) { x ^= d[i] | (d[i + 1] << 8) | (d[i + 2] << 16); x = Math.imul(x, 0x01000193) >>> 0; }
  return x.toString(16);
}, root);
/** wait until the card on screen is drawn with this theme and the save button is live */
const drawn = (p, theme, root = '') => until(p, ([r, t]) => { const c = document.querySelector(r + ' .f-card-canvas'); return c?.width === 1080 && c.dataset.theme === t && !document.querySelector(r + ' .f-card-save')?.disabled; }, [root, theme], 15000);
const pickTheme = async (p, theme, root = '') => { await p.click(`${root} .f-card-theme[data-theme="${theme}"]`); return drawn(p, theme, root); };
const row = p => p.$('#s-done section.hub-row[data-hub="f-card"]');

/** sign on a phone, then open the card from the done screen */
async function openCard(h, p, opts) {
  const { gid } = await signGuest(h, p, opts);
  const r = await row(p);
  await r?.scrollIntoViewIfNeeded(); await p.waitForTimeout(300);
  await r?.click();
  await until(p, () => !!document.querySelector('#s-f-card.active'));
  await drawn(p, 'day', '#s-f-card');
  return gid;
}

export default async (h) => {
  // ---------------------------------------------------------------- S1 off
  await h.step('S1 off: no row on the done screen, no button in the phone village; the core still works', async () => {
    const ctx = await h.context('phone');
    const p = await h.page(ctx, { tag: 'off' });
    const { gid } = await signGuest(h, p, { name: '끄기하객', params: { ff: off(ID) } });
    await expectClean(h, p, ID, 'S1 done screen');
    h.check('S1 the core done screen is complete', await p.isVisible('#remote-done'));
    await p.goto(h.url('village.html', { me: gid, ff: off(ID) })); await p.waitForTimeout(1500);
    await expectClean(h, p, ID, 'S1 phone village');
    h.check('S1 the phone village works', /^\d+$/.test(await p.textContent('#count-n')) && await p.isVisible('#mremote'));
    await ctx.close();
  });

  // ---------------------------------------------------------------- A1 / S2 row → screen · A2 PNG · A3 themes
  let world = null, me = null, page = null;
  await h.step('S2 / A1 done screen: 🃏 row at order 60 → the card screen with a drawn card', async () => {
    world = await h.context('phone');
    page = await h.page(world, { tag: 'guest' });
    const { gid } = await signGuest(h, page, { name: '카드하객', msg: '두 분 결혼 축하해요! 행복하게 사세요', side: 'bride', params: { ff: on(ID) } });
    me = gid;
    const r = await row(page);
    h.check('S2 the row is on the done screen', !!r && await r.isVisible());
    h.eq('S2 …at order 60, title without a second 🃏 (the hub draws the icon)', r && await r.evaluate(n => [n.style.order, n.querySelector('.hub-ico').textContent, n.querySelector('.hub-title').textContent]), ['60', '🃏', '내 픽셀 카드']);
    await r.scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
    await h.shot(page, 'card-1-done-row');
    await r.click();
    h.check('A1 the row opens the card screen', await until(page, () => !!document.querySelector('#s-f-card.active')));
    h.check('A1 the card is drawn (day theme) and the save button turns on', await drawn(page, 'day', '#s-f-card'));
    const s = await st(page, '#s-f-card');
    h.eq('A1 renderer input: name · side · message · line (live) · footer code', s && [s.name, s.side, s.msg, s.line, /^PIXEL VILLAGE · 하객 코드 [2-9A-HJ-NP-Z]{4}$/.test(s.footer)], ['카드하객님', 'bride', ['두 분 결혼 축하해요! 행복하게 사세요'], '함께 축하해요!', true]);
    h.check('A1 the QR points at my character in the village', !!s && new URL(s.url).pathname.endsWith('/village.html') && new URL(s.url).searchParams.get('me') === me, s?.url);
    await page.waitForTimeout(300);
    await h.shot(page, 'card-2-screen-day');
  });

  await h.step('A2 💾 save → a PNG download of 1080×1350 named pixel-card-<code>.png', async () => {
    const code = await page.evaluate(async id => (await import('/js/core/ui.js')).guestCode(id), me);
    let name = null;
    const file = await h.download(page, async () => { page.once('download', d => { name = d.suggestedFilename(); }); await page.click('#s-f-card .f-card-save'); }, 'card-day.png');
    const buf = file ? fs.readFileSync(file) : Buffer.alloc(0);
    h.check('A2 the download is a PNG of 1080×1350', isPng(buf) && pngSize(buf).width === 1080 && pngSize(buf).height === 1350, file ? JSON.stringify(pngSize(buf)) : 'no download');
    h.eq('A2 the file name carries my guest code', name, `pixel-card-${code}.png`);
    h.check('A2 the status says saved', await until(page, () => /저장했어요/.test(document.querySelector('#s-f-card .f-card-status')?.textContent || '')));
  });

  await h.step('A3 three themes → three different pictures · the same theme twice → the same picture', async () => {
    const day = await hash(page, '#s-f-card');
    h.check('A3 sunset drawn', await pickTheme(page, 'sunset', '#s-f-card'));
    const sunset = await hash(page, '#s-f-card');
    await h.shot(page, 'card-3-sunset');
    h.check('A3 night drawn', await pickTheme(page, 'night', '#s-f-card'));
    const night = await hash(page, '#s-f-card');
    await h.shot(page, 'card-4-night');
    h.check('A3 day again', await pickTheme(page, 'day', '#s-f-card'));
    const day2 = await hash(page, '#s-f-card');
    h.check('A3 day · sunset · night are three different images', !!day && new Set([day, sunset, night]).size === 3, JSON.stringify({ day, sunset, night }));
    h.eq('A3 day twice → the same image (deterministic)', day2, day);
    await pickTheme(page, 'night', '#s-f-card');
    h.eq('A3 night twice → the same image', await hash(page, '#s-f-card'), night);
    const s = await st(page, '#s-f-card');
    h.eq('A3 the theme buttons say which one is on', await page.$$eval('#s-f-card .f-card-theme', ns => ns.map(n => n.getAttribute('aria-pressed'))), ['false', 'false', 'true']);
    h.eq('A3 renderer input follows the theme', s?.theme, 'night');
    // the saved file is the theme on screen
    const file = await h.download(page, () => page.click('#s-f-card .f-card-save'), 'card-night.png');
    h.check('A3 the night card saves as a PNG too', !!file && isPng(fs.readFileSync(file)));
  });

  await h.step('A1 leaving the screen lets the big canvas go; coming back draws it again', async () => {
    await page.click('#s-f-card .f-card-back');
    await until(page, () => !document.querySelector('#s-f-card.active'));
    h.eq('A1 after back: the canvas is released (1×1)', await page.evaluate(() => document.querySelector('#s-f-card .f-card-canvas').width), 1);
    const r = await row(page); await r.scrollIntoViewIfNeeded(); await r.click();
    h.check('A1 back in: drawn again', await until(page, () => document.querySelector('#s-f-card .f-card-canvas')?.width === 1080 && !!document.querySelector('#s-f-card .f-card-canvas').dataset.st, null, 15000));
    await world.close();
  });

  // ---------------------------------------------------------------- A4 phase lines
  await h.step('A4 the line follows the phase: pre · live · after', async () => {
    const ctx = await h.context('phone');
    const p = await h.page(ctx, { tag: 'phases' });
    const want = { pre: '결혼식 날 만나요!', live: '함께 축하해요!', after: '함께해 주셔서 고마워요' };
    await openCard(h, p, { name: '페이즈', msg: '축하해요', params: { ff: on(ID), phase: 'pre' } });
    h.eq('A4 pre', (await st(p, '#s-f-card'))?.line, want.pre);
    for (const phase of ['live', 'after']) {
      await p.goto(h.url('index.html', { ff: on(ID), phase })); await p.waitForTimeout(600);
      // a returning guest: "my space" (#s-remote) has the same hub row
      const opened = await p.evaluate(() => { const b = document.querySelector('#btn-mysnap'); if (b && !b.closest('[hidden]')) { b.click(); return true; } return false; });
      await until(p, () => !!document.querySelector('#s-remote.active section.hub-row[data-hub="f-card"]'));
      await p.click('#s-remote section.hub-row[data-hub="f-card"]');
      await drawn(p, 'day', '#s-f-card');
      h.eq(`A4 ${phase}${opened ? ' (from my space)' : ''}`, (await st(p, '#s-f-card'))?.line, want[phase]);
    }
    await ctx.close();
  });

  // ---------------------------------------------------------------- A5 long text · voice only · private
  await h.step('A5 a 300-character message → 3 lines ending in …; a 30-character name → one line ending in …', async () => {
    const ctx = await h.context('phone');
    const p = await h.page(ctx, { tag: 'long' });
    await openCard(h, p, { name: LONG_NAME, msg: LONG_MSG, params: { ff: on(ID) } });
    const s = await st(p, '#s-f-card');
    h.check('A5 three lines, the last one cut with …', s?.msg?.length === 3 && s.msg[2].endsWith('…') && !s.msg[0].endsWith('…'), JSON.stringify(s?.msg));
    h.check('A5 the long name is cut with … on one line', !!s && s.name.endsWith('…') && s.name.length < LONG_NAME.length + 1, s?.name);
    const r = await h.layoutReport(p);
    h.check('A5 no layout problems on the card screen', !r.overlaps.length && !r.hscroll, JSON.stringify(r).slice(0, 300));
    await h.shot(p, 'card-5-long');
    await ctx.close();
  });

  await h.step('A5 voice only → 🎤 line · "only for the couple" → the private line (never the text)', async () => {
    const ctx = await h.context('phone');
    const p = await h.page(ctx, { tag: 'voice' });
    await openCard(h, p, { name: '목소리', msg: '', voiceMs: 1200, params: { ff: on(ID) } });
    h.eq('A5 voice only', (await st(p, '#s-f-card'))?.msg, ['🎤 음성 메시지를 남겼어요']);
    const q = await h.page(ctx, { tag: 'priv' });
    await openCard(h, q, { name: '비밀', msg: '두 분만 보세요 비밀이에요', priv: true, params: { ff: on(ID) } });
    const s = await st(q, '#s-f-card');
    h.check('A5 private → the private line, the text is nowhere on the card', JSON.stringify(s?.msg) === JSON.stringify(['💌 신랑·신부에게만 마음을 전했어요']) && !JSON.stringify(s).includes('비밀이에요'), JSON.stringify(s?.msg));
    await ctx.close();
  });

  // ---------------------------------------------------------------- A6 phone village → sheet → save
  await h.step('A6 phone village: 🃏 button → sheet with the card → save', async () => {
    const ctx = await h.context('phone');
    const p = await h.page(ctx, { tag: 'village' });
    const { gid } = await signGuest(h, p, { name: '마을카드', msg: '마을에서 축하해요', side: 'groom', params: { ff: ONLY } });
    await p.goto(h.url('village.html', { me: gid, ff: ONLY })); await p.waitForTimeout(1500);
    const btn = '#mremote [data-fa="f-card"]';
    h.check('A6 the 🃏 button is on the bar', await until(p, s => !!document.querySelector(s), btn));
    h.eq('A6 …icon and label', await p.$eval(btn, b => [b.firstChild.textContent, b.querySelector('small').textContent]), ['🃏', '카드']);
    await p.click(btn);
    h.check('A6 the sheet opens with a drawn card', await drawn(p, 'day', '#fsheet'));
    const s = await st(p, '#fsheet');
    h.eq('A6 the sheet card is mine (from the village list — no extra read)', s && [s.name, s.side, s.msg], ['마을카드님', 'groom', ['마을에서 축하해요']]);
    await p.waitForTimeout(300);
    await h.shot(p, 'card-6-village-sheet');
    const file = await h.download(p, () => p.click('#fsheet .f-card-save'), 'card-village.png');
    const buf = file ? fs.readFileSync(file) : Buffer.alloc(0);
    h.check('A6 saves a 1080×1350 PNG from the village', isPng(buf) && pngSize(buf).width === 1080 && pngSize(buf).height === 1350);
    const r = await h.layoutReport(p);
    h.check('A6 / S8 the sheet: no overlaps', !r.overlaps.length, r.overlaps.join(' | '));
    // with the wall also on, the card sits behind "⋯"
    await p.goto(h.url('village.html', { me: gid, ff: on(ID, 'wall') })); await p.waitForTimeout(1500);
    await until(p, () => !!document.querySelector('#mremote [data-fa="more"]'));
    await p.click('#mremote [data-fa="more"]');
    h.check('A6 with two actions the card is in the "⋯" list', await until(p, () => !!document.querySelector('#fsheet .fa-item[data-fa="f-card"]')));
    await ctx.close();
  });

  await h.step('S5 (WP) no remembered guest → no button in the village; the TV never shows it', async () => {
    const ctx = await h.context('phone');
    const p = await h.page(ctx, { tag: 'noone' });
    // the feature is on (its stylesheet is linked) but adds nothing: no button, no node
    const nothing = async (pg, label) => { const f = await footprint(pg, ID); h.check(`${label}: no 🃏 button, no node`, f.nodes === 0 && !(await pg.$('[data-fa="f-card"]')), JSON.stringify(f)); };
    await p.goto(h.url('village.html', { ff: on(ID), seed: 4 })); await p.waitForTimeout(1500);
    await nothing(p, 'S5 phone village without a guest');
    await ctx.close();
    const tvc = await h.context('tv');
    const tv = await h.page(tvc, { tag: 'tv' });
    await tv.goto(h.url('village.html', { ff: on(ID), seed: 4 })); await tv.waitForTimeout(1500);
    await nothing(tv, 'S5 TV');
    await tvc.close();
  });

  // ---------------------------------------------------------------- S3 hot toggle · S4 pages
  await h.step('S3 hot toggle on the done screen: manifest default → on → row → off → gone → on', async () => {
    const ctx = await h.context('phone');
    const p = await h.page(ctx, { tag: 'hot' });
    await signGuest(h, p, { name: '토글', msg: '토글' });
    await expectDefault(h, p, ID, 'S3 default (no ?ff, no admin flag)');
    const admin = await adminPage(h, ctx);
    await setFlag(h, admin, ID, true);
    h.check('S3 on: the row appears without reload', await until(p, () => !!document.querySelector('#s-done section.hub-row[data-hub="f-card"]')));
    await p.click('#s-done section.hub-row[data-hub="f-card"]');
    h.check('S3 the screen works', await drawn(p, 'day', '#s-f-card'));
    await setFlag(h, admin, ID, false);
    await until(p, () => !document.querySelector('[data-f="card"]:not(link)'));
    await p.waitForTimeout(300);
    await expectClean(h, p, ID, 'S3 after off (the open screen went away too)');
    h.check('S3 after off: back on a core screen', await p.evaluate(() => !!document.querySelector('.screen.active') && !document.querySelector('#s-f-card')));
    await setFlag(h, admin, ID, true);
    h.check('S3 on again: one row', await until(p, () => document.querySelectorAll('#s-done section.hub-row[data-hub="f-card"]').length === 1));
    await setFlag(h, admin, ID, null);
    await ctx.close();
  });

  await h.step('S4 kiosk and admin never load it (not in the manifest pages)', async () => {
    const ctx = await h.context('tablet');
    const k = await h.page(ctx, { tag: 'kiosk' });
    await k.goto(h.url('kiosk.html', { ff: on(ID) })); await k.waitForTimeout(1000);
    await expectClean(h, k, ID, 'S4 kiosk');
    const a = await adminPage(h, ctx, { params: { ff: on(ID) } }); await a.waitForTimeout(500);
    await expectClean(h, a, ID, 'S4 admin');
    await ctx.close();
  });

  await h.step('S5 simple (elder) mode shows the row too (simple ✓)', async () => {
    const ctx = await h.context('phone');
    const p = await h.page(ctx, { tag: 'simple' });
    await signGuest(h, p, { name: '어르신', msg: '축하합니다', simple: true, params: { ff: on(ID) } });
    h.check('S5 the row is on the simple done screen', !!(await row(p)) && await (await row(p)).isVisible());
    await ctx.close();
  });

  // ---------------------------------------------------------------- S6 English
  await h.step('S6 English: row, screen and the card words — no Hangul', async () => {
    const ctx = await h.context('phone');
    const p = await h.page(ctx, { tag: 'en' });
    await openCard(h, p, { name: 'Noah', msg: 'Congratulations to you both!', side: 'groom', lang: 'en', params: { ff: on(ID) } });
    const s = await st(p, '#s-f-card');
    const screen = await p.evaluate(() => document.querySelector('#s-f-card').innerText);
    h.check('S6 the screen has no Hangul', !HANGUL.test(screen), screen.slice(0, 200));
    h.eq('S6 card words in English', s && [s.name, s.line, s.footer.replace(/[2-9A-HJ-NP-Z]{4}$/, 'CODE')], ['Noah', 'Celebrating together!', 'PIXEL VILLAGE · guest code CODE']);
    await h.shot(p, 'card-7-en');
    await ctx.close();
  });

  // ---------------------------------------------------------------- S7 data · A7 layout
  await h.step('S7 no writes: the feature only reads guests/{gid} (WP-11: 쓰기 없음)', async () => {
    const dir = path.join(REPO, 'public/js/features', ID);
    const src = fs.readdirSync(dir).filter(f => f.endsWith('.js')).map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
    h.check('S7 no ctx.db writes and no localStorage', !/\.(set|update|delete)\(\s*\{|\.batch\(|localStorage/.test(src) && /ctx\.db\.doc\('guests\/'/.test(src));
  });

  for (const k of ['phoneSE', 'phoneLandscape']) {
    await h.step(`A7 / S8 layout ${k}: the card screen has no overlaps, the save button is reachable`, async () => {
      const ctx = await h.context(k);
      const p = await h.page(ctx, { tag: `layout-${k}` });
      await openCard(h, p, { name: '배치', msg: '레이아웃 확인', params: { ff: on(ID) } });
      const r = await h.layoutReport(p);
      h.check(`A7 ${k}: no overlaps · no sideways scroll · tap targets`, !r.overlaps.length && !r.hscroll && !r.small.length, JSON.stringify(r).slice(0, 300));
      h.check(`A7 ${k}: the save button is on screen`, await p.evaluate(() => { const b = document.querySelector('#s-f-card .f-card-save').getBoundingClientRect(); return b.bottom <= innerHeight && b.top >= 0; }));
      await h.shot(p, `card-layout-${k}`);
      await ctx.close();
    });
  }
};

// ============================================================
//  WP-01 prereg — docs/v4/wp/WP-01-prereg.md §9 (A1–A12) · 04-testing §4.1 (S1–S9)
//  Move in early (pre) → a pixel ticket · check in on the day (phone card · entrance #checkin · kiosk) → the TV village lets them in.
//  Demo time is real time (2026), so every guest made by a test is "before the wedding" (isPre). Rehearsal (?phase=live) counts guests
//  made in the last 12 h as walk-ins — tests age the pre-registered ones by two days straight in the demo store.
// ============================================================
import fs from 'node:fs';
import { signGuest } from '../lib/flows.mjs';
import { on, off, adminPage, setFlag, setCfg, expectClean, featureState, footprint, dbGet, dbSet, expectDefault } from '../lib/v4.mjs';
import { zipRead, isPng, pngSize } from '../lib/files.mjs';

const ID = 'prereg';
export const meta = { title: 'prereg: move in early → ticket → check in on the day (phone · entrance · kiosk) → the TV lets them in', timeout: 600000, tags: ['slow'] };

const HANGUL = /[ㄱ-힝]/;
const DAY = 86400e3;
const until = async (page, fn, arg, ms = 8000) => { const t0 = Date.now(); do { if (await page.evaluate(fn, arg).catch(() => false)) return true; await page.waitForTimeout(100); } while (Date.now() - t0 < ms); return false; };
const text = (p, sel) => p.textContent(sel).then(s => (s || '').trim()).catch(() => null);
const shown = (p, sel) => p.evaluate(s => { const e = document.querySelector(s); return !!e && !e.hidden && !e.closest('[hidden]') && getComputedStyle(e).display !== 'none'; }, sel);

/** write demo guests straight into this browser's demo store (other tabs pick it up through the storage event) */
const seed = (page, list) => page.evaluate(list => {
  const KEY = 'wgb_demo_guests', cur = JSON.parse(localStorage.getItem(KEY) || '[]');
  for (const g of list) cur.push({ id: g.id, name: g.name, side: g.side || 'both', message: g.message || '축하해요', avatar: g.avatar || {}, activity: 'walk', hidden: !!g.hidden, hasPhoto: false, hasVoice: false, hasCapsule: false, createdAt: g.createdAt ?? Date.now() });
  localStorage.setItem(KEY, JSON.stringify(cur));
}, list);
/** make a guest look like they moved in two days ago (rehearsal walk-in boundary = 12 h) */
const age = (page, ids) => page.evaluate(([ids, t]) => {
  const KEY = 'wgb_demo_guests', cur = JSON.parse(localStorage.getItem(KEY) || '[]');
  for (const g of cur) if (ids.includes(g.id)) g.createdAt = t;
  localStorage.setItem(KEY, JSON.stringify(cur));
}, [ids, Date.now() - 2 * DAY]);
const checkin = (h, page, gid, via = 'phone') => dbSet(h, page, 'checkins/' + gid, { via, createdAt: { $sv: 'ts' } });
/** record every village:guests list from the very first one (the gate check — A8) */
const RECORD = `(() => { window.__vg = []; import('/js/core/bus.js').then(b => b.on('village:guests', p => window.__vg.push(p.list.map(g => g.id)))); })();`;
const ids = p => p.evaluate(async () => (await import('/js/core/bus.js')).last('village:guests')?.list.map(g => g.id).sort() || []);

export default async (h) => {
  // ---------------------------------------------------------------- S1 off
  await h.step('S1 off: no trace on the guest page (pre · live), kiosk, TV and admin; the core works as v3.2', async () => {
    const ctx = await h.context('phone');
    const p = await h.page(ctx, { tag: 'off' });
    await p.goto(h.url('index.html', { ff: off(ID), phase: 'pre' })); await p.waitForTimeout(900);
    await expectClean(h, p, ID, 'S1 guest (pre)');
    h.eq('S1 the core start button keeps its own text', await text(p, '#btn-start'), '방명록 남기기');
    await p.goto(h.url('index.html', { ff: off(ID), phase: 'live' })); await p.waitForTimeout(700);
    await expectClean(h, p, ID, 'S1 guest (live)');
    const k = await h.page('tablet', { tag: 'off-kiosk' });
    await k.goto(h.url('kiosk.html', { ff: off(ID) })); await k.waitForTimeout(700);
    await expectClean(h, k, ID, 'S1 kiosk');
    const tv = await h.page('tv', { tag: 'off-tv' });
    await tv.goto(h.url('village.html', { ff: off(ID), seed: 8, time: 'day' })); await tv.waitForTimeout(1500);
    await expectClean(h, tv, ID, 'S1 TV');
    h.eq('S1 TV: every seeded villager is there (no presence filter)', await text(tv, '#count-n'), '8');
    const a = await adminPage(h, 'desktop', { params: { ff: off(ID) } });
    await expectClean(h, a, ID, 'S1 admin');
  });

  // ---------------------------------------------------------------- A2 · A3 · A4 before the wedding
  let world = null, mine = null;
  await h.step('A2–A4 pre: the welcome texts move in · the done screen carries the ticket (order 10) · PNG 720×1280 · .ics', async () => {
    world = await h.context('phone');
    const a = await adminPage(h, world, { params: { ff: on(ID) } });
    await setCfg(h, a, ID, { time: '17:00' });
    await a.close();
    const p = await h.page(world, { tag: 'pre' });
    await p.goto(h.url('index.html', { ff: on(ID), phase: 'pre' }));
    h.check('A2 start button → "🏡 마을에 미리 입주하기"', await until(p, () => document.querySelector('#btn-start').textContent === '🏡 마을에 미리 입주하기'));
    h.eq('A2 welcome sub', await p.textContent('[data-i18n="welcome_sub"]'), '결혼식 전에 내 픽셀 캐릭터를 만들어 두면,\n결혼식 날 체크인할 때 TV 마을에 짠! 하고 등장해요');
    await h.shot(p, 'prereg-1-pre-welcome');
    mine = (await signGuest(h, p, { name: '입주하객', msg: '미리 축하해요!', side: 'bride', open: false, params: { ff: on(ID), phase: 'pre' } })).gid;
    h.eq('A2 done title / sub / village link', [await text(p, '#s-done h2'), await text(p, '#s-done .done-head p'), await text(p, '#link-village [data-i18n="view_village"]')],
      ['입주 완료! 🏡', '결혼식 날 입구에서 체크인하면 TV 마을에 등장해요', '마을 구경하기']);
    const card = await p.waitForSelector('#s-done section.hub-card[data-hub="f-prereg"]', { timeout: 8000 }).catch(() => null);
    h.check('A3 the ticket card is on the done screen at order 10', !!card && await card.evaluate(n => n.style.order) === '10');
    h.check('A4 …with a 720×1280 ticket whose QR link opens this guest (#me=<gid>)', await until(p, gid => { const c = document.querySelector('#s-done .f-prereg-ticket'); return !!c && c.width === 720 && c.height === 1280 && c.dataset.url.includes('#me=' + encodeURIComponent(gid)); }, mine));
    await p.waitForTimeout(300);
    await card.scrollIntoViewIfNeeded(); await h.shot(p, 'prereg-2-pre-done');
    const png = await h.download(p, () => p.click('#s-done .f-prereg-save'), 'prereg-ticket.png');
    const buf = png ? fs.readFileSync(png) : Buffer.alloc(0);
    h.check('A3 💾 saves a PNG (download) of 720×1280', isPng(buf) && pngSize(buf).width === 720 && pngSize(buf).height === 1280, png ? JSON.stringify(pngSize(buf)) : 'no download');
    const ics = await h.download(p, () => p.click('#s-done .f-prereg-cal'), 'prereg-wedding.ics');
    const cal = ics ? fs.readFileSync(ics, 'utf8') : '';
    h.check('A3 📅 the calendar file starts at 17:00 Orlando time (DTSTART:20270410T210000Z) and names the venue', /DTSTART:20270410T210000Z/.test(cal) && /LOCATION:2700 Weston Ln\\, Orlando\\, FL 32810/.test(cal), cal.slice(0, 400));
    // the ticket screen
    await p.click('#s-done .f-prereg-mini');
    h.check('A4 tapping the card opens the ticket screen', await until(p, () => !!document.querySelector('#s-f-prereg-ticket.active canvas.f-prereg-ticket')));
    await p.waitForTimeout(400); await h.shot(p, 'prereg-3-ticket');
    // coming back to the welcome page: the "view my ticket" row (order 10) and the "already moved in" notice
    await p.goto(h.url('index.html', { ff: on(ID), phase: 'pre' })); await p.waitForTimeout(900);
    h.check('A2 returning: "already moved in" notice', (await text(p, '#already')) === '이미 입주하셨어요! 입장권은 아래에 있어요' && await shown(p, '#already'));
    h.check('S2 returning: the "🎟 내 입장권 보기" row in the welcome slot', await shown(p, '#slot-welcome .f-prereg-ticketrow'));
    await p.click('#slot-welcome .f-prereg-ticketrow');
    h.check('S2 …opens my ticket', await until(p, gid => document.querySelector('#s-f-prereg-ticket.active canvas.f-prereg-ticket')?.dataset.gid === gid, mine));
    // without a time the calendar entry is all-day
    const a2 = await adminPage(h, world, { params: { ff: on(ID) } });
    await setCfg(h, a2, ID, { time: '' }); await a2.close(); await p.bringToFront();
    const ics2 = await h.download(p, () => p.click('#s-f-prereg-ticket .f-prereg-cal'), 'prereg-allday.ics');
    h.check('A3 no ceremony time yet → an all-day entry (DTSTART;VALUE=DATE:20270410)', /DTSTART;VALUE=DATE:20270410/.test(ics2 ? fs.readFileSync(ics2, 'utf8') : ''));
  });

  // ---------------------------------------------------------------- A5 on the day: the remembered phone
  await h.step('A5 live phone: the check-in card → confirm → done · checkins/<gid> (via phone) · the second time says "already"', async () => {
    const p = await h.page(world, { tag: 'live' });
    await p.goto(h.url('index.html', { ff: on(ID), phase: 'live' }));
    h.check('A5 the big check-in card is at the top of the welcome slot', await until(p, () => !document.querySelector('#slot-welcome .f-prereg-card').hidden));
    h.eq('A5 …in the WP wording', await text(p, '.f-prereg-card .f-prereg-cardtext b'), '🎟 입주하객님 체크인하기');
    h.check('A5 …its button is at least 64 px tall', (await p.$eval('.f-prereg-go', b => b.getBoundingClientRect().height)) >= 64);
    await h.shot(p, 'prereg-4-live-card');
    await p.click('.f-prereg-go');
    h.check('A5 confirm screen asks', await until(p, () => document.querySelector('#s-f-prereg-confirm.active .f-prereg-q')?.textContent === '입주하객님으로 체크인할까요?'));
    await p.click('.f-prereg-yes');
    h.check('A5 done screen', await until(p, () => !!document.querySelector('#s-f-prereg-in.active')));
    h.eq('A5 …"체크인 완료! 🎉" + the name', [await text(p, '#s-f-prereg-in h2'), await text(p, '#s-f-prereg-in .f-prereg-sub')], ['체크인 완료! 🎉', 'TV 마을에 입주하객님이 입장했어요']);
    await p.waitForTimeout(300); await h.shot(p, 'prereg-5-checked-in');
    const doc = await dbGet(h, p, 'checkins/' + mine);
    h.eq('A5 checkins/<gid> exists with via "phone"', doc && doc.via, 'phone');
    await p.goto(h.url('index.html', { ff: on(ID), phase: 'live' })); await p.waitForTimeout(1200);
    h.check('A5 after checking in, the card is gone', await p.evaluate(() => document.querySelector('#slot-welcome .f-prereg-card')?.hidden === true));
    // the entrance poster with this phone → confirm (via entrance) → "already"
    await p.goto(h.url('index.html', { ff: on(ID), phase: 'live' }) + '#checkin');
    h.check('A6 #checkin with a remembered guest → the confirm screen', await until(p, () => !!document.querySelector('#s-f-prereg-confirm.active')));
    await p.click('.f-prereg-yes');
    h.check('A5 a second check-in is "이미 체크인했어요" (and still a done screen)', await until(p, () => document.querySelector('#s-f-prereg-in.active .f-prereg-note')?.textContent === '이미 체크인했어요'));
    h.eq('A5 …the stored via is still the first one', (await dbGet(h, p, 'checkins/' + mine)).via, 'phone');
    h.check('S5 the done screen offers 📷 photos·remote and 🏡 the village', await shown(p, '.f-prereg-mine') && (await p.getAttribute('.f-prereg-village', 'href')).includes('me=' + mine));
  });

  // ---------------------------------------------------------------- A6 the entrance poster on a new phone
  await h.step('A6 #checkin on a phone that never wrote: find by name → pick → confirm (via entrance) → this phone remembers', async () => {
    const ctx = await h.context('phone');
    const setup = await h.page(ctx, { tag: 'seed' });
    await setup.goto(h.url('index.html', { ff: off(ID) }));
    await seed(setup, [{ id: 'gfind1', name: '김하객', side: 'groom', createdAt: Date.now() - 2 * DAY }, { id: 'gfind2', name: '김하늘', side: 'bride', createdAt: Date.now() - 2 * DAY }, { id: 'gfind3', name: '숨은김', hidden: true, createdAt: Date.now() - 2 * DAY }]);
    await setup.close();
    const p = await h.page(ctx, { tag: 'entrance' });
    await p.goto(h.url('index.html', { ff: on(ID), phase: 'live' }) + '#checkin');
    h.check('A6 no remembered guest → the find-by-name screen', await until(p, () => !!document.querySelector('#s-f-prereg-find.active')));
    h.eq('A6 the hash is cleared (a reload does not jump again)', await p.evaluate(() => location.hash), '');
    await p.fill('.f-prereg-input', '김하');
    h.check('A6 typing filters (hidden guests never show)', await until(p, () => [...document.querySelectorAll('.f-prereg-hit')].map(b => b.dataset.gid).sort().join() === 'gfind1,gfind2'));
    await p.waitForTimeout(200); await h.shot(p, 'prereg-6-find');
    await p.fill('.f-prereg-input', 'zzz');
    h.check('A6 no match → "이름을 찾을 수 없어요…"', await until(p, () => document.querySelector('#s-f-prereg-find .f-prereg-msg')?.textContent.startsWith('이름을 찾을 수 없어요')));
    await p.fill('.f-prereg-input', '김하객');
    await p.click('.f-prereg-hit[data-gid="gfind1"]');
    h.check('A6 pick → confirm', await until(p, () => document.querySelector('#s-f-prereg-confirm.active .f-prereg-q')?.textContent === '김하객님으로 체크인할까요?'));
    await p.click('.f-prereg-yes');
    h.check('A6 done', await until(p, () => !!document.querySelector('#s-f-prereg-in.active')));
    h.eq('A6 checkins/gfind1 via "entrance"', (await dbGet(h, p, 'checkins/gfind1'))?.via, 'entrance');
    h.check('A6 this phone now remembers that guest (wgb_mine)', await p.evaluate(() => JSON.parse(localStorage.getItem('wgb_mine') || '[]').some(m => m.id === 'gfind1')));
    // "I'm new" goes to the guestbook
    await p.goto(h.url('index.html', { ff: on(ID), phase: 'live' })); await p.waitForTimeout(600);
    await p.evaluate(() => { localStorage.removeItem('wgb_mine'); });
    await p.goto(h.url('index.html', { ff: on(ID), phase: 'live' }) + '#checkin');
    await until(p, () => !!document.querySelector('#s-f-prereg-find.active'));
    await p.click('.f-prereg-new');
    h.check('A6 "✍️ 처음이에요" opens the guestbook form', await until(p, () => !!document.querySelector('#s-info.active')));
  });

  // ---------------------------------------------------------------- A7 kiosk
  await h.step('A7 kiosk: "moved in early?" → find → check in (via kiosk) → hand-off QR → back to the start after 20 s, nothing left', async () => {
    const ctx = await h.context('tablet');
    const s = await h.page(ctx, { tag: 'kseed' });
    await s.goto(h.url('index.html', { ff: off(ID) }));
    await seed(s, [{ id: 'gkiosk1', name: '박키오', side: 'both', createdAt: Date.now() - 2 * DAY }]);
    const mineBefore = await s.evaluate(() => localStorage.getItem('wgb_mine'));
    await s.close();
    const k = await h.page(ctx, { tag: 'kiosk' });
    await k.goto(h.url('kiosk.html', { ff: on(ID), phase: 'live' }));
    h.check('A7 the kiosk row is in the welcome slot', await until(k, () => !document.querySelector('#slot-welcome .f-prereg-kiosk').hidden));
    h.eq('A7 …"🎟 사전 입주하셨나요? 이름으로 체크인"', await text(k, '.f-prereg-kiosk'), '🎟 사전 입주하셨나요? 이름으로 체크인');
    await h.shot(k, 'prereg-7-kiosk');
    await k.click('.f-prereg-kiosk');
    await k.fill('.f-prereg-input', '박키');
    await until(k, () => !!document.querySelector('.f-prereg-hit[data-gid="gkiosk1"]'));
    const r = await h.layoutReport(k);
    h.check('A12 tablet kiosk find screen: no overlaps · tap targets', r.overlaps.length === 0 && !r.hscroll && r.small.length === 0, JSON.stringify(r).slice(0, 300));
    await k.click('.f-prereg-hit[data-gid="gkiosk1"]');
    await k.click('.f-prereg-yes');
    h.check('A7 done with the hand-off QR (#me=gkiosk1)', await until(k, () => (document.querySelector('#s-f-prereg-in.active .f-prereg-qr')?.dataset.url || '').includes('#me=gkiosk1')));
    h.check('A7 …and a countdown', await until(k, () => /초 후 처음 화면으로/.test(document.querySelector('.f-prereg-count')?.textContent || '')));
    await k.waitForTimeout(300); await h.shot(k, 'prereg-8-kiosk-done');
    h.eq('A7 checkins/gkiosk1 via "kiosk"', (await dbGet(h, k, 'checkins/gkiosk1'))?.via, 'kiosk');
    h.eq('A7 the kiosk remembers nobody (wgb_mine unchanged)', await k.evaluate(() => localStorage.getItem('wgb_mine')), mineBefore);
    h.check('A7 after 20 s → the welcome screen', await until(k, () => !!document.querySelector('#s-welcome.active'), null, 26000));
    h.eq('A7 …search box and list are empty, no QR left', await k.evaluate(() => [document.querySelector('.f-prereg-input').value, document.querySelectorAll('.f-prereg-hit').length, document.querySelectorAll('.f-prereg-handoff canvas').length]), ['', 0, 0]);
  });

  // ---------------------------------------------------------------- A8 · A9 · A10 · A11 the TV village and the admin tab
  await h.step('A8–A11 TV: only checked-in + walk-ins (gate: never the others, not even at boot) · check-ins walk in with a banner · admin manual / undo · phones · hot off', async () => {
    const ctx = await h.context('tv');
    const s = await h.page(ctx, { tag: 'tvseed' });
    await s.goto(h.url('index.html', { ff: off(ID) }));
    const PRE = ['gp1', 'gp2', 'gp3', 'gp4', 'gp5'], WALK = ['gw1', 'gw2'];
    await seed(s, [...PRE.map((id, i) => ({ id, name: `사전${i + 1}`, createdAt: Date.now() - 2 * DAY })), ...WALK.map((id, i) => ({ id, name: `현장${i + 1}` }))]);
    const tv = await h.page(ctx, { tag: 'tv' });
    await tv.addInitScript(RECORD);
    await tv.goto(h.url('village.html', { ff: on(ID), phase: 'live', time: 'day' }));
    h.check('A8 the TV shows the two walk-ins only', await until(tv, () => document.querySelector('#count-n').textContent === '2'));
    h.eq('A8 …exactly them', await ids(tv), [...WALK].sort());
    const seen = await tv.evaluate(() => window.__vg);
    h.check('A8 gate: no village:guests list during boot ever held a pre-registered guest who has not checked in', seen.length >= 1 && seen.every(l => !l.some(id => id.startsWith('gp'))), JSON.stringify(seen).slice(0, 300));
    await tv.mouse.click(300, 1000);
    // one check-in → the banner · then two more → five
    await checkin(h, s, 'gp1');
    h.check('A8 a check-in walks in with "🎟 사전1님이 체크인했어요!"', !!(await h.waitBanner(tv, /🎟 사전1님이 체크인했어요!/, 12000)));
    h.check('A8 …and the count is 3', await until(tv, () => document.querySelector('#count-n').textContent === '3'));
    await checkin(h, s, 'gp2'); await checkin(h, s, 'gp3', 'kiosk');
    h.check('A8 three check-ins → 5 villagers', await until(tv, () => document.querySelector('#count-n').textContent === '5'));
    await tv.waitForTimeout(600); await h.shot(tv, 'prereg-9-tv');
    // A10 admin: stats, manual check-in, undo
    const a = await adminPage(h, ctx, { params: { ff: on(ID) } });
    await a.click('#atabs [data-tab="f-prereg"]');
    h.check('A10 stats: 사전 입주 7 · 체크인 3 (all demo guests are before the wedding by the clock)', await until(a, () => /체크인 3명/.test(document.querySelector('.f-prereg-stats')?.textContent || '')), await text(a, '.f-prereg-stats'));
    await a.click('.f-prereg-manual[data-gid="gp4"]');
    h.check('A10 manual check-in → the row turns ✅ · via 관리자', await until(a, () => /✅ .* · 관리자/.test(document.querySelector('.f-prereg-arow[data-gid="gp4"] .f-prereg-state')?.textContent || '')));
    await tv.bringToFront();
    h.check('A10 …and gp4 walks into the TV village', await until(tv, () => document.querySelector('#count-n').textContent === '6'));
    await a.bringToFront();
    await a.click('.f-prereg-undo[data-gid="gp4"]');
    h.eq('A10 undo asks first ("정말 취소할까요?")', await text(a, '.f-prereg-undo[data-gid="gp4"]'), '정말 취소할까요?');
    await a.click('.f-prereg-undo[data-gid="gp4"]');
    h.check('A10 second press → the check-in is gone', await until(a, () => document.querySelector('.f-prereg-arow[data-gid="gp4"] .f-prereg-manual') !== null));
    await tv.bringToFront();
    h.check('A10 …and gp4 leaves the TV village', await until(tv, () => document.querySelector('#count-n').textContent === '5'));
    await a.bringToFront(); await a.waitForTimeout(200); await h.shot(a, 'prereg-10-admin');
    // the invitation QR (Patrick: QR + link in the invitation) and the entrance poster QR
    h.check('admin: the invitation link is the site address', (await text(a, '.f-prereg-url')).startsWith('http'));
    const qr = await h.download(a, () => a.click('.f-prereg-dl[data-file="invite-qr.png"]'), 'prereg-invite-qr.png');
    h.check('admin: ⬇ invitation QR is a PNG', !!qr && isPng(fs.readFileSync(qr)));
    const poster = await h.download(a, () => a.click('.f-prereg-dl[data-file="entrance-checkin-qr.png"]'), 'prereg-entrance-qr.png');
    h.check('admin: ⬇ entrance QR is a PNG and points at #checkin', !!poster && isPng(fs.readFileSync(poster)) && (await a.getAttribute('.f-prereg-qrbox:nth-of-type(2) canvas, .f-prereg-qrbox canvas[data-url$="#checkin"]', 'data-url')).endsWith('#checkin'));
    // backup part
    const zipPath = await h.download(a, () => a.click('#btn-zip'), 'prereg-backup.zip');
    const json = zipPath ? zipRead(fs.readFileSync(zipPath), 'f-prereg/checkins.json') : null;
    h.check('admin: the backup ZIP has f-prereg/checkins.json with the check-ins', !!json && JSON.parse(json.toString()).filter(c => PRE.includes(c.gid)).length === 3, json ? json.toString().slice(0, 200) : 'none');
    // A11 hot off on the TV → everybody (7), no trace · on again → the filter is back
    await setFlag(h, a, ID, false);
    const tv2 = await h.page(ctx, { tag: 'tv-hot' });
    await tv2.goto(h.url('village.html', { phase: 'live', time: 'day' }));
    const admin2 = await adminPage(h, ctx);
    await setFlag(h, admin2, ID, true); await tv2.bringToFront();
    h.check('A11 flag on (no ?ff=) → the filter: 5', await until(tv2, () => document.querySelector('#count-n').textContent === '5', null, 12000));
    await setFlag(h, admin2, ID, false); await tv2.bringToFront();
    h.check('A11 hot off → everybody (7) without a reload', await until(tv2, () => document.querySelector('#count-n').textContent === '7', null, 12000));
    await tv2.waitForTimeout(300);
    await expectClean(h, tv2, ID, 'A11 TV off');
    h.eq('A11 off: nothing registered', (await featureState(tv2, ID))?.live, { listeners: 0, timers: 0, raf: 0, watchers: 0, bus: 0 });
    await setFlag(h, admin2, ID, null);
  });

  await h.step('A9 phones: the same filter by default · "phones show checked-in guests only" off → everybody', async () => {
    const ctx = await h.context('phone');
    const s = await h.page(ctx, { tag: 'pseed' });
    await s.goto(h.url('index.html', { ff: off(ID) }));
    await seed(s, [{ id: 'gq1', name: '폰사전1', createdAt: Date.now() - 2 * DAY }, { id: 'gq2', name: '폰사전2', createdAt: Date.now() - 2 * DAY }, { id: 'gq3', name: '폰현장' }]);
    await checkin(h, s, 'gq1');
    const v = await h.page(ctx, { tag: 'phone-village' });
    await v.goto(h.url('village.html', { ff: on(ID), phase: 'live', time: 'day' }));
    h.check('A9 phone village (default): checked-in + walk-in = 2', await until(v, () => document.querySelector('#count-n').textContent === '2'));
    const a = await adminPage(h, ctx, { params: { ff: on(ID) } });
    await setCfg(h, a, ID, { phonePresence: false });
    await v.bringToFront();
    h.check('A9 phonePresence false → the phone shows everybody (3) without a reload', await until(v, () => document.querySelector('#count-n').textContent === '3', null, 10000));
    const tv = await h.page(await h.context('tv'), { tag: 'tv-still' });
    await tv.goto(h.url('index.html', { ff: off(ID) }));
    await tv.evaluate(([list]) => localStorage.setItem('wgb_demo_guests', list), [await s.evaluate(() => localStorage.getItem('wgb_demo_guests'))]);
    await tv.goto(h.url('village.html', { ff: on(ID), phase: 'live', time: 'day' }));
    h.check('A9 …the TV keeps its filter (its own device: nobody checked in there yet → only the walk-in)', await until(tv, () => document.querySelector('#count-n').textContent === '1'));
  });

  // ---------------------------------------------------------------- S4 phases · pages
  await h.step('S4 pre / live only: after and anniversary load nothing; admin loads in every phase · pre village does nothing', async () => {
    for (const phase of ['after', 'anniversary']) {
      const p = await h.page('phone', { tag: 'ph-' + phase });
      await p.goto(h.url('index.html', { ff: on(ID), phase })); await p.waitForTimeout(800);
      h.check(`S4 ${phase}: not loaded, original start text`, !(await featureState(p, ID))?.on && (await text(p, '#btn-start')) === '방명록 남기기');
    }
    const tv = await h.page('tv', { tag: 'pre-tv' });
    await tv.goto(h.url('village.html', { ff: on(ID), phase: 'pre', seed: 6 })); await tv.waitForTimeout(1500);
    h.check('S9 pre TV: on but no filter (6 villagers) and no DOM', (await featureState(tv, ID))?.on && (await text(tv, '#count-n')) === '6' && (await footprint(tv, ID)).nodes === 0);
    const a = await adminPage(h, 'desktop', { params: { ff: on(ID), phase: 'after' } });
    h.check('S4 admin (after): loaded — the tab is there', await until(a, () => !!document.querySelector('#atabs [data-tab="f-prereg"]')));
  });

  // ---------------------------------------------------------------- S5 simple mode · S6 English · A12 layout
  await h.step('S5 simple mode keeps the ticket · S6 English · A12 phone SE layouts', async () => {
    const ctx = await h.context('phoneSE');
    const p = await h.page(ctx, { tag: 'se' });
    await p.goto(h.url('index.html', { ff: on(ID), phase: 'pre' }));
    await signGuest(h, p, { name: '어르신', msg: '축하합니다', simple: true, open: false, params: { ff: on(ID), phase: 'pre' } });
    h.check('S5 simple mode: the ticket card is on the done screen (simple: true)', await until(p, () => !!document.querySelector('#s-done .f-prereg-ticket')));
    let r = await h.layoutReport(p);
    h.check('A12 phone SE done (pre): no overlaps · no sideways scroll · tap targets', r.overlaps.length === 0 && !r.hscroll && r.small.length === 0, JSON.stringify(r).slice(0, 300));
    const gid = await p.evaluate(() => JSON.parse(localStorage.getItem('wgb_mine')).pop().id);
    await age(p, [gid]);
    await p.goto(h.url('index.html', { ff: on(ID), phase: 'live' }));
    await until(p, () => !document.querySelector('#slot-welcome .f-prereg-card').hidden);
    r = await h.layoutReport(p);
    h.check('A12 phone SE welcome with the check-in card: no overlaps · tap targets', r.overlaps.length === 0 && !r.hscroll && r.small.length === 0, JSON.stringify(r).slice(0, 300));
    await h.shot(p, 'prereg-11-se-card');
    await p.goto(h.url('index.html', { ff: on(ID), phase: 'live' }) + '#checkin');
    await until(p, () => !!document.querySelector('#s-f-prereg-confirm.active'));
    await p.click('.f-prereg-notme');
    await until(p, () => !!document.querySelector('#s-f-prereg-find.active'));
    await p.fill('.f-prereg-input', '어르');
    await until(p, () => document.querySelectorAll('.f-prereg-hit').length > 0);
    r = await h.layoutReport(p);
    h.check('A12 phone SE find screen: no overlaps · tap targets', r.overlaps.length === 0 && !r.hscroll && r.small.length === 0, JSON.stringify(r).slice(0, 300));
    await p.click('.f-prereg-hit'); await p.click('.f-prereg-yes');
    await until(p, () => !!document.querySelector('#s-f-prereg-in.active'));
    r = await h.layoutReport(p);
    h.check('A12 phone SE done (live): no overlaps · tap targets', r.overlaps.length === 0 && !r.hscroll && r.small.length === 0, JSON.stringify(r).slice(0, 300));
    // English
    const e = await h.page('phone', { tag: 'en' });
    await e.goto(h.url('index.html', { ff: on(ID), phase: 'pre' }));
    await e.click('.lang [data-lang=en]'); await e.waitForTimeout(200);
    h.eq('S6 English start button', await text(e, '#btn-start'), '🏡 Move in early');
    await signGuest(h, e, { name: 'Noah', msg: 'Congrats!', open: false, params: { ff: on(ID), phase: 'pre' } });
    await until(e, () => !!document.querySelector('#s-done .f-prereg-ticket'));
    const own = await e.evaluate(() => [...document.querySelectorAll('#s-done [data-f="prereg"]')].map(n => n.textContent).join(' | ') + ' | ' + document.querySelector('#s-done h2').textContent);
    h.check('S6 English: the done screen and the card have no Hangul', !HANGUL.test(own), own.slice(0, 300));
    await e.click('#s-done .f-prereg-mini');
    await until(e, () => !!document.querySelector('#s-f-prereg-ticket.active canvas'));
    const tt = await e.evaluate(() => document.querySelector('#s-f-prereg-ticket').innerText);
    h.check('S6 English: the ticket screen text has no Hangul', !HANGUL.test(tt), tt.slice(0, 200));
    await e.waitForTimeout(300); await h.shot(e, 'prereg-12-en-ticket');
  });

  // ---------------------------------------------------------------- S3 hot toggle on the guest page
  await h.step('S3 hot toggle: manifest default → admin on → the pre texts appear without a reload · off → original, no trace', async () => {
    const ctx = await h.context('phone');
    const p = await h.page(ctx, { tag: 'hot' });
    await p.goto(h.url('index.html', { phase: 'pre' })); await p.waitForTimeout(700);
    await expectDefault(h, p, ID, 'S3 default (no ?ff, no admin flag)');
    const dflt = (await featureState(p, ID))?.on === true;
    if (dflt) h.check('S3 default on: "🏡 마을에 미리 입주하기"', await until(p, () => document.querySelector('#btn-start').textContent === '🏡 마을에 미리 입주하기'));
    else h.eq('S3 default off: the core start text', await text(p, '#btn-start'), '방명록 남기기');
    const a = await adminPage(h, ctx);
    await setFlag(h, a, ID, true); await p.bringToFront();
    h.check('S3 on: "🏡 마을에 미리 입주하기" without a reload', await until(p, () => document.querySelector('#btn-start').textContent === '🏡 마을에 미리 입주하기'));
    await setFlag(h, a, ID, false); await p.bringToFront();
    h.check('S3 off: original text back', await until(p, () => document.querySelector('#btn-start').textContent === '방명록 남기기'));
    await p.waitForTimeout(300);
    await expectClean(h, p, ID, 'S3 off');
    h.eq('S3 off: nothing registered', (await featureState(p, ID))?.live, { listeners: 0, timers: 0, raf: 0, watchers: 0, bus: 0 });
    await setFlag(h, a, ID, true); await p.bringToFront();
    h.check('S3 on again (setup twice is safe)', await until(p, () => document.querySelector('#btn-start').textContent === '🏡 마을에 미리 입주하기'));
    await setFlag(h, a, ID, null);
  });
};

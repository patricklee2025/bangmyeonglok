// The wedding-day happy path, end to end, in one demo "world" (one browser context = shared demo storage):
// TV village ← phone guest signs with a photo → remote emotes reach the TV → admin edits / fires an event / bulk-deletes
// → TV follows. Plus the kiosk variant.
import { villageCount, tapDemoChannel, ACTIVITY_ORDER } from '../lib/flows.mjs';

export const meta = { title: 'guest signs with photo → TV, remote, admin edit/event/bulk delete, kiosk', timeout: 240000, tags: ['slow'] };

const active = (p, id) => p.$eval(id, e => e.classList.contains('active')).catch(() => false);
const until = async (fn, ms = 5000) => { const end = Date.now() + ms; let v; while (Date.now() < end) { v = await fn(); if (v) return v; await new Promise(r => setTimeout(r, 150)); } return v; };

export default async (h) => {
  const world = await h.context('tv');
  const tv = await h.page(world, { tag: 'tv' });
  await tv.goto(h.url('village.html', { time: 'day', seed: 12 }));
  await tv.waitForTimeout(2000);
  h.eq('TV seeded with 12 villagers', await villageCount(tv), 12);
  await tapDemoChannel(tv);

  const g = await h.page(world, { tag: 'guest' });
  await g.setViewportSize({ width: 390, height: 844 });
  let gid = null;

  await h.step('sign the guestbook with a photo (all 4 steps)', async () => {
    await g.goto(h.url('index.html'));
    h.check('welcome screen first', await active(g, '#s-welcome'));
    await h.shot(g, '1-welcome');
    await g.click('#btn-start');
    h.check('step 1: info', await active(g, '#s-info'));
    await g.fill('#in-name', '패트릭'); await g.click('#side-seg [data-v=groom]');
    await g.fill('#in-msg', '결혼 축하해! 픽셀 마을에서 만나요. Congrats!!');
    await g.click('#info-next'); await g.waitForTimeout(600);
    h.check('step 2: photo', await active(g, '#s-photo'));
    await g.setInputFiles('#file', h.fixture('face1.jpg'));
    await g.waitForSelector('#btn-use:not([hidden])', { timeout: 120000 });
    await g.waitForTimeout(1200); await h.shot(g, '2-analyzed');
    await g.click('#btn-use'); await g.waitForTimeout(400);
    h.check('step 3: customize', await active(g, '#s-custom'));
    await g.click('#tabs button:nth-child(2)'); await g.waitForTimeout(200); await h.shot(g, '3-custom-hair');
    await g.click('#btn-to-act');
    h.check('step 4: activity', await active(g, '#s-act'));
    await g.click(`#acts .act-card:nth-child(${ACTIVITY_ORDER.indexOf('fish') + 1})`);
    h.eq('activity card toggles aria-pressed', await g.getAttribute(`#acts .act-card:nth-child(${ACTIVITY_ORDER.indexOf('fish') + 1})`, 'aria-pressed'), 'true');
    await g.click('#btn-submit');
    await g.waitForSelector('#s-done.active', { timeout: 20000 });
    await g.waitForTimeout(400); await h.shot(g, '4-done');
    gid = await h.flows.myLastGuestId(g);
    h.check('done screen + this phone remembers the guest (wgb_mine)', !!gid, gid);
    const rec = await g.evaluate(id => JSON.parse(localStorage.getItem('wgb_demo_guests') || '[]').find(x => x.id === id), gid);
    h.eq('stored record (name, side, activity)', rec && [rec.name, rec.side, rec.activity], ['패트릭', 'groom', 'fish']);
    h.check('stored avatar came from the photo analysis', rec?.avatar && typeof rec.avatar === 'object' && 'skin' in rec.avatar, JSON.stringify(rec?.avatar));
  });

  await h.step('TV picks the new guest up', async () => {
    h.eq('TV villager count 12 → 13', await until(async () => (await villageCount(tv)) === 13 && 13), 13);
    await h.shot(tv, '5-tv');
  });

  await h.step('done-screen remote reaches the TV', async () => {
    await g.click('#remote-done .remote-btn:nth-child(3)');            // dance
    const dance = await until(() => tv.evaluate(id => (window.__bc.emote || []).some(e => e.gid === id && e.type === 'dance'), gid));
    h.check('dance emote arrives on the TV channel', dance);
    await g.click('#remote-done .remote-btn:nth-child(1)');            // during the 3 s cooldown → ignored
    await g.waitForTimeout(400);
    h.eq('cooldown swallows a second tap', await tv.evaluate(() => (window.__bc.emote || []).length), 1);
    await g.waitForTimeout(3000);
    await g.click('#remote-done .remote-btn.wide');                     // greet
    h.check('greet emote arrives after the cooldown', await until(() => tv.evaluate(id => (window.__bc.emote || []).some(e => e.gid === id && e.type === 'greet'), gid)));
    const pulse = await until(() => g.evaluate(id => JSON.parse(localStorage.getItem('wgb_demo_pulse') || '{}')[id] === 2 && 2, gid));
    h.eq('pulse counter counts 2 emotes', pulse, 2);
  });

  const a = await h.page(world, { tag: 'admin' });
  await a.setViewportSize({ width: 1280, height: 900 });
  await h.step('admin sees, edits, fires an event, bulk-deletes', async () => {
    await a.goto(h.url('admin.html')); await a.waitForTimeout(1200);
    h.eq('admin shows 13 guest cards', await a.$$eval('#grid .gcard', c => c.length), 13);
    await a.click('#grid .gcard .acts button:nth-child(1)'); await a.waitForTimeout(300);
    h.check('edit dialog opens', await a.$eval('#edit', d => d.open));
    await a.fill('#e-name', '패트릭(수정)'); await a.selectOption('#e-act', 'dance');
    await h.shot(a, '6-admin-edit');
    await a.click('#e-save'); await a.waitForTimeout(600);
    h.check('edited name shows on the card', await a.$$eval('#grid .gcard .nm', ns => ns.some(n => n.textContent === '패트릭(수정)')));
    const recs = await a.evaluate(() => JSON.parse(localStorage.getItem('wgb_demo_guests')));
    h.check('edit persisted (name + activity)', recs.some(r => r.name === '패트릭(수정)' && r.activity === 'dance'));

    await a.click('[data-ev=fireworks]'); await a.waitForTimeout(300);
    h.check('event button reports status', ((await a.textContent('#ev-status')) || '').trim().length > 0, await a.textContent('#ev-status'));
    h.check('event reaches the TV channel', await until(() => tv.evaluate(() => (window.__bc.event || []).some(e => e.type === 'fireworks'))));

    const boxes = await a.$$('#grid .gcard .pick'); for (const b of boxes.slice(0, 3)) await b.check();
    await a.click('#btn-del-sel'); await a.waitForTimeout(200);
    h.eq('bulk delete still armed (nothing gone yet)', await a.$$eval('#grid .gcard', c => c.length), 13);
    await a.click('#btn-del-sel'); await a.waitForTimeout(800);
    h.eq('second tap deletes 3', await a.$$eval('#grid .gcard', c => c.length), 10);
    h.eq('TV follows: 10 villagers', await until(async () => (await villageCount(tv)) === 10 && 10, 6000), 10);
    await h.shot(a, '7-admin');
  });

  await h.step('kiosk: same flow, no remote, forgets the guest', async () => {
    const k = await h.page('tablet', { tag: 'kiosk' });
    const { gid: kg } = await h.flows.signGuest(h, k, { kiosk: true, name: 'Kiosk', msg: 'Congrats from kiosk' });
    h.check('kiosk hides the remote', await k.$eval('#remote-done', e => getComputedStyle(e).display === 'none'));
    h.check('kiosk does not remember guests on the shared tablet', kg === null, kg);
    h.check('kiosk shows the hand-off QR', await k.isVisible('#handoff'));
    await h.shot(k, '8-kiosk-done');
  });
};

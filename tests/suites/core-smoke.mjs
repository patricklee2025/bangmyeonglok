// 15-second smoke test of the whole loop — part of `npm run test:quick`. Every page boots, a guest signs,
// the TV, the guest's phone village and the admin page all see the guest.
import { villageCount } from '../lib/flows.mjs';

export const meta = { title: 'every page boots; one guest reaches TV, phone village and admin', timeout: 90000 };

export default async (h) => {
  const world = await h.context('laptop');
  const tv = await h.page(world, { tag: 'tv' });
  await tv.goto(h.url('village.html', { seed: 3, time: 'day' }));
  await tv.waitForTimeout(1200);
  h.eq('TV boots with 3 villagers', await villageCount(tv), 3);

  const g = await h.page(world, { tag: 'guest' });
  await g.setViewportSize({ width: 390, height: 844 });
  const { gid } = await h.flows.signGuest(h, g, { name: '스모크', msg: '연기 테스트' });
  h.check('guest signed', !!gid, gid);

  const seen = async () => { for (let i = 0; i < 30; i++) { if ((await villageCount(tv)) === 4) return true; await tv.waitForTimeout(150); } return false; };
  h.check('TV shows the new villager', await seen());

  const v = await h.page(world, { tag: 'phone-village' });
  await v.goto(h.url('village.html', { me: gid }));
  await v.waitForTimeout(1500);
  h.check('village opens for this guest (?me=)', await v.evaluate(() => !!document.querySelector('#world')));

  const a = await h.page(world, { tag: 'admin' });
  await a.goto(h.url('admin.html'));
  await a.waitForSelector('#grid .gcard', { timeout: 8000 });
  h.check('admin lists the guest', await a.$$eval('#grid .gcard .nm', ns => ns.some(n => n.textContent === '스모크')));

  const k = await h.page('tablet', { tag: 'kiosk' });
  await k.goto(h.url('kiosk.html'));
  h.check('kiosk boots', await k.isVisible('#btn-start'));
};

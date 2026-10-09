// The village on a guest's phone: phone layout, remote bar, emotes reach the TV, pan / fit / follow-me,
// landscape, and the 📷 sheet uploading straight from the village.
import { tapDemoChannel, EMOTE_ORDER } from '../lib/flows.mjs';

export const meta = { title: 'phone village: layout, remote → TV, pan/fit/landscape, photo sheet', timeout: 180000, tags: ['slow'] };

const until = async (fn, ms = 6000) => { const end = Date.now() + ms; let v; while (Date.now() < end) { v = await fn(); if (v) return v; await new Promise(r => setTimeout(r, 150)); } return v; };
const stageXY = p => p.evaluate(() => (document.querySelector('#stage').style.transform.match(/-?[\d.]+px/g) || []).map(parseFloat));

export default async (h) => {
  const world = await h.context('phone');             // one device: the TV page uses ?host=1 to act as the TV
  const tv = await h.page(world, { tag: 'tv' });
  await tv.goto(h.url('village.html', { seed: 16, host: 1 }));
  await tv.waitForTimeout(1500);
  h.check('?host=1 on a touch device → TV layout with QR', !(await tv.evaluate(() => document.body.classList.contains('touch'))) && await tv.isVisible('.qr'));
  await tapDemoChannel(tv);

  const ph = await h.page(world, { tag: 'phone' });
  const { gid } = await h.flows.signGuest(h, ph, { name: '나야나', msg: '모바일 테스트!!', act: 'dance' });
  const href = await ph.getAttribute('#link-village', 'href');
  h.check('"see me in the village" link carries ?me=<my id>', href.includes('me=' + gid), href);
  await ph.click('#link-village');
  await ph.waitForTimeout(3500);

  await h.step('phone layout', async () => {
    h.check('body.touch', await ph.evaluate(() => document.body.classList.contains('touch')));
    h.eq('remote bar: 5 emotes + 📷', [(await ph.$$('#mremote button.em')).length, (await ph.$$('#mremote button.snap')).length], [5, 1]);
    h.check('no QR on a phone', !(await ph.isVisible('.qr')));
    h.check('follow-me button on', (await ph.getAttribute('#b-me', 'aria-pressed')) === 'true');
    await h.shot(ph, '1-portrait');
  });

  await h.step('emote from the phone reaches the TV', async () => {
    await ph.click(`#mremote button.em:nth-child(${EMOTE_ORDER.indexOf('dance') + 1})`);
    h.check('TV channel got {gid, dance}', await until(() => tv.evaluate(id => (window.__bc.emote || []).some(e => e.gid === id && e.type === 'dance'), gid)));
    h.check('bar shows the 3 s cooldown', await ph.evaluate(() => document.querySelector('#mremote').classList.contains('cool')));
    await ph.waitForTimeout(900); await h.shot(ph, '2-dance');
  });

  await h.step('drag pans and pauses follow-me; fit/fill toggle', async () => {
    const before = await stageXY(ph);
    await ph.mouse.move(300, 420); await ph.mouse.down(); await ph.mouse.move(60, 400, { steps: 8 }); await ph.mouse.up();
    await ph.waitForTimeout(400);
    const after = await stageXY(ph);
    h.check('camera moved', JSON.stringify(before) !== JSON.stringify(after), `${before} → ${after}`);
    h.eq('follow-me paused after a pan', await ph.getAttribute('#b-me', 'aria-pressed'), 'false');
    await ph.click('#b-fit'); await ph.waitForTimeout(500);
    h.eq('fit mode on', await ph.getAttribute('#b-fit', 'aria-pressed'), 'true');
    h.check('fit: whole map inside the screen', await ph.evaluate(() => document.querySelector('#stage').getBoundingClientRect().width <= innerWidth + 1));
    await h.shot(ph, '3-fit');
    await ph.click('#b-fit'); await ph.waitForTimeout(300);
    await ph.click('#b-me'); await ph.waitForTimeout(300);
    h.eq('follow-me back on', await ph.getAttribute('#b-me', 'aria-pressed'), 'true');
  });

  await h.step('landscape', async () => {
    await ph.setViewportSize({ width: 844, height: 390 }); await ph.waitForTimeout(1200);
    const r = await h.layoutReport(ph);
    h.check('landscape: no sideways scroll', !r.hscroll);
    h.check('landscape: remote bar still visible', await ph.isVisible('#mremote'));
    await h.shot(ph, '4-landscape');
    await ph.setViewportSize({ width: 390, height: 844 }); await ph.waitForTimeout(600);
  });

  await h.step('📷 sheet uploads from the village and the TV shows it', async () => {
    await ph.click('#mremote button.snap'); await ph.waitForTimeout(400);
    h.check('sheet opens', await ph.isVisible('#snap-sheet'));
    await ph.setInputFiles('#snap-village .snap-actions label.blue input', [h.fixture('face0.jpg')]);
    await ph.waitForFunction(() => document.querySelectorAll('#snap-village .snap-item[data-s=ok]').length >= 1, null, { timeout: 30000 });
    await h.shot(ph, '5-sheet');
    await ph.click('#sheet-x'); await ph.waitForTimeout(300);
    h.check('sheet closes', !(await ph.isVisible('#snap-sheet')));
    h.check('TV shows the polaroid', await tv.waitForSelector('#polaroid.on', { timeout: 12000 }).then(() => true).catch(() => false));
  });
};

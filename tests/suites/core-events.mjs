// TV keyboard shortcuts and wedding events on a single TV: bouquet, group photo (PNG download), level-up, toggles.
// (Cross-screen determinism and event queueing live in core-regressions.)
import fs from 'node:fs';
import { isPng, pngSize } from '../lib/files.mjs';
import { villageCount } from '../lib/flows.mjs';

export const meta = { title: 'TV shortcuts: bouquet, group photo PNG, level-up, night/UI toggles', timeout: 300000, tags: ['slow'] };

export default async (h) => {
  const tv = await h.page('tv', { tag: 'tv' });
  await tv.goto(h.url('village.html', { seed: 26, time: 'sunset' }));
  await tv.waitForTimeout(2500);
  h.eq('26 villagers, level 3', [await villageCount(tv), await tv.textContent('#lv')], [26, '3']);

  await h.step('B → bouquet toss ends with a winner', async () => {
    const won = h.waitBanner(tv, /부케를 받았어요/, 90000);
    await tv.keyboard.press('b');
    const text = await won;
    h.check('winner banner', !!text, text);
    await tv.waitForTimeout(300); await h.shot(tv, '1-bouquet');
  });

  await h.step('G → group photo downloads a sharp PNG', async () => {
    await tv.waitForTimeout(9500);                                       // let the bouquet scene finish
    const file = await h.download(tv, () => tv.keyboard.press('g'), 'group.png', 90000);
    const buf = file ? fs.readFileSync(file) : Buffer.alloc(0);
    h.check('group photo PNG saved', isPng(buf));
    if (isPng(buf)) { const s = pngSize(buf); h.check('group photo is 4× the world size', s.width >= 1600 && s.height >= 900, `${s.width}x${s.height}`); }
    await h.shot(tv, '2-group');
  });

  await h.step('L (demo) → +5 guests crosses 30 → level 4 celebration', async () => {
    await tv.waitForTimeout(7000);
    const up = h.waitBanner(tv, /레벨 UP! Lv\.4/, 60000);          // queued behind 4 arrival banners (~5.5 s each)
    await tv.keyboard.press('l');
    h.check('level-up banner', !!(await up));
    h.eq('HUD: 31 villagers, Lv 4', [await villageCount(tv), await tv.textContent('#lv')], [31, '4']);
    await tv.keyboard.press('e'); await tv.waitForTimeout(800);
    await h.shot(tv, '3-level4');
  });

  await h.step('toggles: H hides UI, Q hides QR, N night, X fireworks', async () => {
    await tv.keyboard.press('h');
    h.check('H hides the HUD', await tv.evaluate(() => document.querySelector('.hud').classList.contains('hide-ui')));
    await tv.keyboard.press('h'); await tv.keyboard.press('q');
    h.check('Q hides the QR only', await tv.evaluate(() => document.querySelector('.hud').classList.contains('no-qr')));
    await tv.keyboard.press('q');
    await tv.keyboard.press('n'); await tv.waitForTimeout(600); await h.shot(tv, '4-night');
    await tv.keyboard.press('x'); await tv.waitForTimeout(1500); await h.shot(tv, '5-fireworks');
    h.check('night + fireworks render without errors', true);
  });
};

// v3 features: voice message, time capsule, guest snaps → TV polaroid, simple (elder) mode,
// admin voice playback / snaps / capsule lock / report PNG / ZIP backup.
import fs from 'node:fs';
import { zipEntries } from '../lib/files.mjs';

export const meta = { title: 'voice, capsule, snaps → TV polaroid, simple mode, admin playback/report/ZIP', timeout: 300000, tags: ['slow'] };

export default async (h) => {
  const world = await h.context('tv');
  const tv = await h.page(world, { tag: 'tv' });
  await tv.goto(h.url('village.html', { seed: 8, time: 'day' }));
  await tv.waitForTimeout(1500);
  const guest = async () => { const p = await h.page(world, { tag: 'guest' }); await p.setViewportSize({ width: 390, height: 844 }); return p; };

  let gid = null;
  await h.step('voice + capsule + 2 snaps', async () => {
    const g = await guest();
    await g.goto(h.url('index.html')); await g.click('#btn-start');
    await g.fill('#in-name', '보이스'); await g.fill('#in-msg', '음성도 남겨요! 행복하세요');
    await g.click('#v-rec'); await g.waitForTimeout(2200); await g.click('#v-stop'); await g.waitForTimeout(700);
    h.check('voice recorded (saved label + play button)', /녹음 완료/.test(await g.textContent('#v-time')) && !(await g.$eval('#v-play', b => b.hidden)), await g.textContent('#v-time'));
    await g.click('#capsule-box summary'); await g.fill('#in-capsule', '1년 뒤에도 지금처럼 웃고 있기를!');
    await h.shot(g, '1-info');
    await g.click('#info-next'); await g.click('#btn-skip'); await g.click('#btn-to-act'); await g.click('#btn-submit');
    await g.waitForSelector('#s-done.active'); await g.waitForTimeout(400);
    gid = await h.flows.myLastGuestId(g);
    const rec = await g.evaluate(id => JSON.parse(localStorage.getItem('wgb_demo_guests')).find(x => x.id === id), gid);
    h.eq('record flags: hasVoice, hasCapsule, !hasPhoto', rec && [rec.hasVoice, rec.hasCapsule, rec.hasPhoto], [true, true, false]);
    await g.setInputFiles('#snap-done .snap-actions label.blue input', [h.fixture('face0.jpg'), h.fixture('face3.jpg')]);
    await g.waitForFunction(() => document.querySelectorAll('#snap-done .snap-item[data-s=ok]').length === 2, null, { timeout: 30000 });
    await h.shot(g, '2-done-snaps');
    const metas = await g.evaluate(id => JSON.parse(localStorage.getItem('wgb_demo_snaps') || '[]').filter(m => m.gid === id).map(m => m.id).sort(), gid);
    h.eq('2 snaps stored in slots 0 and 1', metas, [gid + '_0', gid + '_1']);
    const on = await tv.waitForSelector('#polaroid.on', { timeout: 12000 }).then(() => true).catch(() => false);
    h.check('TV shows the new snap as a polaroid', on);
    await h.shot(tv, '3-tv-polaroid');
  });

  await h.step('simple mode: voice only + photo → straight in', async () => {
    const s = await guest();
    await s.goto(h.url('index.html')); await s.click('#btn-simple');
    await s.fill('#in-name', '할머니');
    h.check('Next disabled with a name only', await s.$eval('#info-next', b => b.disabled));
    await s.click('#v-rec'); await s.waitForTimeout(1800); await s.click('#v-stop'); await s.waitForTimeout(600);
    h.check('voice alone enables Next', !(await s.$eval('#info-next', b => b.disabled)));
    await h.shot(s, '4-simple-info');
    await s.click('#info-next'); await s.setInputFiles('#file', h.fixture('face2.jpg'));
    await s.waitForSelector('#btn-use:not([hidden])', { timeout: 120000 }); await s.waitForTimeout(800);
    h.eq('simple "use photo" button submits directly', (await s.textContent('#btn-use')).trim(), '이대로 입장하기!');
    await h.shot(s, '5-simple-photo');
    await s.click('#btn-use'); await s.waitForSelector('#s-done.active', { timeout: 15000 });
    h.check('simple mode reaches the done screen', ((await s.textContent('#done-msg')) || '').trim().length > 0, await s.textContent('#done-msg'));
  });

  await h.step('admin: voices, snaps, capsule lock, report, backup', async () => {
    const a = await h.page(world, { tag: 'admin' }); await a.setViewportSize({ width: 1280, height: 900 });
    await a.goto(h.url('admin.html')); await a.waitForTimeout(1200);
    h.eq('2 voice players', (await a.$$('.voicebox button')).length, 2);
    await a.click('.voicebox button'); await a.waitForTimeout(800);
    h.check('tapping a voice loads an <audio>', (await a.$$('.voicebox audio')).length >= 1);
    await a.click('#atabs [data-tab=snaps]'); await a.waitForTimeout(600);
    h.eq('snaps tab shows 2 snaps', (await a.$$('#snapgrid .snapcard')).length, 2);
    await a.click('#atabs [data-tab=capsules]'); await a.waitForTimeout(800);
    h.check('capsules stay locked before the anniversary', (await a.$$('#capsule-panel .letter')).length === 0 && ((await a.textContent('#capsule-panel')) || '').trim().length > 0, (await a.textContent('#capsule-panel')).slice(0, 60));
    await a.click('#atabs [data-tab=report]'); await a.waitForTimeout(1200);
    await h.shot(a, '6-admin-report');
    const png = await h.download(a, () => a.click('#btn-report-png'), 'report.png');
    h.check('report PNG downloads', png && fs.readFileSync(png).subarray(1, 4).toString() === 'PNG');
    await a.click('#atabs [data-tab=guests]');
    const zip = await h.download(a, () => a.click('#btn-zip'), 'backup.zip', 90000);
    const names = zip ? zipEntries(fs.readFileSync(zip)) : [];
    h.check('backup ZIP has csv, json, avatars, voices, snaps, capsule note, report',
      ['guestbook.csv', 'guestbook.json', 'time-capsule-README.txt', 'report.png'].every(n => names.includes(n))
      && ['avatars/', 'voices/', 'snaps/'].every(d => names.some(n => n.startsWith(d))) && !names.includes('MISSING.txt'), names.join(', '));
    h.eq('backup has one voice file per voice guest', names.filter(n => n.startsWith('voices/') && !n.endsWith('/')).length, 2);
  });

  await h.step('capsules readable once unlocked', async () => {
    const a2 = await h.page(world, { tag: 'admin-unlocked' }); await a2.setViewportSize({ width: 1280, height: 900 });
    await a2.goto(h.url('admin.html', { unlock: 1 })); await a2.waitForTimeout(800);
    await a2.click('#atabs [data-tab=capsules]'); await a2.waitForTimeout(800);
    h.eq('1 capsule letter visible', (await a2.$$('#capsule-panel .letter')).length, 1);
  });
};

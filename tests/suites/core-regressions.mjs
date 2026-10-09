// Regression checks for every bug found in the v3.2 QA pass (+ later fixes). Each check names the bug it guards.
// Add one here whenever a bug is fixed in core code.
import fs from 'node:fs';
import { villageCount, sendEvent, addGuests } from '../lib/flows.mjs';
import { parseCsv } from '../lib/files.mjs';

export const meta = { title: 'v3.2 QA regressions: kiosk privacy, camera/mic, bad files, snaps, events, admin, phones, report', timeout: 420000, tags: ['slow'] };

const until = async (fn, ms = 5000) => { const end = Date.now() + ms; let v; while (Date.now() < end) { v = await fn(); if (v) return v; await new Promise(r => setTimeout(r, 120)); } return v; };
const breakGuestWrites = () => { const o = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (k === 'wgb_demo_guests') throw new Error('quota'); return o.call(this, k, v); }; };

export default async (h) => {
  h.allowErrors(/snap upload|cannot decode|snap limit|quota|decode/i);
  const bad = h.file('bad.jpg'); fs.writeFileSync(bad, 'this is not an image');

  await h.step('kiosk privacy + camera lifecycle', async () => {
    const k = await h.page('tablet', { tag: 'kiosk', spyMedia: true });
    await k.goto(h.url('kiosk.html')); await k.click('#btn-start');
    await k.fill('#in-name', '앞사람'); await k.fill('#in-msg', '비밀 메시지'); await k.click('#capsule-box summary'); await k.fill('#in-capsule', '비밀 캡슐');
    await k.click('#info-back'); await k.click('#btn-start');
    const v = await k.evaluate(() => ['#in-name', '#in-msg', '#in-capsule'].map(s => document.querySelector(s).value).join('|'));
    h.eq('kiosk: backing out wipes the previous guest', v, '||');
    await k.fill('#in-name', 'x'); await k.fill('#in-msg', 'hi'); await k.click('#info-next'); await k.waitForTimeout(1200);
    await k.click('.lang [data-lang=en]'); await k.waitForTimeout(800); await k.click('.lang [data-lang=ko]'); await k.waitForTimeout(800);
    const cam = await k.evaluate(() => ({ calls: window.__gum.video, live: window.__live('video') }));
    h.eq('language switch on the photo screen: 1 camera request, 1 live track', cam, { calls: 1, live: 1 });
    await k.click('#photo-back'); await k.waitForTimeout(300);
    h.eq('leaving the photo screen stops the camera', await k.evaluate(() => window.__live('video')), 0);
  });

  await h.step('microphone', async () => {
    const g = await h.page('phone', { tag: 'mic', spyMedia: true });
    await g.goto(h.url('index.html')); await g.click('#btn-start'); await g.fill('#in-name', 'mic');
    await g.evaluate(() => { const b = document.querySelector('#v-rec'); b.click(); b.click(); b.click(); });
    await g.waitForTimeout(1500);
    h.eq('triple-tap record → one mic request', await g.evaluate(() => window.__gum.audio), 1);
    await g.click('#v-stop'); await g.waitForTimeout(700);
    const saved = await g.textContent('#v-time');
    h.check('recording saved', /1\.\d|2\.\d/.test(saved), saved);
    await g.click('#v-rec'); await g.waitForTimeout(250); await g.click('#v-stop'); await g.waitForTimeout(600);
    const after = await g.evaluate(() => ({ t: document.querySelector('#v-time').textContent, play: !document.querySelector('#v-play').hidden }));
    h.check('too-short re-record keeps the previous clip', after.play && /녹음 완료/.test(after.t), JSON.stringify(after));
    await g.fill('#in-msg', '메시지'); await g.click('#v-rec'); await g.waitForTimeout(1200);
    await g.click('#info-next'); await g.waitForTimeout(800);
    h.eq('Next while recording → mic released', await g.evaluate(() => window.__live('audio')), 0);
    await g.click('#photo-back'); await g.fill('#in-msg', '♥');
    h.check('1-character message accepted', !(await g.$eval('#info-next', b => b.disabled)));
    await g.fill('#in-name', ''); await g.waitForTimeout(100);
    h.check('hint explains why Next is disabled', ((await g.textContent('#info-hint')) || '').length > 0, await g.textContent('#info-hint'));
  });

  await h.step('bad photo file + simple-mode failure are visible', async () => {
    const g = await h.page('phone', { tag: 'badfile' });
    await g.goto(h.url('index.html')); await g.click('#btn-start'); await g.fill('#in-name', 'bad'); await g.fill('#in-msg', 'x');
    await g.click('#info-next'); await g.setInputFiles('#file', bad); await g.waitForTimeout(600);
    h.check('undecodable photo shows a message', await g.isVisible('#toast'), await g.textContent('#toast'));
    await g.addInitScript(breakGuestWrites);
    await g.goto(h.url('index.html'));
    await g.click('#btn-simple'); await g.fill('#in-name', '할머니'); await g.fill('#in-msg', '축하'); await g.click('#info-next');
    await g.click('#btn-skip'); await g.waitForTimeout(800);
    h.check('simple-mode submit failure is visible', await g.isVisible('#toast') && (await g.textContent('#toast')).includes('실패'), await g.textContent('#toast'));
    h.eq('simple-mode skip button wording', await g.textContent('#btn-skip'), '사진 없이 바로 입장');
    h.check('simple-mode step label is 2 steps', (await g.textContent('#step-label')).startsWith('2 / 2'), await g.textContent('#step-label'));
  });

  await h.step('snaps: bad files, per-guest slot limit', async () => {
    const g = await h.page('phone', { tag: 'snap' });
    const { gid } = await h.flows.signGuest(h, g, { name: '스냅왕', msg: '찰칵' });
    const inp = '#snap-done .snap-actions label.blue input';
    await g.setInputFiles(inp, [h.fixture('face0.jpg'), bad]);
    await g.waitForFunction(() => document.querySelectorAll('#snap-done .snap-item[data-s=ok], #snap-done .snap-item[data-s=bad]').length >= 2, null, { timeout: 30000 });
    const st = await g.evaluate(() => [...document.querySelectorAll('#snap-done .snap-item')].map(n => n.dataset.s).join(','));
    h.check('bad snap marked "can\'t open" (no retry loop)', st.includes('bad') && st.includes('ok'), st);
    const r = await h.store(g, async (s, gid) => {
      const out = [];
      for (let i = 0; i < 6; i++) { try { out.push((await s.addSnap(gid, 'n', 'data:image/jpeg;base64,AAAA', '', 0)).slot); } catch (e) { out.push(e.code); } }
      return out;
    }, gid);
    h.eq('a 2nd device can\'t exceed 5 snaps per guest', r.filter(x => x === 'snap-limit').length, 2);
  });

  await h.step('TV events: same bouquet winner everywhere, real group photo, queueing, cascade delete', async () => {
    const w = await h.context('laptop');
    const tv = await h.page(w, { tag: 'tv' }); await tv.goto(h.url('village.html', { seed: 12, time: 'day' })); await tv.waitForTimeout(1500);
    const tv2 = await h.page(w, { tag: 'tv2' }); await tv2.goto(h.url('village.html', { time: 'day' })); await tv2.waitForTimeout(1500);
    // events are sent the way admin.html does (store.sendEvent → BroadcastChannel), from the TV page itself
    const w1 = h.waitBanner(tv, /받았어요/, 90000), w2 = h.waitBanner(tv2, /받았어요/, 90000);   // scenes advance per frame: slow on a busy CPU
    await sendEvent(h, tv, 'bouquet');
    const [b1, b2] = await Promise.all([w1, w2]);
    h.check('bouquet winner identical on two screens', b1 && b1 === b2, `${b1} / ${b2}`);
    await tv.waitForTimeout(4000);
    const png = await h.download(tv, () => sendEvent(h, tv, 'group'), 'group.png', 90000);
    const bright = png ? await tv.evaluate(async b64 => {
      const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
      const c = document.createElement('canvas'); c.width = 96; c.height = 54; const g = c.getContext('2d'); g.drawImage(img, 0, 0, 96, 54);
      const d = g.getImageData(0, 0, 96, 54).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += (d[i] + d[i + 1] + d[i + 2]) / 3; return s / (d.length / 4);
    }, fs.readFileSync(png).toString('base64')) : 999;
    h.check('group photo PNG is not washed out by the flash', bright < 200, 'avg brightness ' + Math.round(bright));
    await tv.waitForTimeout(9000);
    const queued = h.waitBanner(tv, /단체사진 찍어요/, 90000);
    await sendEvent(h, tv, 'bouquet'); await tv.waitForTimeout(400); await sendEvent(h, tv, 'group');
    h.check('a 2nd event during a running one is queued, not dropped', !!(await queued));
    const left = await h.store(tv, async s => {
      const gs = JSON.parse(localStorage.getItem('wgb_demo_guests')); const gid = gs[0].id;
      await s.addSnap(gid, gs[0].name, 'data:image/jpeg;base64,AAAA', 'x', 0); await s.deleteMany([gid]);
      return JSON.parse(localStorage.getItem('wgb_demo_snaps')).filter(m => m.gid === gid).length;
    });
    h.eq('deleting a guest deletes their snaps', left, 0);
  });

  await h.step('admin: Esc never saves, CSV formula guard, tampered data, armed delete', async () => {
    const a = await h.page('desktop', { tag: 'admin' });
    await a.goto(h.url('admin.html'));
    await h.store(a, async s => {
      const r = await s.addGuest({ name: '=1+1', side: 'both', message: '-친구 일동-', avatar: {}, activity: 'walk' }, null);
      await s.addSnap(r.id, '=1+1', 'javascript:alert(1)', 'evil', 0);
    });
    await a.waitForTimeout(800);
    await a.click('.gcard >> text=✏️ 수정'); await a.fill('#e-name', 'A저장'); await a.click('#e-save'); await a.waitForTimeout(500);
    await a.click('.gcard >> text=✏️ 수정'); await a.fill('#e-name', 'ESC로닫음'); await a.keyboard.press('Escape'); await a.waitForTimeout(500);
    const names = await a.evaluate(() => JSON.parse(localStorage.getItem('wgb_demo_guests')).map(g => g.name));
    h.check('Esc on the edit dialog does not save', !names.includes('ESC로닫음') && names.includes('A저장'), JSON.stringify(names));
    const csvPath = await h.download(a, () => a.click('#btn-csv'), 'guests.csv');
    const rows = csvPath ? parseCsv(fs.readFileSync(csvPath, 'utf8')) : [];
    h.check('CSV neutralises formulas (=, -, +, @)', rows.flat().includes("'-친구 일동-") && !rows.flat().some(c => /^[=+\-@]/.test(c)), JSON.stringify(rows[1] || []).slice(0, 100));
    await a.click('#atabs [data-tab=snaps]'); await a.waitForTimeout(600);
    const src = await a.evaluate(() => [...document.querySelectorAll('#snapgrid img')].map(i => i.getAttribute('src')));
    h.check('tampered snap data never becomes an <img src>', src.every(s => !s || s.startsWith('data:image/')), JSON.stringify(src).slice(0, 120));
    await a.click('#atabs [data-tab=guests]'); await a.waitForTimeout(300);
    await a.locator('.gcard >> text=삭제').first().click();
    await h.flows.addGuests(h, a, 1, '새하객');
    await a.waitForTimeout(700);
    h.eq('an armed delete button survives a live update', await a.locator('[data-armed]').count(), 1);
    await a.waitForTimeout(5200);
    h.eq('grid catches up after the button disarms', await a.locator('.gcard .nm', { hasText: '새하객1' }).count(), 1);
  });

  await h.step('phones: stale ?me=, ?tv=1 on touch, ?demo=0 exits demo', async () => {
    const p = await h.page('phone', { tag: 'phone' });
    await p.goto(h.url('village.html', { me: 'does_not_exist' })); await p.waitForTimeout(1500);
    h.check('stale ?me= → sign-up bar instead of a dead remote', (await p.locator('#mremote a.sign').count()) === 1 && (await p.locator('#mremote button.em').count()) === 0);
    await p.goto(h.url('village.html', { tv: 1 })); await p.waitForTimeout(800);
    h.check('?tv=1 on a touch device → TV layout (QR visible)', !(await p.evaluate(() => document.body.classList.contains('touch'))) && await p.isVisible('.qr'));
    const nd = await h.page(p.context(), { tag: 'no-demo' });
    h.allowErrors({ tag: 'no-demo', re: /./ });           // leaving demo tries the real Firebase SDK, which this sandbox can't reach
    await nd.goto(h.url('index.html', { demo: 0 })); await nd.waitForTimeout(500);
    h.check('?demo=0 leaves demo mode', (await nd.locator('.demo-ribbon').count()) === 0 && (await nd.evaluate(() => sessionStorage.getItem('wgb_demo'))) === null);
  });

  await h.step('report: local-day buckets', async () => {
    const p = await h.page('desktop', { tag: 'report' }); await p.goto(h.url('admin.html'));
    const tl = await p.evaluate(async () => {
      const { computeReport } = await import('/js/report.js');
      const base = new Date(2027, 3, 10, 19, 0).getTime();   // local 7 pm on the wedding day
      const gs = [new Date(2027, 3, 8, 12).getTime(), base, base + 3600e3].map((t, i) => ({ id: 'g' + i, name: 'n', side: 'both', message: 'm', avatar: { outfit: 'suit' }, activity: 'walk', hidden: false, createdAt: t }));
      return computeReport(gs).timeline.map(t => t.label + ':' + t.v).join(' ');
    });
    h.check('report day buckets use local dates', tl.includes('4/10:2'), tl);
  });

  await h.step('demo: another tab never misses an update (BroadcastChannel can outrun localStorage)', async () => {
    const w = await h.context('laptop');
    const tv = await h.page(w, { tag: 'sync-tv' }); await tv.goto(h.url('village.html', { time: 'day' })); await tv.waitForTimeout(1200);
    const writer = await h.page(w, { tag: 'sync-writer' }); await writer.goto(h.url('index.html')); await writer.waitForTimeout(300);
    const missed = [];
    for (let i = 1; i <= 15; i++) {
      await addGuests(h, writer, 1, 'sync' + i + '-');
      if (!(await until(async () => (await villageCount(tv)) === i, 2500))) missed.push(i);
    }
    h.eq('TV caught all 15 rapid sign-ups from another tab', missed, []);
    const adm = await h.page(w, { tag: 'sync-admin' }); await adm.goto(h.url('admin.html'));
    await adm.waitForSelector('#grid .gcard'); await adm.click('#atabs [data-tab=snaps]'); await adm.waitForTimeout(500);
    const snapMissed = [];
    for (let i = 0; i < 6; i++) {
      await h.store(writer, async (s, k) => { const gs = JSON.parse(localStorage.getItem('wgb_demo_guests')); await s.addSnap(gs[k].id, gs[k].name, 'data:image/jpeg;base64,AAAA', 'x', 0); }, i);
      if (!(await until(async () => (await adm.$$('#snapgrid .snapcard')).length === i + 1, 2500))) snapMissed.push(i + 1);
    }
    h.eq('admin caught all 6 rapid snaps from another tab', snapMissed, []);
  });
};

// Coming back: returning-guest buttons, 🔑 admin entrance, kiosk hides the key, kiosk → phone hand-off link.
export const meta = { title: 'returning guest, admin key, kiosk hand-off', timeout: 120000 };

export default async (h) => {
  await h.step('returning guest sees "share photos" + "back to the village"', async () => {
    const p = await h.page('phone', { tag: 'returning' });
    await h.flows.signGuest(h, p, { name: '재방문', msg: '또 왔어요!' });
    h.eq('done screen remote title', await p.textContent('#remote-done h3'), '🎮 TV 속 내 캐릭터 움직이기');
    await p.goto(h.url('index.html')); await p.waitForTimeout(500);
    h.check('mine-row visible', await p.isVisible('#mine-row'));
    h.eq('KO labels', [await p.textContent('#btn-mysnap'), await p.textContent('#btn-village')], ['📷 사진 올리기', '🏡 다시 마을로']);
    const href = await p.getAttribute('#btn-village', 'href');
    h.check('village button links to my character', /village\.html\?.*me=/.test(href), href);
    await h.shot(p, '1-returning');
    await p.click('#btn-village'); await p.waitForTimeout(2500);
    h.check('lands in the village with the remote bar', p.url().includes('village.html') && await p.isVisible('#mremote'), p.url());
    await p.goto(h.url('index.html')); await p.click('.lang [data-lang=en]'); await p.waitForTimeout(300);
    h.eq('EN labels', [await p.textContent('#btn-mysnap'), await p.textContent('#btn-village')], ['📷 Share photos', '🏡 Back to the village']);
    await p.click('.lang [data-lang=ko]');
  });

  await h.step('🔑 admin entrance', async () => {
    const p = await h.page('phone', { tag: 'admin-key' });
    await p.goto(h.url('index.html')); await p.waitForTimeout(500);
    h.check('key visible on the welcome screen', await p.isVisible('#admin-link'));
    await p.click('#btn-start'); await p.waitForTimeout(200);
    h.check('key hidden during the guestbook steps', !(await p.isVisible('#admin-link')));
    await p.click('#info-back'); await p.waitForTimeout(200);
    await p.click('#admin-link'); await p.waitForLoadState(); await p.waitForTimeout(1000);
    h.check('admin opens (demo signs in automatically)', p.url().includes('admin.html') && await p.isVisible('#main'), p.url());
    h.eq('device remembered as admin', await p.evaluate(() => localStorage.getItem('wgb_admin')), '1');
    await h.shot(p, '2-admin');
    await p.click('text=🏠 방명록'); await p.waitForTimeout(700);
    h.eq('key turns into a labelled button on this device', (await p.textContent('#admin-link')).trim(), '🔑 관리자');
  });

  await h.step('kiosk never shows the key', async () => {
    const k = await h.page('tablet', { tag: 'kiosk' });
    await k.goto(h.url('kiosk.html')); await k.waitForTimeout(400);
    h.check('kiosk: key hidden', !(await k.isVisible('#admin-link')));
  });

  await h.step('kiosk hand-off link (#me=…) on a phone', async () => {
    const p = await h.page('phone', { tag: 'handoff' });
    await p.goto(h.url('index.html') + '#me=g_test123&n=' + encodeURIComponent('키오스크손님')); await p.waitForTimeout(800);
    h.check('opens the remote screen', await p.$eval('#s-remote', e => e.classList.contains('active')));
    h.check('hash cleared (no re-trigger on reload)', await p.evaluate(() => location.hash === ''));
    h.check('phone now remembers the kiosk guest', await p.evaluate(() => JSON.parse(localStorage.getItem('wgb_mine') || '[]').some(m => m.id === 'g_test123' && m.name === '키오스크손님')));
    await h.shot(p, '3-handoff');
  });
};

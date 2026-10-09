// English guest end to end on a small phone; language persists into the village; typing never fires TV shortcuts.
export const meta = { title: 'EN flow, language carries into the village, typing ≠ shortcuts', timeout: 120000 };

export default async (h) => {
  const g = await h.page('phoneSE', { tag: 'en' });
  await h.step('English guestbook', async () => {
    await g.goto(h.url('index.html'));
    await g.click('.lang [data-lang=en]'); await g.waitForTimeout(300);
    h.eq('<html lang="en">', await g.evaluate(() => document.documentElement.lang), 'en');
    h.eq('start button in English', (await g.textContent('#btn-start')).trim(), 'Sign the Guestbook');
    await h.shot(g, '1-welcome');
    await g.click('#btn-start');
    h.check('step label in English', /Guestbook/.test(await g.textContent('#step-label')), await g.textContent('#step-label'));
    await g.fill('#in-name', 'Grace Kim'); await g.fill('#in-msg', 'So happy for you both!');
    await g.click('#info-next'); await g.waitForTimeout(600);
    await h.shot(g, '2-photo');
    await g.click('#btn-skip'); await g.click('#btn-to-act'); await g.click('#btn-submit');
    await g.waitForSelector('#s-done.active'); await g.waitForTimeout(400);
    const txt = await g.$eval('#s-done', e => e.innerText);
    h.check('done screen has no Korean left', !/[가-힣]/.test(txt), (txt.match(/[^\n]*[가-힣][^\n]*/) || [''])[0]);
    await h.shot(g, '3-done');
  });

  await h.step('village keeps English; typing a caption never triggers shortcuts', async () => {
    const href = await g.getAttribute('#link-village', 'href');
    await g.goto(new URL(href, g.url()).href); await g.waitForTimeout(2500);
    h.eq('remote bar labels in English', await g.$$eval('#mremote button.em small', s => s.map(x => x.textContent)), ['Heart', 'Clap', 'Dance', 'Jump', 'Hi!']);
    await g.click('#mremote button.snap'); await g.waitForTimeout(400);
    await h.shot(g, '4-sheet');
    const banner = h.waitBanner(g, /bouquet|Group photo|부케|단체/i, 2500);
    await g.click('#snap-village .snap-cap'); await g.keyboard.type('bgx bgx');
    h.check('typing "bgx" in the caption starts no event', (await banner) === null);
    h.eq('caption kept what was typed', await g.inputValue('#snap-village .snap-cap'), 'bgx bgx');
  });
};

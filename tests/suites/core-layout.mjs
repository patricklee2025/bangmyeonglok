// Layout audit on every screen × device class: no overlapping controls, no sideways scroll,
// tap targets ≥ 32 px on touch screens (≥ 24 px with a mouse). Rules of the probe: tests/lib/harness.mjs → LAYOUT_PROBE.
// Screenshots of every screen land in tests/.out/core-layout/ — look at them after any UI change.
//
// When a v4 feature adds HUD/UI, it must keep this suite green. Never widen ALLOW_* to make a new feature pass;
// move the feature's UI into its HUD zone instead (docs/v4/05-ux-and-art.md).

export const meta = { title: 'no overlaps / sideways scroll / tiny tap targets on any screen or device', timeout: 300000, tags: ['slow'] };

/** Overlaps that are intentional (pattern matched against "a × b"). */
const ALLOW_OVERLAP = [];
/** Small targets that are known (pattern matched against "selector WxH"). Empty since WP-00c (the two v3.2 admin nits were enlarged). */
const ALLOW_SMALL = [];

export default async (h) => {
  const audit = async (p, label) => {
    const r = await h.layoutReport(p);
    const ov = r.overlaps.filter(o => !ALLOW_OVERLAP.some(re => re.test(o)));
    const sm = r.small.filter(s => !ALLOW_SMALL.some(re => re.test(s)));
    h.check(`${label}: no overlapping controls`, ov.length === 0, ov.join(' | '));
    h.check(`${label}: no sideways scroll`, !r.hscroll);
    h.check(`${label}: tap targets ≥ ${r.min} px`, sm.length === 0, sm.join(', '));
    await h.shot(p, label);
  };

  // TV first, so phones signing later appear on it
  const tvCtx = await h.context('tv');
  const tv = await h.page(tvCtx, { tag: 'tv' });
  await tv.goto(h.url('village.html', { seed: 14, time: 'day' })); await tv.waitForTimeout(1500);

  for (const dev of ['phoneSE', 'phone']) {
    await h.step(`${dev}: guestbook screens`, async () => {
      const ctx = await h.context(dev);
      const g = await h.page(ctx, { tag: dev });
      await g.goto(h.url('index.html')); await g.waitForTimeout(500);
      await audit(g, `${dev}-1-welcome`);
      await g.click('#btn-start'); await g.fill('#in-name', '김하객'); await g.fill('#in-msg', '결혼 진심으로 축하해요! 두 분 늘 행복하세요 :)');
      await audit(g, `${dev}-2-info`);
      await g.click('#info-next'); await g.waitForTimeout(1200);
      await audit(g, `${dev}-3-photo`);
      await g.setInputFiles('#file', h.fixture('face1.jpg'));
      await g.waitForSelector('#btn-use:not([hidden])', { timeout: 120000 }); await g.waitForTimeout(1300);
      await audit(g, `${dev}-3b-analyzed`);
      await g.click('#btn-use'); await g.waitForTimeout(400);
      await audit(g, `${dev}-4-custom`);
      await g.click('#btn-to-act'); await g.waitForTimeout(300);
      await audit(g, `${dev}-5-act`);
      await g.click('#btn-submit'); await g.waitForSelector('#s-done.active'); await g.waitForTimeout(500);
      await audit(g, `${dev}-6-done`);
      const href = await g.getAttribute('#link-village', 'href');
      await g.goto(new URL(href, g.url()).href); await g.waitForTimeout(3000);
      await audit(g, `${dev}-7-village`);
      await g.click('#mremote button.snap'); await g.waitForTimeout(400);
      await audit(g, `${dev}-8-sheet`);
      await g.click('#sheet-x'); await g.waitForTimeout(300);
      if (dev === 'phone') {
        await g.setViewportSize({ width: 844, height: 390 }); await g.waitForTimeout(1200);
        await audit(g, `${dev}-9-village-landscape`);
        await g.goto(h.url('index.html')); await g.waitForTimeout(500);
        await audit(g, `${dev}-10-welcome-landscape`);
        await g.setViewportSize({ width: 390, height: 844 }); await g.goto(h.url('index.html')); await g.waitForTimeout(400);
        await audit(g, `${dev}-11-returning`);
        await g.click('#btn-mysnap'); await g.waitForTimeout(400);
        await audit(g, `${dev}-12-remote-screen`);
      }
    });
  }

  await h.step('TV village', async () => { await tv.waitForTimeout(500); await audit(tv, 'tv-village'); });

  for (const dev of ['tablet', 'tabletLandscape']) {
    await h.step(`${dev}: kiosk screens`, async () => {
      const k = await h.page(dev, { tag: dev });
      await k.goto(h.url('kiosk.html')); await k.waitForTimeout(500);
      await audit(k, `${dev}-1-welcome`);
      await k.click('#btn-start'); await k.fill('#in-name', '키오스크'); await k.fill('#in-msg', '축하합니다!');
      await audit(k, `${dev}-2-info`);
      await k.click('#info-next'); await k.waitForTimeout(1200);
      await audit(k, `${dev}-3-photo`);
      await k.click('#btn-skip'); await k.waitForTimeout(300);
      await audit(k, `${dev}-4-custom`);
      await k.click('#btn-to-act'); await k.waitForTimeout(300);
      await audit(k, `${dev}-5-act`);
      await k.click('#btn-submit'); await k.waitForSelector('#s-done.active'); await k.waitForTimeout(400);
      await audit(k, `${dev}-6-done`);
    });
  }

  await h.step('village opened without signing (phone)', async () => {
    const v = await h.page('phone', { tag: 'unsigned' });
    await v.goto(h.url('village.html')); await v.waitForTimeout(2500);
    await audit(v, 'phone-unsigned-village');
  });

  await h.step('admin on a phone and a desktop (with guests)', async () => {
    for (const [dev, label] of [['phone', 'admin-phone'], ['desktop', 'admin-desktop']]) {
      const ctx = await h.context(dev);
      const seedPage = await h.page(ctx, { tag: label + '-seed' });
      await seedPage.goto(h.url('index.html'));
      await h.flows.addGuests(h, seedPage, 6, '하객');
      await seedPage.close();
      const a = await h.page(ctx, { tag: label });
      await a.goto(h.url('admin.html')); await a.waitForTimeout(1200);
      await audit(a, label);
    }
  });
};

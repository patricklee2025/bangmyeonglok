// Frame-rate budget for the village with a full house (50 guests = the real guest list).
// Threshold: PERF_MIN_FPS (default 24). Headless Chromium on a laptop/CI is slower than the venue TV laptop, so a pass
// here is a floor, not a promise; a big DROP versus the last run (see tests/.out/results.json) is the real signal.
// Tagged 'exclusive': the runner never runs it in parallel with other suites.
export const meta = { title: 'village frame rate with 50 villagers (TV, during events, phone)', timeout: 150000, tags: ['slow', 'exclusive'] };

const MIN_FPS = +(process.env.PERF_MIN_FPS || 24);

const measure = async (p, ms = 5000) => {
  await p.evaluate(() => window.__fps.reset());
  await p.waitForTimeout(ms);
  return p.evaluate(() => ({ fps: window.__fps.frames / ((performance.now() - window.__fps.since) / 1000), long: window.__fps.long }));
};
const fmt = r => `${r.fps.toFixed(1)} fps, ${r.long} long tasks`;

export default async (h) => {
  const ctx = await h.context('tv');
  const tv = await h.page(ctx, { tag: 'tv', fps: true });
  await tv.goto(h.url('village.html', { seed: 50, time: 'night' }));
  await tv.waitForTimeout(3500);

  await h.step('TV idle', async () => {
    const r = await measure(tv);
    h.check(`TV 1920×1080 · 50 villagers · night: ≥ ${MIN_FPS} fps`, r.fps >= MIN_FPS, fmt(r));
  });

  await h.step('TV during fireworks + bouquet', async () => {
    await tv.keyboard.press('x'); await tv.keyboard.press('b');
    await tv.waitForTimeout(1500);
    const r = await measure(tv, 6000);
    h.check(`TV during an event: ≥ ${MIN_FPS} fps`, r.fps >= MIN_FPS, fmt(r));
  });

  await h.step('phone following its own character', async () => {
    const pctx = await h.context('phone');
    const seed = await h.page(pctx, { tag: 'phone-seed' });
    await seed.goto(h.url('village.html', { seed: 49, tv: 1 })); await seed.waitForTimeout(1500);
    const { gid } = await h.flows.signGuest(h, seed, { name: '성능', msg: 'perf' });
    await seed.close();
    const ph = await h.page(pctx, { tag: 'phone', fps: true });
    await ph.goto(h.url('village.html', { me: gid })); await ph.waitForTimeout(3000);
    const r = await measure(ph);
    h.check(`phone 390×844 @2x · 50 villagers: ≥ ${MIN_FPS} fps`, r.fps >= MIN_FPS, fmt(r));
  });
};

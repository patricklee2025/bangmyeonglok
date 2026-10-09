// ============================================================
//  TEMPLATE for a v4 feature suite — copy to tests/features/<id>.mjs (files starting with "_" never run).
//  Requires tests/lib/v4.mjs (WP-00b). Checklist: docs/v4/04-testing.md §4.1 (S1–S9) + the WP's acceptance table (A1…).
//  Name every check after the rule it proves: 'S3 hot toggle: gone without reload', 'A4 closed poll rejects votes'.
// ============================================================
import { on, off, adminPage, setFlag, footprint, expectClean } from '../lib/v4.mjs';

const ID = 'example';                       // ← your feature id

export const meta = { title: `${ID}: <one line of what this proves>`, timeout: 240000 };

export default async (h) => {
  // S1 — off = zero footprint, core still works
  await h.step('S1 off', async () => {
    const p = await h.page('phone', { tag: 'off' });
    await p.goto(h.url('index.html', { ff: off(ID) }));
    await expectClean(h, p, ID, 'S1 guest page');
    // + one core action, e.g. await h.flows.signGuest(h, p, { open: false })
  });

  // S2 — on = visible in the promised place (zone / hub order / tab)
  await h.step('S2 on', async () => {
    const p = await h.page('phone', { tag: 'on' });
    await p.goto(h.url('index.html', { ff: on(ID) }));
    // h.check('S2 hub row at order 60', …)
  });

  // S3 — hot toggle via admin flag, no reload
  await h.step('S3 hot toggle', async () => {
    const world = await h.context('laptop');
    const tv = await h.page(world, { tag: 'tv' });
    await tv.goto(h.url('village.html', { seed: 10 }));
    const admin = await adminPage(h, world);
    await setFlag(h, admin, ID, true);   /* …expect visible… */
    await setFlag(h, admin, ID, false);  await expectClean(h, tv, ID, 'S3 after off');
    await setFlag(h, admin, ID, true);   /* …visible again… */
    await setFlag(h, admin, ID, null);
  });

  // S4 page/phase gates · S5 kiosk/simple · S6 English · S7 data contract · S8 layout · S9 WP scenarios (A1…)
  // await h.step('S4 phase gate', async () => { … h.url('index.html', { ff: on(ID), phase: 'after' }) … });
  // await h.step('S8 layout', async () => { const r = await h.layoutReport(p); h.check('S8 no overlaps', !r.overlaps.length, r.overlaps.join(' | ')); });
};

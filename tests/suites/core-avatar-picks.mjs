// ============================================================
//  v4.1 (2026-10, Patrick): avatar choices · ✨ four suggested looks · no-photo guests no longer start as the groom
//  - skip the photo → the ✨ tab with four varied looks; the look is never the old default (navy suit + short black hair)
//  - with a photo → ① as analysed ② hanbok ③ dressed up ④ casual — same skin, hair colour, face and glasses
//  - every new option name fits the rules' 24-character limit for avatar values
// ============================================================
import { myLastGuestId } from '../lib/flows.mjs';

export const meta = { title: 'avatar v4.1: many more options · four suggested looks (photo / no photo) · no-photo default ≠ groom', timeout: 240000 };

const until = async (page, fn, arg, ms = 8000) => { const t0 = Date.now(); do { if (await page.evaluate(fn, arg).catch(() => false)) return true; await page.waitForTimeout(100); } while (Date.now() - t0 < ms); return false; };

async function toPhoto(h, p) {
  await p.goto(h.url('index.html'));
  await p.click('#btn-start'); await p.fill('#in-name', '추천'); await p.fill('#in-msg', '축하해요'); await p.click('#info-next');
  await p.waitForSelector('#s-photo.active');
}
const picks = p => p.evaluate(() => [...document.querySelectorAll('#opts .pick')].map(b => ({ label: b.querySelector('span').textContent, on: b.getAttribute('aria-pressed') === 'true' })));

export default async (h) => {
  await h.step('options: many more choices, every value short enough for the rules (≤ 24 characters)', async () => {
    const p = await h.page('desktop', { tag: 'units' });
    await p.goto(h.base + 'css/style.css');
    const r = await p.evaluate(async () => {
      const A = await import('/js/avatar.js');
      const lists = { HAIR_STYLES: A.HAIR_STYLES, OUTFITS: A.OUTFITS, ACCESSORIES: A.ACCESSORIES, EYES: A.EYES, MOUTHS: A.MOUTHS, GLASSES: A.GLASSES, FACES: A.FACES, BROWS: A.BROWS, BEARDS: A.BEARDS, BANGS: A.BANGS, HAIR_EXTRAS: A.HAIR_EXTRAS };
      const long = Object.values(lists).flat().filter(v => String(v).length > 24);
      let seed = 3; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      const many = Array.from({ length: 300 }, () => A.randomAvatar({}, null, rnd));
      const badPin = many.filter(a => a.acc === 'binyeo' && !['bun', 'topknot', 'spacebuns'].includes(a.hairStyle)).length;
      const sizes = Object.fromEntries(Object.entries(lists).map(([k, v]) => [k, v.length]));
      const outfits = new Set(many.map(a => a.outfit)).size, hairs = new Set(many.map(a => a.hairStyle)).size, accs = new Set(many.map(a => a.acc)).size;
      return { long, badPin, sizes, outfits, hairs, accs, colors: [A.HAIR.length, A.COLORS.length] };
    });
    h.check('option lists grew: ≥ 26 hairstyles · ≥ 17 outfits · ≥ 19 accessories · ≥ 10 eyes · ≥ 8 mouths · ≥ 7 glasses · ≥ 5 face shapes',
      r.sizes.HAIR_STYLES >= 26 && r.sizes.OUTFITS >= 17 && r.sizes.ACCESSORIES >= 19 && r.sizes.EYES >= 10 && r.sizes.MOUTHS >= 8 && r.sizes.GLASSES >= 7 && r.sizes.FACES >= 5, JSON.stringify(r.sizes));
    h.check('more hair colours (≥ 24) and clothes colours (≥ 26)', r.colors[0] >= 24 && r.colors[1] >= 26, JSON.stringify(r.colors));
    h.eq('every option value fits the rules\' 24-character limit', r.long, []);
    h.check('300 random looks use the wider range (≥ 15 outfits · ≥ 20 hairstyles · ≥ 15 accessories)', r.outfits >= 15 && r.hairs >= 20 && r.accs >= 15, JSON.stringify({ o: r.outfits, h: r.hairs, a: r.accs }));
    h.eq('a binyeo (hairpin) only with a knot', r.badPin, 0);
  });

  await h.step('no photo: the ✨ tab opens with four varied looks — the guest never starts as the groom', async () => {
    const p = await h.page('phone', { tag: 'nophoto' });
    const seen = new Set(); let groomish = 0;
    for (let i = 0; i < 6; i++) {
      await toPhoto(h, p);
      await p.click('#btn-skip');
      await p.waitForSelector('#s-custom.active');
      const st = await p.evaluate(async () => {
        const A = await import('/js/avatar.js'), { CONFIG } = await import('/js/config.js');
        const sel = document.querySelector('#tabs [aria-selected="true"]')?.textContent || '';
        return { sel, n: document.querySelectorAll('#opts .pick').length, pressed: document.querySelectorAll('#opts .pick[aria-pressed="true"]').length, def: JSON.stringify(A.normalizeAvatar(A.defaultAvatar())), groom: JSON.stringify(A.normalizeAvatar(CONFIG.groomAvatar)) };
      });
      if (i === 0) {
        h.eq('the ✨ tab is selected and shows 4 looks, the first one chosen', [st.sel, st.n, st.pressed], ['✨ 추천', 4, 1]);
        await h.shot(p, 'picks-nophoto');
      }
      const looks = await p.evaluate(() => [...document.querySelectorAll('#opts .pick span')].map(s => s.textContent));
      if (i === 0) h.eq('labels "추천 1–4"', looks, ['추천 1', '추천 2', '추천 3', '추천 4']);
      // what would be saved now
      await p.click('#btn-to-act'); await p.click('#btn-submit'); await p.waitForSelector('#s-done.active', { timeout: 20000 });
      const id = await myLastGuestId(p);
      const av = await h.store(p, (s, gid) => new Promise(res => { const off = s.subscribeGuests(l => { off(); res(l.find(x => x.id === gid)?.avatar); }); }), id);
      seen.add(av.outfit);
      const j = JSON.stringify(av);
      if (j === st.def || j === st.groom || (av.outfit === 'suit' && av.hairStyle === 'short' && av.hair === 0 && av.color === 1)) groomish++;
    }
    h.eq('6 guests without a photo: none saved with the default / groom look', groomish, 0);
    h.check('…and they do not all wear the same outfit', seen.size >= 2, [...seen].join(','));
  });

  await h.step('picking: tap a look → the preview takes it · 🎲 gives four new ones · the other tabs still fine-tune', async () => {
    const p = await h.page('phone', { tag: 'pick' });
    await toPhoto(h, p);
    await p.click('#btn-skip'); await p.waitForSelector('#s-custom.active');
    const before = await p.evaluate(() => [...document.querySelectorAll('#opts .pick canvas')].map(c => c.toDataURL()));
    await p.click('#opts .pick[data-i="2"]');
    h.eq('the third look is now chosen', (await picks(p)).map(x => x.on), [false, false, true, false]);
    await p.click('#opts .pick-more');
    const after = await p.evaluate(() => [...document.querySelectorAll('#opts .pick canvas')].map(c => c.toDataURL()));
    h.check('🎲 → four different looks', after.length === 4 && after.some((u, i) => u !== before[i]));
    await p.click('#tabs button:nth-child(4)');                                  // 옷
    h.check('the outfit tab lists the new outfits (≥ 17 thumbnails)', await p.evaluate(() => document.querySelectorAll('#opts .opt-group:first-child .thumbs button').length >= 17));
    const r = await h.layoutReport(p);
    h.check('custom screen with five tabs: no overlaps, touch sizes OK', !r.overlaps.length && !(r.small || []).length, JSON.stringify({ o: r.overlaps, s: r.small }));
  });

  await h.step('with a photo: ① as analysed ② hanbok ③ dressed up ④ casual — same face, skin, hair colour and glasses', async () => {
    const p = await h.page('phone', { tag: 'photo' });
    await toPhoto(h, p);
    await p.setInputFiles('#file', h.fixture('face0.jpg'));
    await p.waitForSelector('#btn-use:not([hidden])', { timeout: 120000 }); await p.waitForTimeout(300);
    await p.click('#btn-use'); await p.waitForSelector('#s-custom.active');
    h.eq('labels', (await picks(p)).map(x => x.label), ['그대로', '한복', '차려입기', '캐주얼']);
    h.eq('the photo look is chosen first', (await picks(p)).map(x => x.on), [true, false, false, false]);
    // the chosen look after each tap is what gets saved — tap the hanbok one and save
    await p.click('#opts .pick[data-i="1"]');
    await p.click('#btn-to-act'); await p.click('#btn-submit'); await p.waitForSelector('#s-done.active', { timeout: 20000 });
    const id = await myLastGuestId(p);
    const av = await h.store(p, (s, gid) => new Promise(res => { const off = s.subscribeGuests(l => { off(); res(l.find(x => x.id === gid)?.avatar); }); }), id);
    h.check('the hanbok look was saved', ['hanbok_chima', 'hanbok_baji', 'dangui', 'durumagi'].includes(av?.outfit), JSON.stringify(av));
    const units = await p.evaluate(async () => {
      const A = await import('/js/avatar.js');
      const base = { skin: '#c9906a', hair: '#2a2024', hairStyle: 'photo', hp: { t: 1, l: 3, b: 'center', c: 0, k: 'none' }, face: 'oval', eyes: 'big', brows: 'thin', mouth: 'smile', beard: 'none', glasses: 'round', outfit: 'dress', color: '#7a9cc8' };
      let seed = 11; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      const res = [];
      for (let k = 0; k < 20; k++) {
        const L = A.suggestLooks(base, k % 2 ? 'female' : 'male', rnd);
        res.push({
          n: L.length,
          same: L.every(a => a.skin === L[0].skin && a.hair === L[0].hair && a.face === L[0].face && a.eyes === L[0].eyes && a.glasses === L[0].glasses && a.beard === L[0].beard),
          first: JSON.stringify(L[0]) === JSON.stringify(A.normalizeAvatar(base)),
          hanbok: ['hanbok_chima', 'hanbok_baji', 'dangui', 'durumagi'].includes(L[1].outfit),
          differ: new Set(L.map(a => a.outfit + '|' + a.acc + '|' + a.hairStyle)).size === 4,
        });
      }
      return res;
    });
    h.check('20 suggestion sets: 4 looks each, ① = the photo look, ② hanbok, shared face/skin/hair colour/glasses, all four different',
      units.every(u => u.n === 4 && u.first && u.hanbok && u.same && u.differ), JSON.stringify(units.filter(u => !(u.n === 4 && u.first && u.hanbok && u.same && u.differ)).slice(0, 3)));
    await h.shot(p, 'picks-photo-done');
  });

  await h.step('English: the ✨ tab and its labels', async () => {
    const p = await h.page('phone', { tag: 'en' });
    await p.addInitScript(() => localStorage.setItem('wgb_lang', 'en'));
    await toPhoto(h, p);
    await p.click('#btn-skip'); await p.waitForSelector('#s-custom.active');
    h.eq('tab + labels in English', [await p.textContent('#tabs [aria-selected="true"]'), await p.textContent('#opts .pick-more'), (await picks(p))[0].label], ['✨ Picks', '🎲 More ideas', 'Look 1']);
  });
};

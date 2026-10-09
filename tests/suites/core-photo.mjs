// v3.3 hotfix — photos: consecutive snap uploads (every entry point), transient-error retry, in-app browser hint,
// the Firestore cache choice for phones, snap size; photo → avatar skin colour and gender (added below).
import fs from 'node:fs';
import { signGuest, openMyVillage } from '../lib/flows.mjs';

export const meta = { title: 'photos: consecutive snap uploads, retry, in-app hint, cache choice, skin colour & gender', timeout: 400000, tags: ['slow'] };

const KAKAO_UA = 'Mozilla/5.0 (Linux; Android 14; SM-S918N Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.6668.100 Mobile Safari/537.36;KAKAOTALK 2410620';

export default async (h) => {
  const states = (page, box) => page.evaluate(b => [...document.querySelectorAll(b + ' .snap-item')].map(n => n.dataset.s), box);
  const okCount = (page, box, n) => page.waitForFunction(([b, k]) => document.querySelectorAll(b + ' .snap-item[data-s=ok]').length >= k, [box, n], { timeout: 30000 }).then(() => true).catch(() => false);
  const inputOf = (page, box, which) => page.$(`${box} .snap-actions label${which === 'album' ? '.blue' : ':not(.blue)'} input`);

  await h.step('done screen: take one, take another, then one from the album — each uploads; the file input is fresh after every pick', async () => {
    const g = await h.page('phone');
    const { gid } = await signGuest(h, g, { name: '연속업로드', photo: 'face0.jpg' });
    const picks = [['shoot', 'face1.jpg'], ['shoot', 'face2.jpg'], ['album', 'face3.jpg']];
    for (const [i, [which, f]] of picks.entries()) {
      const before = await inputOf(g, '#snap-done', which);
      await before.setInputFiles(h.fixture(f));
      h.check(`upload #${i + 1} (${which}) → ✓`, await okCount(g, '#snap-done', i + 1), JSON.stringify(await states(g, '#snap-done')));
      const after = await inputOf(g, '#snap-done', which);
      h.check(`upload #${i + 1}: the ${which} button holds a brand-new <input> (old one left the page)`, !!after && !(await before.evaluate(n => n.isConnected)));
      h.eq(`upload #${i + 1}: the new input keeps its kind`, await after.evaluate(n => [n.type, n.accept, n.multiple, n.getAttribute('capture')]), ['file', 'image/*', which === 'album', which === 'shoot' ? 'environment' : null]);
    }
    const ids = await g.evaluate(id => JSON.parse(localStorage.getItem('wgb_demo_snaps') || '[]').filter(m => m.gid === id).map(m => m.id).sort(), gid);
    h.eq('three snaps stored in slots 0 · 1 · 2', ids, [gid + '_0', gid + '_1', gid + '_2']);
    h.check('no in-app browser note in a normal browser', !(await g.$('#snap-done .snap-inapp')));
    await h.shot(g, '1-done-three-in-a-row');
  });

  await h.step('village phone sheet: upload, close, reopen, upload again (3×)', async () => {
    const g = await h.page('phone');
    await signGuest(h, g, { name: '마을업로드' });
    await openMyVillage(h, g);
    for (let i = 0; i < 3; i++) {
      await g.click('#mremote button.snap'); await g.waitForTimeout(350);
      await (await inputOf(g, '#snap-village', i % 2 ? 'album' : 'shoot')).setInputFiles(h.fixture(`face${i + 1}.jpg`));
      h.check(`sheet upload #${i + 1} → ✓`, await okCount(g, '#snap-village', i + 1), JSON.stringify(await states(g, '#snap-village')));
      await g.click('#sheet-x'); await g.waitForTimeout(900);
    }
  });

  await h.step('a network blip is retried by itself; a refused write shows ↻ with its reason and works when tapped', async () => {
    const g = await h.page('phone');
    await signGuest(h, g, { name: '재시도' });
    await h.store(g, s => {
      const orig = s.addSnap.bind(s); window.__calls = 0; window.__mode = 'blip';
      s.addSnap = async (...a) => {
        window.__calls++;
        if (window.__mode === 'blip' && window.__calls === 1) throw Object.assign(new Error('blip'), { code: 'unavailable' });
        if (window.__mode === 'deny') { window.__mode = 'ok'; throw Object.assign(new Error('nope'), { code: 'permission-denied' }); }
        return orig(...a);
      };
    });
    await (await inputOf(g, '#snap-done', 'shoot')).setInputFiles(h.fixture('face1.jpg'));
    h.check('"unavailable" once → retried → ✓', await okCount(g, '#snap-done', 1), JSON.stringify(await states(g, '#snap-done')));
    h.eq('it took two tries', await g.evaluate(() => window.__calls), 2);
    await g.evaluate(() => { window.__mode = 'deny'; });
    await (await inputOf(g, '#snap-done', 'shoot')).setInputFiles(h.fixture('face2.jpg'));
    await g.waitForSelector('#snap-done .snap-item[data-s=err]', { timeout: 20000 });
    h.eq('"permission-denied" is not retried: ↻ with the reason in data-err', await g.$eval('#snap-done .snap-item[data-s=err]', n => n.dataset.err), 'permission-denied');
    await g.click('#snap-done .snap-item[data-s=err]');
    h.check('tapping ↻ uploads it', await okCount(g, '#snap-done', 2), JSON.stringify(await states(g, '#snap-done')));
  });

  await h.step('KakaoTalk in-app browser: a note + "open in browser" link that keeps who you are', async () => {
    const kctx = await h.context('phone', { userAgent: KAKAO_UA });
    const g = await h.page(kctx);
    const { gid } = await signGuest(h, g, { name: '카톡하객' });
    h.check('the note is shown above the buttons', await g.isVisible('#snap-done .snap-inapp'));
    const href = await g.getAttribute('#snap-done .snap-inapp a', 'href');
    h.check('the link uses KakaoTalk\'s "open externally" scheme', href.startsWith('kakaotalk://web/openExternal?url='), href);
    const target = decodeURIComponent(href.split('url=')[1]);
    h.check('…to this site with #me=<guest>&n=<name>', target.includes('#me=' + encodeURIComponent(gid)) && target.includes('&n=' + encodeURIComponent('카톡하객')), target);
    const r = await h.layoutReport(g);
    h.check('layout: no overlaps · no sideways scroll · tap targets', r.overlaps.length === 0 && !r.hscroll && r.small.length === 0, JSON.stringify(r).slice(0, 400));
    await h.shot(g, '2-kakao-note');
    // the phone's real browser = another browser context: opening that link remembers the guest and opens the uploader
    const b = await h.page('phone');
    const u = new URL(target); if (!u.searchParams.has('phase')) u.searchParams.set('phase', 'live');   // v4: in the "pre" phase the photo uploader is hidden on purpose
    await b.goto(u.href);
    await b.waitForSelector('#snap-solo .snap-actions', { timeout: 15000 });
    h.check('the phone browser opens this guest\'s photo uploader', await b.isVisible('#snap-solo .snap-actions'));
  });

  await h.step('Firestore cache: memory on phones, IndexedDB on TV / kiosk / desktop · snaps stay ≤ 600 KB', async () => {
    const p = await h.page('desktop');
    await p.goto(h.url('index.html'));
    const kinds = await p.evaluate(async () => {
      const { cacheKind } = await import('/js/store.js');
      const L = (path, search = '') => ({ pathname: path, search });
      const M = coarse => q => ({ matches: q === '(pointer: coarse)' && coarse });
      return [cacheKind(L('/index.html'), M(true)), cacheKind(L('/village.html', '?me=x'), M(true)), cacheKind(L('/village.html'), M(false)),
        cacheKind(L('/kiosk.html'), M(true)), cacheKind(L('/admin.html'), M(false)), cacheKind(L('/index.html', '?cache=disk'), M(true)), cacheKind(L('/village.html', '?cache=memory'), M(false))];
    });
    h.eq('phone guest · phone village · TV · kiosk · admin · ?cache=disk · ?cache=memory', kinds, ['memory', 'memory', 'disk', 'disk', 'disk', 'disk', 'memory']);
    const out = await p.evaluate(async () => {
      const { compressImage } = await import('/js/snaps.js');
      const c = document.createElement('canvas'); c.width = 4000; c.height = 3000; const g = c.getContext('2d');
      const img = g.createImageData(4000, 3000); for (let i = 0; i < img.data.length; i++) img.data[i] = (i * 2654435761 >>> 7) & 255;   // worst case: noise
      g.putImageData(img, 0, 0);
      const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.95));
      const o = await compressImage(new File([blob], 'big.jpg', { type: 'image/jpeg' }), 1280);
      return { len: o.data.length, thumb: o.thumb.startsWith('data:image/jpeg') };
    });
    h.check('a 4000×3000 noise photo becomes ≤ 600 000 characters with a thumbnail', out.len <= 600000 && out.thumb, JSON.stringify(out));
  });

  // ---------------------------------------------------------------- photo → avatar: gender and skin colour
  const b64 = f => 'data:image/jpeg;base64,' + fs.readFileSync(h.fixture(f)).toString('base64');
  const lab = await h.page('desktop');
  await lab.goto(h.url('index.html'));
  // analyse one fixture as the guest page does (square 360 px work copy), optionally after a per-pixel transform
  const analyse = (src, cast = null, darkenFace = null) => lab.evaluate(async ([src, cast, darkenFace]) => {
    const F = await import('/js/face.js');
    const img = new Image(); img.src = src; await img.decode();
    const c = document.createElement('canvas'); c.width = c.height = 360; const g = c.getContext('2d', { willReadFrequently: true });
    const s = Math.min(img.naturalWidth, img.naturalHeight); g.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, 360, 360);
    const d = g.getImageData(0, 0, 360, 360);
    if (cast) for (let i = 0; i < d.data.length; i += 4) for (let j = 0; j < 3; j++) d.data[i + j] = Math.min(255, d.data[i + j] * cast[j]);
    if (darkenFace) {   // the same person with darker skin, same light: only the face ellipse gets darker
      const b = darkenFace, cx = (b.x + b.w / 2) * 360, cy = (b.y + b.h / 2) * 360, rx = b.w * 360 * 0.62, ry = b.h * 360 * 0.75;
      for (let y = 0; y < 360; y++) for (let x = 0; x < 360; x++) if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 < 1) { const i = (y * 360 + x) * 4; for (let j = 0; j < 3; j++) d.data[i + j] *= 0.5; }
    }
    g.putImageData(d, 0, 0);
    const r = await F.analyzePhoto(c);
    return r.ok ? { gender: r.gender, p: r.genderP, idx: F.skinIndex(r.patch.skin), skin: r.patch.skin, outfit: r.patch.outfit, beard: r.patch.beard, hp: r.patch.hp, tags: r.tags.map(t => t.ko), box: r.box } : null;
  }, [src, cast, darkenFace]);

  const looks = {};
  await h.step('gender model: 5 women and 3 men are read correctly (≥ 0.8) and the whole look follows', async () => {
    for (const f of ['face0', 'face1', 'face2', 'face3', 'face4', 'male0', 'male1', 'male2']) {
      const want = f.startsWith('male') ? 'male' : 'female';
      const r = looks[f] = await analyse(b64(f + '.jpg'));
      if (f === 'male1') {   // a blurry, low-resolution face (≈ 0.83): it may fall under the bar, but must never be read as a woman
        h.check(`${f}: read as ${want} or left undecided — never the opposite`, r && r.gender !== 'female', JSON.stringify(r && { gender: r.gender, p: r.p }));
        if (!r.gender) continue;
      } else h.check(`${f}: read as ${want}`, r?.gender === want && r.p >= 0.8, JSON.stringify(r && { gender: r.gender, p: r.p }));
      if (want === 'female') h.check(`${f}: dress · no beard · short or tied hair shown as a bun`, r.outfit === 'dress' && r.beard === 'none' && (r.hp.l >= 2 || r.hp.k === 'bun'), JSON.stringify({ outfit: r.outfit, beard: r.beard, hp: r.hp }));
      else h.check(`${f}: suit / casual · hair at most bob length · nothing tied`, ['suit', 'casual', 'hanbok_baji'].includes(r.outfit) && r.hp.l <= 2 && r.hp.k === 'none', JSON.stringify({ outfit: r.outfit, hp: r.hp }));
      h.check(`${f}: the chip says so`, r.tags.includes(want === 'male' ? '남성 스타일' : '여성 스타일'), r.tags.join(','));
    }
  });

  await h.step('genderize / randomAvatar: one consistent look, never a mix', async () => {
    const out = await lab.evaluate(async () => {
      const { genderize } = await import('/js/face.js');
      const { randomAvatar } = await import('/js/avatar.js');
      const hp = (l, k = 'none') => ({ t: 1, l, b: 'spiky', c: 1, k });
      const f = genderize({ outfit: 'casual', beard: 'goatee', acc: 'bowtie', hairStyle: 'photo', hp: hp(1) }, 'female');
      const f2 = genderize({ outfit: 'hanbok_baji', beard: 'none', acc: 'none', hairStyle: 'photo', hp: { t: -1, l: 0, b: 'none', c: 0, k: 'none' } }, 'female');
      const m = genderize({ outfit: 'dress', beard: 'none', acc: 'tiara', hairStyle: 'photo', hp: hp(4, 'bun') }, 'male');
      const m2 = genderize({ outfit: 'hanbok_chima', acc: 'none', hairStyle: 'short' }, 'male');
      const n = genderize({ outfit: 'dress', beard: 'full', acc: 'tiara', hairStyle: 'photo', hp: hp(4) }, null);
      // v4.1 (2026-10): more outfits — some read as one gender, others (cardigan · trench · aloha · jumpsuit · hoodie · overalls · casual) as either
      const FEM = ['dress', 'hanbok_chima', 'dangui', 'blouse', 'longdress', 'aline'], MASC = ['suit', 'vest', 'hanbok_baji', 'durumagi'];
      const MALE_ONLY_ACC = ['bowtie', 'gat'], FEM_ACC = ['flower', 'ribbon', 'tiara', 'flowercrown', 'pearls'];
      let mixed = 0, maleOk = 0, femOk = 0;
      for (let i = 0; i < 400; i++) {
        const a = randomAvatar();
        const fem = FEM.includes(a.outfit), masc = MASC.includes(a.outfit);
        const femSigns = FEM_ACC.includes(a.acc), mascSigns = a.beard !== 'none' || MALE_ONLY_ACC.includes(a.acc) || ['buzz', 'pomp'].includes(a.hairStyle);
        if ((fem && mascSigns) || (masc && femSigns) || (femSigns && mascSigns)) mixed++;
        const am = randomAvatar({}, 'male'); if (!FEM.includes(am.outfit) && !FEM_ACC.includes(am.acc)) maleOk++;
        const af = randomAvatar({}, 'female'); if (!MASC.includes(af.outfit) && af.beard === 'none' && !MALE_ONLY_ACC.includes(af.acc) && !['buzz', 'pomp'].includes(af.hairStyle)) femOk++;
      }
      return { f, f2, m, m2, n, mixed, maleOk, femOk };
    });
    h.eq('female: casual→dress · beard off · bowtie off · short untied hair → bun', [out.f.outfit, out.f.beard, out.f.acc, out.f.hp.k], ['dress', 'none', 'none', 'bun']);
    h.eq('female: baji→chima · "bald" (hair pulled back) → hair with a bun', [out.f2.outfit, out.f2.hp.t, out.f2.hp.l, out.f2.hp.k], ['hanbok_chima', 1, 1, 'bun']);
    h.eq('male: dress→casual · tiara off · long hair → bob, no bun · curls kept at bob length', [out.m.outfit, out.m.acc, out.m.hp.l, out.m.hp.k, out.m.hp.c], ['casual', 'none', 2, 'none', 1]);
    h.eq('male: chima→baji', out.m2.outfit, 'hanbok_baji');
    h.eq('unknown gender: nothing is changed', [out.n.outfit, out.n.beard, out.n.acc, out.n.hp.l], ['dress', 'full', 'tiara', 4]);
    h.eq('400 random looks (no photo): none mixes the two', out.mixed, 0);
    h.eq('randomAvatar(…, "male") × 400: all masculine · (…, "female") × 400: all feminine', [out.maleOk, out.femOk], [400, 400]);
  });

  await h.step('skin colour: lighting casts move it at most one step (a dim photo two), and darker skin stays darker', async () => {
    const casts = { warm: [1.12, 1, 0.72], cool: [0.82, 0.95, 1.2], green: [0.9, 1.1, 0.88], dim: [0.55, 0.55, 0.55] };
    for (const f of ['face0', 'face1', 'face2', 'face4', 'male0', 'male2']) {
      const base = looks[f] || await analyse(b64(f + '.jpg'));
      for (const [k, m] of Object.entries(casts)) {
        const r = await analyse(b64(f + '.jpg'), m);
        if (!r) continue;   // a strong cast can hide the face from the detector — then the photo isn't used for skin at all (next step)
        const lim = k === 'dim' ? 2 : 1;
        h.check(`${f} · ${k} light: skin step ${base.idx} → ${r.idx} (≤ ${lim})`, Math.abs(r.idx - base.idx) <= lim, `${base.skin} → ${r.skin}`);
      }
      const dark = await analyse(b64(f + '.jpg'), null, base.box);
      h.check(`${f}: the same face with darker skin in the same light is ≥ 3 steps darker, or near the darkest step (not lifted back up)`, dark && (dark.idx - base.idx >= 3 || dark.idx >= 8), `${base.idx} → ${dark?.idx}`);
    }
  });

  await h.step('a photo without a face: the skin is left alone (it used to take the colour of the middle of the picture)', async () => {
    const g = await h.page('phone');
    await signGuest(h, g, { name: '풍경사진', photo: 'noface.jpg' });
    const av = await h.store(g, s => new Promise(res => { const off = s.subscribeGuests(l => { off(); res(l.find(x => x.name === '풍경사진')?.avatar); }); }));
    h.eq('skin = the default step (2), not sky blue or grass green', av?.skin, 2);
    h.check('the clothes colour comes from the photo', typeof av?.color === 'string' && av.color.startsWith('#'), JSON.stringify(av));
  });

  await h.step('guest flow: a man\'s photo is saved with a masculine look, a woman\'s with a feminine one', async () => {
    for (const [f, nm, want] of [['male2.jpg', '남자사진', 'male'], ['face2.jpg', '여자사진', 'female']]) {
      const g = await h.page('phone');
      await signGuest(h, g, { name: nm, photo: f, simple: true });
      const av = await h.store(g, (s, n) => new Promise(res => { const off = s.subscribeGuests(l => { off(); res(l.find(x => x.name === n)?.avatar); }); }), nm);
      h.eq(`${nm}: the avatar came from the photo analysis`, av?.hairStyle, 'photo');
      if (want === 'male') h.check(`${nm} (simple mode, straight from the photo): suit/casual, hair ≤ bob`, ['suit', 'casual', 'hanbok_baji'].includes(av.outfit) && (av.hp?.l ?? 1) <= 2, JSON.stringify(av));
      else h.check(`${nm} (simple mode, straight from the photo): dress, no beard`, av.outfit === 'dress' && av.beard === 'none', JSON.stringify(av));
    }
  });
};

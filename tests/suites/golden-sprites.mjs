// Golden sprite test: every avatar option × every animation frame must render byte-identically to the
// recorded baseline (tests/golden/sprites.json). Protects guests' characters from accidental changes in avatar.js.
//
//   • New options (e.g. WP-02 couple outfits) only ADD keys → reported, not failed. Record them with: npm run golden:update
//   • A changed or vanished key FAILS. If the change is intended, say so in the WP report and run golden:update.
//   • Fresh machine and nothing in avatar.js changed but it fails? Rendering differs per platform: run
//     `npm run golden:update` once BEFORE starting work and commit "test: re-baseline golden sprites".
import fs from 'node:fs';
import path from 'node:path';

export const meta = { title: 'avatar sprites match the recorded baseline (all options × frames)', timeout: 90000 };

export default async (h) => {
  const p = await h.page('desktop', { tag: 'sprites' });
  await p.goto(h.base + 'css/style.css');          // any same-origin document will do; nothing app-side runs

  const res = await p.evaluate(async () => {
    const A = await import('/js/avatar.js');
    const { CONFIG } = await import('/js/config.js');
    const base = A.defaultAvatar();
    const list = [];                                  // [key, avatar, allFrames]
    const add = (key, patch, all = true) => list.push([key, { ...base, ...patch }, all]);
    A.SKIN.forEach((_, i) => add('skin:' + i, { skin: i }, false));
    A.HAIR.forEach((_, i) => add('hair:' + i, { hair: i }, false));
    A.COLORS.forEach((_, i) => add('color:' + i, { color: i }, false));
    add('hex:skin', { skin: '#c08060' }, false); add('hex:hair', { hair: '#123456' }, false);
    add('hex:color', { color: '#abcdef' }, false); add('hex:color2', { color: 2, color2: '#ff8800' }, false);
    A.HAIR_STYLES.forEach(v => add('hairStyle:' + v, { hairStyle: v }));
    const hp = { t: 1, l: 1, b: 'spiky', c: 0, k: 'none' };
    [-1, 0, 1, 2].forEach(v => add('photoHair:t' + v, { hairStyle: 'photo', hp: { ...hp, t: v } }));
    [0, 1, 2, 3, 4].forEach(v => add('photoHair:l' + v, { hairStyle: 'photo', hp: { ...hp, l: v } }));
    A.BANGS.forEach(v => add('photoHair:b-' + v, { hairStyle: 'photo', hp: { ...hp, b: v } }));
    [0, 1].forEach(v => add('photoHair:c' + v, { hairStyle: 'photo', hp: { ...hp, c: v } }));
    ['none', 'bun', 'pony', 'twin'].forEach(v => add('photoHair:k-' + v, { hairStyle: 'photo', hp: { ...hp, k: v } }));
    for (const [k, arr] of [['face', A.FACES], ['eyes', A.EYES], ['brows', A.BROWS], ['mouth', A.MOUTHS], ['beard', A.BEARDS], ['glasses', A.GLASSES], ['outfit', A.OUTFITS]])
      arr.forEach(v => add(k + ':' + v, { [k]: v }));
    [...A.ACCESSORIES, 'boutonniere', 'veil'].forEach(v => add('acc:' + v, { acc: v }));
    add('couple:groom', CONFIG.groomAvatar); add('couple:bride', CONFIG.brideAvatar);
    add('mix:hanbok', { outfit: 'hanbok_chima', hairStyle: 'bun', acc: 'flower', glasses: 'round', color: 12, skin: 1 });
    add('mix:gat', { outfit: 'hanbok_baji', hairStyle: 'short', acc: 'gat', beard: 'goatee', color: 5, skin: 4 });
    add('mix:casual', { outfit: 'casual', hairStyle: 'curly', acc: 'cap', glasses: 'sunglasses', hair: 9, color: 14 });
    add('mix:dress', { outfit: 'dress', hairStyle: 'long', acc: 'tiara', eyes: 'big', mouth: 'grin', color: 16 });

    const fnv = d => { let x = 0x811c9dc5; for (let i = 0; i < d.length; i++) { x ^= d[i]; x = Math.imul(x, 0x01000193) >>> 0; } return x.toString(16).padStart(8, '0'); };
    const hashes = {};
    for (const [key, av, all] of list) {
      const s = A.getSprite(av);
      for (const f of all ? A.FRAMES : ['idle']) {
        const c = s[f]; hashes[key + '@' + f] = fnv(c.getContext('2d').getImageData(0, 0, c.width, c.height).data);
      }
    }
    // contact sheet (idle frames, 3×) for humans
    const cols = 16, sc = 3, cw = A.SPRITE_W * sc + 6, ch = A.SPRITE_H * sc + 6;
    const sheet = document.createElement('canvas'); sheet.width = cols * cw; sheet.height = Math.ceil(list.length / cols) * ch;
    const g = sheet.getContext('2d'); g.imageSmoothingEnabled = false; g.fillStyle = '#e9f3e0'; g.fillRect(0, 0, sheet.width, sheet.height);
    list.forEach(([, av], i) => g.drawImage(A.getSprite(av).idle, (i % cols) * cw + 3, Math.floor(i / cols) * ch + 3, A.SPRITE_W * sc, A.SPRITE_H * sc));
    return { hashes, frames: A.FRAMES, n: list.length, sheet: sheet.toDataURL('image/png').split(',')[1] };
  });

  fs.writeFileSync(h.file('sheet.png'), Buffer.from(res.sheet, 'base64'));
  const file = path.join(h.golden, 'sprites.json');
  const keys = Object.keys(res.hashes);
  h.check(`rendered ${res.n} avatars → ${keys.length} sprite frames`, keys.length > 300, keys.length);

  if (h.update || !fs.existsSync(file)) {
    fs.mkdirSync(h.golden, { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ about: 'FNV-1a of RGBA pixels per avatar option × frame. Regenerate: npm run golden:update', frames: res.frames, hashes: res.hashes }, null, 1) + '\n');
    fs.writeFileSync(path.join(h.golden, 'sprites.png'), Buffer.from(res.sheet, 'base64'));
    h.check('golden baseline written (tests/golden/sprites.json)', true, `${keys.length} frames`);
    return;
  }
  const want = JSON.parse(fs.readFileSync(file, 'utf8')).hashes;
  const changed = keys.filter(k => k in want && want[k] !== res.hashes[k]);
  const gone = Object.keys(want).filter(k => !(k in res.hashes));
  const added = keys.filter(k => !(k in want));
  h.check('no existing sprite changed', changed.length === 0, `${changed.length} changed: ${changed.slice(0, 12).join(', ')} — compare tests/.out/golden-sprites/sheet.png with tests/golden/sprites.png`);
  h.check('no sprite option disappeared', gone.length === 0, gone.slice(0, 12).join(', '));
  if (added.length) h.log(`${added.length} new sprite frames not in the baseline yet (e.g. ${added.slice(0, 4).join(', ')}) → npm run golden:update`);
};

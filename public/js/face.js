// ============================================================
//  On-device photo analysis → avatar features
//  Uses face-api (TensorFlow.js, runs in the browser; nothing is uploaded).
//  Landmarks + expression give face shape / eyes / mouth;
//  pixel statistics around the landmarks give hair silhouette, beard, glasses, clothes.
// ============================================================
import { hexToRgb, rgbToHex, rgbToHsl, dist, tidy, SKIN, HAIR, nearest } from './avatar.js';

const BASE = new URL('./vendor/face-api/', import.meta.url).href;
let loading = null;

export function preloadFace() {
  if (!loading) {
    loading = (async () => {
      const faceapi = await import('./vendor/face-api/face-api.esm.js');
      let ok = false;
      try { ok = await faceapi.tf.setBackend('webgl'); } catch { ok = false; }
      if (!ok) await faceapi.tf.setBackend('cpu');      // phones without WebGL: slower but works
      await faceapi.tf.ready();
      const M = BASE + 'model';
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(M),
        faceapi.nets.faceLandmark68Net.loadFromUri(M),
        faceapi.nets.faceExpressionNet.loadFromUri(M),
        // gender (v3.3): optional — if this one model fails to load, the analysis still runs, just without it
        faceapi.nets.ageGenderNet.loadFromUri(M).catch(e => console.warn('gender model', e)),
      ]);
      return faceapi;
    })();
    loading.catch(() => { loading = null; });
  }
  return loading;
}

const lum = ([r, g, b]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
const med = a => { if (!a.length) return 0; a.sort((p, q) => p - q); return a[Math.floor(a.length / 2)]; };

/**
 * canvas: square photo (any size, unmirrored). Returns
 * { ok, patch, tags:[{ko,en}], points:[{x,y}] (0..1), box }
 */
export async function analyzePhoto(canvas, { timeoutMs = 15000, debugMask = false } = {}) {
  let timer;
  const faceapi = await Promise.race([preloadFace(), new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('model timeout')), timeoutMs); })])
    .finally(() => clearTimeout(timer));
  let q = faceapi.detectSingleFace(canvas, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.35 }))
    .withFaceLandmarks().withFaceExpressions();
  if (faceapi.nets.ageGenderNet.isLoaded) q = q.withAgeAndGender();
  const det = await q;
  if (!det) return { ok: false };
  const P = det.landmarks.positions.map(p => ({ x: p.x, y: p.y }));
  const W = canvas.width, H = canvas.height;
  const img = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data;
  const at = (x, y) => { x = Math.max(0, Math.min(W - 1, Math.round(x))); y = Math.max(0, Math.min(H - 1, Math.round(y))); const i = (y * W + x) * 4; return [img[i], img[i + 1], img[i + 2]]; };
  const region = (x0, y0, x1, y1, fn) => {
    x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(W - 1, x1); y1 = Math.min(H - 1, y1);
    const step = Math.max(1, Math.round(Math.min(x1 - x0, y1 - y0) / 14));
    for (let y = y0; y <= y1; y += step) for (let x = x0; x <= x1; x += step) fn(at(x, y), x, y);
  };
  const medianRGB = (x0, y0, x1, y1) => { const R = [], G = [], B = []; region(x0, y0, x1, y1, ([r, g, b]) => { R.push(r); G.push(g); B.push(b); }); return [med(R), med(G), med(B)]; };
  const avgL = (x0, y0, x1, y1) => { const L = []; region(x0, y0, x1, y1, c => L.push(lum(c))); return med(L); };

  // ---- geometry ----
  const faceW = P[16].x - P[0].x;
  const browY = Math.min(...P.slice(17, 27).map(p => p.y));
  const chinY = P[8].y, faceH = chinY - browY;
  const cx = (P[0].x + P[16].x) / 2;
  const eyeY = P.slice(36, 48).reduce((s, p) => s + p.y, 0) / 12;
  const u = faceW;                                  // unit

  // ---- skin ----
  const cheekY = (P[29].y + P[30].y) / 2, cr = 0.06 * u;
  const lc = { x: (P[2].x + P[31].x) / 2, y: cheekY }, rc = { x: (P[14].x + P[35].x) / 2, y: cheekY };
  const skinA = medianRGB(lc.x - cr, lc.y - cr, lc.x + cr, lc.y + cr), skinB = medianRGB(rc.x - cr, rc.y - cr, rc.x + cr, rc.y + cr);
  const skinRGB = lum(skinA) > lum(skinB) ? skinA : skinB;     // the better-lit cheek
  const Lskin = lum(skinRGB);
  // skin model: several face-interior clusters (lit / shaded / blush)
  const skinPts = [];
  const pushSkin = (x0, y0, x1, y1) => region(x0, y0, x1, y1, c => skinPts.push(c));
  pushSkin(lc.x - cr, lc.y - cr, lc.x + cr, lc.y + cr); pushSkin(rc.x - cr, rc.y - cr, rc.x + cr, rc.y + cr);
  pushSkin(P[30].x - 0.05 * u, P[28].y, P[30].x + 0.05 * u, P[30].y);                      // nose bridge
  pushSkin(P[6].x, P[57].y, P[10].x, P[8].y - 0.02 * u);                                       // chin
  pushSkin(cx - 0.12 * u, browY - 0.12 * faceH, cx + 0.12 * u, browY - 0.02 * faceH);          // lower forehead
  const skinCs = [skinRGB, ...kmeans(skinPts, 3).filter(k => k.n / skinPts.length > 0.15).map(k => k.c)];
  // avatar skin (v3.3): both cheeks pooled, shadows / highlights dropped, then corrected for the light of the whole photo
  const cheek = [];
  const pushCheek = (x0, y0, x1, y1) => region(x0, y0, x1, y1, c => cheek.push(c));
  const cr2 = 0.085 * u;
  pushCheek(lc.x - cr2, lc.y - cr2, lc.x + cr2, lc.y + cr2); pushCheek(rc.x - cr2, rc.y - cr2, rc.x + cr2, rc.y + cr2);
  const light = sceneLight(img, W, H);
  const skinSample = cleanSkin(cheek, skinRGB);
  const skinTrue = light.fix(skinSample);
  const dSkin = c => Math.min(...skinCs.map(k => dist(c, k)));

  // ---- background: top corners (selfie framing keeps them clear of the head) ----
  const e = Math.round(W * 0.07);
  let bg = [medianRGB(0, 0, e, e), medianRGB(W - e, 0, W - 1, e)];

  // ---- hair color model: cluster the ring of pixels around the face ----
  const ring = [];
  const pushRing = (x0, y0, x1, y1) => region(x0, y0, x1, y1, c => { if (dSkin(c) > 50) ring.push(c); });
  pushRing(cx - 0.35 * u, browY - 0.7 * faceH, cx + 0.35 * u, browY - 0.22 * faceH);            // above forehead
  pushRing(P[0].x - 0.22 * u, browY - 0.2 * faceH, P[0].x - 0.03 * u, eyeY + 0.1 * faceH);     // left temple
  pushRing(P[16].x + 0.03 * u, browY - 0.2 * faceH, P[16].x + 0.22 * u, eyeY + 0.1 * faceH);   // right temple
  const topSkinFrac = (() => { let n = 0, s2 = 0; region(cx - 0.25 * u, browY - 0.6 * faceH, cx + 0.25 * u, browY - 0.3 * faceH, c => { n++; if (dist(c, skinRGB) < 55) s2++; }); return n ? s2 / n : 0; })();
  const bald = topSkinFrac > 0.7 && browY - 0.6 * faceH > 0;
  let hairCs = kmeans(ring, 3).filter(k => k.n / Math.max(1, ring.length) > 0.12 && Math.min(...bg.map(b2 => dist(k.c, b2))) > 55).slice(0, 2).map(k => k.c);
  if (!hairCs.length) { const ks = kmeans(ring, 3); if (ks.length) hairCs = [ks.slice().sort((p1, p2) => lum(p1.c) - lum(p2.c))[0].c]; }
  if (!hairCs.length) hairCs = [[40, 32, 30]];
  // drop any background sample that looks like hair (big hair touching the corners)
  bg = bg.filter(b2 => Math.min(...hairCs.map(h => dist(h, b2))) > 45);
  let hairRGB = hairCs[0];

  const isHair = rgb => {
    const dh = Math.min(...hairCs.map(h => dist(rgb, h))); if (dh > 150) return false;
    const db = bg.length ? Math.min(...bg.map(b2 => dist(rgb, b2))) : 999;
    return dh < db && dh < dSkin(rgb) * 0.85;
  };
  const frac = (x0, y0, x1, y1) => { let n = 0, h = 0; region(x0, y0, x1, y1, c => { n++; if (isHair(c)) h++; }); return n ? h / n : 0; };

  const hp = { t: 1, l: 1, b: 'spiky', c: 0, k: 'none' };
  const tags = [];
  if (bald) { hp.t = -1; hp.l = 0; hp.b = 'none'; tags.push({ ko: '시원한 헤어', en: 'Shaved / bald' }); }
  else {
    // top volume
    const stepY = faceH * 0.04;
    let topRow = browY - 0.3 * faceH, miss = 0;
    for (let y = browY - 0.3 * faceH; y > 0; y -= stepY) {
      if (frac(cx - 0.25 * u, y - stepY / 2, cx + 0.25 * u, y + stepY / 2) > 0.45) { topRow = y; miss = 0; } else if (++miss > 1) break;
    }
    const topExt = (browY - topRow) / faceH;
    hp.t = topRow > stepY && topExt > 0.85 ? 2 : 1;

    // length (sides)
    const sideLow = (x0, x1) => {
      let last = null, gap = 0;
      for (let y = eyeY; y < Math.min(H, chinY + 1.7 * faceH); y += faceH * 0.05) {
        if (frac(x0, y, x1, y + faceH * 0.05) > 0.35) { last = y; gap = 0; }
        else if (last !== null && ++gap > 3) break;
        else if (last === null && y > chinY + 0.6 * faceH) break;
      }
      return last;
    };
    const lows = [sideLow(P[0].x - 0.36 * u, P[0].x - 0.04 * u), sideLow(P[16].x + 0.04 * u, P[16].x + 0.36 * u)].filter(v => v !== null);
    if (!lows.length) hp.l = 1;
    else { const rel = (Math.max(...lows) - eyeY) / faceH; hp.l = rel < 0.5 ? 1 : rel < 0.95 ? 2 : rel < 1.45 ? 3 : 4; }

    // bangs
    const fy0 = browY - 0.32 * faceH, fy1 = browY - 0.06 * faceH;
    const bx0 = P[17].x, bx1 = P[26].x, third = (bx1 - bx0) / 3;
    const fl = frac(bx0, fy0, bx0 + third, fy1), fc = frac(bx0 + third, fy0, bx0 + 2 * third, fy1), fr = frac(bx0 + 2 * third, fy0, bx1, fy1);
    hp.b = (fl < 0.2 && fc < 0.2 && fr < 0.2) ? 'none'
      : (fl > 0.55 && fc > 0.55 && fr > 0.55) ? 'full'
      : (fl > 0.45 && fr < 0.3) ? 'left'
      : (fr > 0.45 && fl < 0.3) ? 'right'
      : (fc < 0.3 && (fl > 0.3 || fr > 0.3)) ? 'center' : 'spiky';

    // volume / curls: how far hair spreads beyond the face at temple height
    const vy = eyeY - 0.1 * faceH;
    const spread = (dir) => { let far = 0; for (let k = 0.05; k < 0.7; k += 0.05) { const x = dir < 0 ? P[0].x - k * u : P[16].x + k * u; if (frac(x - 0.03 * u, vy - 0.05 * faceH, x + 0.03 * u, vy + 0.05 * faceH) > 0.5) far = k; } return far; };
    const vol = (spread(-1) + spread(1)) / 2;
    hp.c = vol > 0.5 && hp.l >= 2 ? 1 : 0;
    if (hp.c) tags.push({ ko: '풍성한 볼륨/웨이브', en: 'Voluminous / wavy' });
    tags.push({ ko: ['짧은 머리', '귀 길이 머리', '단발', '어깨 길이', '긴 머리'][hp.l], en: ['Very short', 'Short', 'Bob length', 'Shoulder length', 'Long'][hp.l] });
    tags.push({ ko: { none: '이마 오픈', full: '일자 앞머리', left: '왼쪽 앞머리', right: '오른쪽 앞머리', center: '가르마', spiky: '내린 앞머리' }[hp.b], en: { none: 'Forehead open', full: 'Straight bangs', left: 'Side-swept bangs', right: 'Side-swept bangs', center: 'Middle part', spiky: 'Textured bangs' }[hp.b] });
  }

  // ---- face shape ----
  const ratio = faceW / faceH, jaw = Math.hypot(P[12].x - P[4].x, P[12].y - P[4].y) / faceW;
  const face = jaw > 0.9 ? 'square' : ratio > 1.0 ? 'round' : 'oval';
  tags.push({ ko: { square: '각진 얼굴', oval: '갸름한 얼굴', round: '동그란 얼굴' }[face], en: { square: 'Square face', oval: 'Oval face', round: 'Round face' }[face] });

  // ---- eyes / mouth (expression) ----
  const ex = det.expressions;
  const ear = (a, b, c, d, e1, f) => (Math.hypot(P[b].x - P[f].x, P[b].y - P[f].y) + Math.hypot(P[c].x - P[e1].x, P[c].y - P[e1].y)) / (2 * Math.hypot(P[a].x - P[d].x, P[a].y - P[d].y));
  const EAR = (ear(36, 37, 38, 39, 40, 41) + ear(42, 43, 44, 45, 46, 47)) / 2;
  const eyes = ex.happy > 0.6 && EAR < 0.27 ? 'smile' : EAR > 0.36 ? 'big' : EAR < 0.23 ? 'narrow' : EAR < 0.27 ? 'calm' : 'round';
  const mouthOpen = Math.hypot(P[62].x - P[66].x, P[62].y - P[66].y) / Math.hypot(P[48].x - P[54].x, P[48].y - P[54].y);
  const mouth = ex.surprised > 0.5 ? 'open' : ex.happy > 0.5 ? (mouthOpen > 0.1 ? 'grin' : 'smile') : 'small';
  if (ex.happy > 0.5) tags.push({ ko: '활짝 웃는 얼굴', en: 'Big smile' });

  // ---- brows ----
  const browL = avgL(P[18].x, P[19].y - 0.03 * u, P[20].x, P[19].y + 0.03 * u), browR = avgL(P[23].x, P[24].y - 0.03 * u, P[25].x, P[24].y + 0.03 * u);
  const brows = 1 - Math.min(browL, browR) / Math.max(0.05, Lskin) > 0.42 ? 'thick' : 'thin';

  // ---- beard ----
  const Lm = avgL(P[49].x, P[33].y + (P[51].y - P[33].y) * 0.35, P[53].x, P[51].y - 0.01 * u);
  const Lch = avgL(P[7].x, P[57].y + (P[8].y - P[57].y) * 0.3, P[9].x, P[8].y - (P[8].y - P[57].y) * 0.15);
  const Lj = (avgL(P[4].x + 0.04 * u, P[4].y, P[4].x + 0.12 * u, P[5].y) + avgL(P[12].x - 0.12 * u, P[12].y, P[12].x - 0.04 * u, P[11].y)) / 2;
  const rm = Lm / Lskin, rcn = Lch / Lskin, rj = Lj / Lskin;
  const chinRGB = medianRGB(P[7].x, P[57].y + (P[8].y - P[57].y) * 0.3, P[9].x, P[8].y - (P[8].y - P[57].y) * 0.15);
  const mustRGB = medianRGB(P[49].x, P[33].y + (P[51].y - P[33].y) * 0.35, P[53].x, P[51].y - 0.01 * u);
  const hairy = c => dSkin(c) > 70 && Math.min(...hairCs.map(h => dist(c, h))) < dist(c, skinRGB);
  const chinHair = rcn < 0.55 && hairy(chinRGB), mustHair = rm < 0.5 && hairy(mustRGB);
  const beard = chinHair && rj < 0.62 ? 'full' : chinHair && mustHair ? 'goatee' : mustHair ? 'mustache' : 'none';
  if (beard !== 'none') tags.push({ ko: '수염', en: 'Facial hair' });

  // ---- glasses ----
  const gap = P[42].x - P[39].x;
  const Lbridge = avgL(P[39].x + gap * 0.3, P[27].y - 0.02 * u, P[42].x - gap * 0.3, P[28].y);
  const Lnose = avgL(P[29].x - 0.03 * u, P[29].y, P[29].x + 0.03 * u, P[30].y);
  const Leye = avgL(P[36].x, eyeY - 0.04 * u, P[45].x, eyeY + 0.04 * u);
  const Lrim = avgL(P[36].x, eyeY + 0.09 * u, P[39].x, eyeY + 0.12 * u);
  const glasses = Leye < 0.28 * Lskin ? 'sunglasses' : (Lbridge < 0.62 * Lnose && Lrim < 0.75 * Lskin) ? 'glasses' : 'none';
  if (glasses !== 'none') tags.push({ ko: glasses === 'sunglasses' ? '선글라스' : '안경', en: glasses === 'sunglasses' ? 'Sunglasses' : 'Glasses' });

  // ---- clothes ----
  const patch = {
    skin: skinTone(skinTrue), hair: bald ? 1 : tidy(blendHair(hairRGB), 'hair'), hairStyle: 'photo', hp,
    face, eyes, brows, mouth, beard, glasses,
  };
  const cy0 = chinY + 0.45 * faceH, cy1 = Math.min(H - 2, chinY + 1.3 * faceH);
  if (cy1 - cy0 > faceH * 0.2) {
    const px = [];
    region(cx - 0.85 * u, cy0, cx + 0.85 * u, cy1, c => { if (dist(c, skinRGB) > 60 && Math.min(...bg.map(b => dist(c, b))) > 45) px.push(c); });
    const clusters = kmeans(px, 3);
    if (clusters.length) {
      patch.color = tidy(rgbToHex(clusters[0].c), 'cloth');
      if (clusters[1] && clusters[1].n / px.length > 0.18 && dist(clusters[1].c, clusters[0].c) > 120) patch.color2 = tidy(rgbToHex(clusters[1].c), 'cloth');
    }
    let skinN = 0, n = 0; region(cx - 0.2 * u, chinY + 0.3 * faceH, cx + 0.2 * u, chinY + 0.7 * faceH, c => { n++; if (dist(c, skinRGB) < 55) skinN++; });
    const Lcenter = avgL(cx - 0.1 * u, cy0, cx + 0.1 * u, cy1), Lsides = (avgL(cx - 0.75 * u, cy0, cx - 0.45 * u, cy1) + avgL(cx + 0.45 * u, cy0, cx + 0.75 * u, cy1)) / 2;
    if (Lcenter > 0.62 && Lsides < 0.38) { patch.outfit = 'suit'; patch.color = tidy(rgbToHex(medianRGB(cx - 0.75 * u, cy0, cx - 0.45 * u, cy1)), 'cloth'); delete patch.color2; tags.push({ ko: '정장 스타일', en: 'Suit style' }); }
    else if (n && skinN / n > 0.45) patch.outfit = 'dress';
    else patch.outfit = 'casual';
  }

  // gender (v3.3): the photo heuristics alone (hair length, neckline) often read a woman with tied-back hair as a man
  // and the reverse. With the model's answer the whole look is made consistent; below 0.8 it is not trusted.
  const gender = det.gender && det.genderProbability >= GENDER_MIN ? det.gender : null;
  genderize(patch, gender);
  if (gender) tags.push({ ko: gender === 'male' ? '남성 스타일' : '여성 스타일', en: gender === 'male' ? 'Masculine look' : 'Feminine look' });

  let mask = null;
  if (debugMask) {
    mask = document.createElement('canvas'); mask.width = W; mask.height = H; const mg = mask.getContext('2d');
    for (let y = 0; y < H; y += 3) for (let x = 0; x < W; x += 3) if (isHair(at(x, y))) { mg.fillStyle = 'rgba(255,0,200,.55)'; mg.fillRect(x, y, 3, 3); }
  }
  const s = W;
  return { mask,
    ok: true, patch, tags,
    points: P.map(p => ({ x: p.x / s, y: p.y / s })),
    box: { x: det.detection.box.x / s, y: det.detection.box.y / s, w: det.detection.box.width / s, h: det.detection.box.height / s },
    gender, genderP: det.genderProbability ?? null,
    debug: { ratio, jaw, EAR, mouthOpen, rm, rcn, rj, Lbridge: Lbridge / Lnose, Leye: Leye / Lskin, happy: ex.happy,
      skinSample, skinTrue, gain: light.gain, expo: light.expo },
  };
}

// ---------- skin colour (v3.3) ----------
// Before: a dim cheek (L < 0.45) was brightened by up to 35 % — which also turned genuinely dark skin light — and the
// raw camera colour (orange under warm bulbs, blue under LEDs) was blended 50 % into the avatar.
// Now: the light of the WHOLE photo is estimated (grey-world + brightest pixels → white balance; the bright end of the
// frame → exposure), so a dark-skinned guest in a normally lit photo stays dark and an under-exposed photo is lifted
// whatever the skin. The palette step is picked by lightness only (a phone photo's hue is unreliable, its lightness is not).
export function sceneLight(img, W, H) {
  const L = [], R = [], G = [], B = [], all = [];
  const step = Math.max(1, Math.floor(Math.min(W, H) / 90));
  for (let y = 0; y < H; y += step) for (let x = 0; x < W; x += step) {
    const i = (y * W + x) * 4, r = img[i], g = img[i + 1], b = img[i + 2];
    all.push(lum([r, g, b]));                                            // exposure looks at every pixel (a blown-out window counts as bright)
    if (Math.max(r, g, b) > 250 || r + g + b < 30) continue;          // white balance: clipped or black pixels say nothing about the light's colour
    R.push(r); G.push(g); B.push(b); L.push(lum([r, g, b]));
  }
  if (L.length < 50) return { gain: [1, 1, 1], expo: 1, fix: c => c.slice() };
  const mean = a => a.reduce((s2, v) => s2 + v, 0) / a.length;
  const gw = [mean(R), mean(G), mean(B)];
  const order = L.map((v, i) => i).sort((a, b) => L[b] - L[a]), top = order.slice(0, Math.max(10, Math.floor(order.length * 0.05)));
  const wp = [mean(top.map(i => R[i])), mean(top.map(i => G[i])), mean(top.map(i => B[i]))];
  const norm = c => { const m = (c[0] + c[1] + c[2]) / 3 || 1; return c.map(v => v / m); };
  const ill = norm(norm(gw).map((v, i) => (v + norm(wp)[i]) / 2));
  const gain = ill.map(v => Math.min(1.3, Math.max(0.77, 1 / v)));
  all.sort((a, b) => b - a);
  const p90 = all[Math.floor(all.length * 0.1)];
  const expo = Math.min(1.9, Math.max(1, 0.8 / Math.max(0.05, p90)));     // only lift under-exposed photos, never darken
  return { gain, expo, fix: c => c.map((v, i) => Math.min(255, v * gain[i] * expo)) };
}
/** median of the cheek pixels without shadows (beard, jaw line) and specular highlights */
export function cleanSkin(px, fallback) {
  if (px.length < 12) return fallback.slice();
  const Ls = px.map(lum).sort((a, b) => a - b), mL = Ls[Math.floor(Ls.length / 2)];
  const keep = px.filter(c => { const l = lum(c); return l > mL * 0.72 && l < Math.min(0.97, mL * 1.3); });
  const use = keep.length >= 8 ? keep : px;
  return [0, 1, 2].map(k => med(use.map(c => c[k])));
}
const SKIN_L = SKIN.map(h => lum(hexToRgb(h)));
/** corrected cheek colour → avatar skin: the palette step closest in lightness, with a little of the person's own tint */
export function skinTone(rgb) {
  const L = Math.min(0.95, lum(rgb) * 1.08 + 0.02);                     // photos of skin read a touch darker than the pixel-art ramp
  let best = 0; SKIN_L.forEach((v, i) => { if (Math.abs(v - L) < Math.abs(SKIN_L[best] - L)) best = i; });
  const p = hexToRgb(SKIN[best]);
  const own = rgb.map(v => v * (lum(p) / Math.max(0.05, lum(rgb))));   // the photo's tint at the palette's lightness
  return tidy(rgbToHex(p.map((v, i) => v * 0.8 + own[i] * 0.2)), 'skin');
}
export const skinIndex = hex => { const L = lum(hexToRgb(hex)); let b = 0; SKIN_L.forEach((v, i) => { if (Math.abs(v - L) < Math.abs(SKIN_L[b] - L)) b = i; }); return b; };

// ---------- gender → a consistent look (v3.3) ----------
export const GENDER_MIN = 0.8;
const FEM_ACC = ['flower', 'ribbon', 'tiara', 'flowercrown', 'pearls'], MASC_ACC = ['bowtie', 'gat'];
/**
 * Make an avatar patch read as the given gender ('male' | 'female' | null = unknown, left alone).
 * female: dress (photo colours kept), no beard, short / tied-back hair becomes a bun; male: suit or casual, hair at most
 * bob length (long "hair" on a man is almost always a dark background), no bun/ponytail, no feminine accessory.
 */
export function genderize(a, gender) {
  if (gender !== 'male' && gender !== 'female') return a;
  const hp = a.hairStyle === 'photo' && a.hp ? a.hp : null;
  if (gender === 'female') {
    a.outfit = a.outfit === 'hanbok_baji' ? 'hanbok_chima' : 'dress';
    a.beard = 'none';
    if (hp) { if (hp.t < 0) hp.t = 1; if (hp.l <= 1 && hp.k === 'none') hp.k = 'bun'; if (hp.l < 1) hp.l = 1; }
    if (MASC_ACC.includes(a.acc)) a.acc = 'none';
  } else {
    if (a.outfit === 'dress') a.outfit = 'casual';
    else if (a.outfit === 'hanbok_chima') a.outfit = 'hanbok_baji';
    else if (!a.outfit) a.outfit = 'suit';
    if (hp) { hp.l = Math.min(hp.l, 2); hp.k = 'none'; hp.c = hp.l >= 2 ? hp.c : 0; }
    if (FEM_ACC.includes(a.acc)) a.acc = 'none';
  }
  return a;
}

function blendHair(rgb) {
  const p = hexToRgb(HAIR[nearest(rgb, HAIR.slice(0, 12))]);        // pull toward natural hair tones
  return rgbToHex(rgb.map((v, i) => v * 0.45 + p[i] * 0.55));
}

function kmeans(pts, k) {
  if (pts.length < 8) return [];
  let cs = Array.from({ length: k }, (_, i) => pts[Math.floor((i + 0.5) * pts.length / k)].slice());
  let assign = new Array(pts.length).fill(0);
  for (let it = 0; it < 8; it++) {
    pts.forEach((p, i) => { let b = 0, bd = Infinity; cs.forEach((c, j) => { const d = dist(p, c); if (d < bd) { bd = d; b = j; } }); assign[i] = b; });
    cs = cs.map((c, j) => { const m = pts.filter((_, i) => assign[i] === j); if (!m.length) return c; return [0, 1, 2].map(t => m.reduce((s, p) => s + p[t], 0) / m.length); });
  }
  return cs.map((c, j) => ({ c, n: assign.filter(a => a === j).length })).filter(o => o.n).sort((a, b) => b.n - a.n);
}

export { SKIN, nearest, rgbToHsl, hexToRgb };

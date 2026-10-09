// ============================================================
//  Pixel avatar engine v2
//  - 20x32 chibi sprite (22x34 with outline), Stardew-like proportions on 16px tiles
//  - Face: shape / eyes / brows / mouth / beard / glasses
//  - Hair: presets OR photo-derived parameters (hp) → every guest gets a unique silhouette
//  - Frames: idle, blink, walk1, walk2, back, back1, back2, up (cheer), wave, eat
// ============================================================

export const SKIN = ['#ffe6d6', '#fbd8bf', '#f3c6a2', '#e8b48c', '#d79f76', '#c4895f', '#a9714a', '#8c5a37', '#6e4328', '#4f2f1c'];
export const HAIR = ['#1c1a22', '#2e2425', '#4a3226', '#6b4530', '#8e5c38', '#b07a45', '#d2a35e', '#ead08a', '#a8432f', '#c9663a', '#8f8f99', '#dcdad4', '#e977a9', '#5f86e6', '#8a63d9', '#4aa58a',
  // v4.1 (2026-10): more natural and dyed tones — appended so stored indexes keep their colour
  '#3a2c34', '#5c4a3f', '#9a7b5f', '#c2b8a8', '#f0e4c0', '#6e2b33', '#b65a7a', '#2f4f7a'];
export const COLORS = ['#23232f', '#34405e', '#8a8f9c', '#f4f1ea', '#d9c4a3', '#8b5a3c', '#c8433f', '#ef8f6b',
  '#f3c34f', '#7cbf5f', '#3f8f6e', '#6fc3d6', '#4f6fd1', '#8a63c9', '#e98ab4', '#f7d6e0', '#7a2f45', '#c9b27a',
  // v4.1: hanbok pastels and deep tones (appended — stored indexes keep their colour)
  '#1f3d33', '#b9a7e3', '#f4b183', '#a9d8b8', '#5b3a2b', '#ffd6a5', '#9fb7e8', '#d8536b'];
const PAIR = [6, 14, 1, 1, 5, 4, 1, 12, 6, 6, 14, 14, 7, 8, 1, 13, 4, 1, 21, 4, 1, 16, 22, 6, 1, 18];

export const HAIR_PRESETS = {
  short:    { t: 1, l: 1, b: 'spiky', c: 0, k: 'none' },
  sidepart: { t: 1, l: 1, b: 'left', c: 0, k: 'none' },
  pomp:     { t: 2, l: 1, b: 'none', c: 0, k: 'none' },
  buzz:     { t: 0, l: 0, b: 'none', c: 0, k: 'none' },
  bob:      { t: 1, l: 2, b: 'full', c: 0, k: 'none' },
  long:     { t: 1, l: 4, b: 'center', c: 0, k: 'none' },
  wavy:     { t: 1, l: 3, b: 'left', c: 1, k: 'none' },
  curly:    { t: 2, l: 2, b: 'spiky', c: 1, k: 'none' },
  ponytail: { t: 1, l: 1, b: 'right', c: 0, k: 'pony' },
  bun:      { t: 1, l: 1, b: 'center', c: 0, k: 'bun' },
  twin:     { t: 1, l: 2, b: 'full', c: 0, k: 'twin' },
  bald:     { t: -1, l: 0, b: 'none', c: 0, k: 'none' },
  // v4.1 (2026-10): more looks — appended
  twoblock: { t: 2, l: 0, b: 'comma', c: 0, k: 'none' },
  comma:    { t: 1, l: 1, b: 'comma', c: 0, k: 'none' },
  curtain:  { t: 1, l: 1, b: 'curtain', c: 0, k: 'none' },
  slick:    { t: 1, l: 0, b: 'none', c: 0, k: 'none' },
  topknot:  { t: 1, l: 0, b: 'none', c: 0, k: 'topknot' },
  pixie:    { t: 1, l: 0, b: 'side', c: 0, k: 'none' },
  hime:     { t: 1, l: 3, b: 'full', c: 0, k: 'none' },
  longcurtain: { t: 1, l: 4, b: 'curtain', c: 0, k: 'none' },
  longwavy: { t: 1, l: 4, b: 'center', c: 1, k: 'none' },
  braid:    { t: 1, l: 2, b: 'center', c: 0, k: 'braid' },
  sidepony: { t: 1, l: 1, b: 'side', c: 0, k: 'side' },
  spacebuns: { t: 1, l: 1, b: 'full', c: 0, k: 'buns' },
  chignon:  { t: 1, l: 1, b: 'center', c: 0, k: 'chignon' },
  afro:     { t: 2, l: 3, b: 'none', c: 1, k: 'none' },
};
export const HAIR_STYLES = Object.keys(HAIR_PRESETS);
export const BANGS = ['none', 'full', 'left', 'right', 'center', 'spiky', 'curtain', 'comma', 'side'];
export const FACES = ['round', 'oval', 'square', 'heart', 'wide'];
export const EYES = ['round', 'big', 'narrow', 'smile', 'calm', 'sparkle', 'sleepy', 'wink', 'dot', 'lash'];
export const BROWS = ['thin', 'thick', 'arched', 'straight'];
export const MOUTHS = ['smile', 'grin', 'small', 'open', 'cat', 'tongue', 'lips', 'smirk'];
export const BEARDS = ['none', 'stubble', 'mustache', 'goatee', 'full', 'chinstrap'];
export const GLASSES = ['none', 'glasses', 'round', 'sunglasses', 'square', 'rimless', 'heart'];
export const OUTFITS = ['suit', 'dress', 'hanbok_chima', 'hanbok_baji', 'casual',
  'vest', 'cardigan', 'hoodie', 'overalls', 'blouse', 'longdress', 'aline', 'aloha', 'durumagi', 'dangui', 'jumpsuit', 'trench'];
export const ACCESSORIES = ['none', 'flower', 'ribbon', 'bowtie', 'tiara', 'gat', 'cap',
  'beret', 'bucket', 'beanie', 'headband', 'flowercrown', 'sunhat', 'earrings', 'pearls', 'scarf', 'lei', 'catears', 'binyeo'];
export const HAIR_EXTRAS = ['none', 'bun', 'pony', 'twin', 'braid', 'side', 'buns', 'topknot', 'chignon'];
const COUPLE_ACC = ['boutonniere', 'veil'];
export const FRAMES = ['idle', 'blink', 'walk1', 'walk2', 'back', 'back1', 'back2', 'up', 'wave', 'eat'];

export const SPRITE_W = 22, SPRITE_H = 34;
const GW = 20, GH = 32, YO = 2;               // inner grid + design-space y offset
const OUTLINE = '#2b2033';
const EYE = '#2b2033';

// ---------- color utils ----------
export function hexToRgb(h) { h = h.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
export function rgbToHex([r, g, b]) { return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join(''); }
export function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let h = 0, s = 0; const l = (mx + mn) / 2;
  if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6; }
  return [h, s, l];
}
export function hslToRgb([h, s, l]) {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = t => { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}
export function shade(hex, amt) {
  const [h, s, l] = rgbToHsl(hexToRgb(hex));
  const hs = amt < 0 ? h + 0.015 : h - 0.01;
  return rgbToHex(hslToRgb([(hs + 1) % 1, Math.min(1, s * (amt < 0 ? 1.08 : 0.95)), Math.max(0, Math.min(1, l + amt))]));
}
export function mix(a, b, t) { const A = hexToRgb(a), B = hexToRgb(b); return rgbToHex(A.map((v, i) => v + (B[i] - v) * t)); }
export function dist(a, b) {
  const rm = (a[0] + b[0]) / 2, dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
  return Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db);
}
export function nearest(rgb, palette, allowed) {
  let best = 0, bd = Infinity;
  palette.forEach((hex, i) => { if (allowed && !allowed.includes(i)) return; const d = dist(rgb, hexToRgb(hex)); if (d < bd) { bd = d; best = i; } });
  return best;
}
const isHex = v => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
const col = (v, pal, d) => isHex(v) ? v.toLowerCase() : (Number.isInteger(v) && pal[v]) ? pal[v] : pal[d];
/** keep photo-derived colors inside a pleasant pixel-art range */
export function tidy(hex, kind) {
  let [h, s, l] = rgbToHsl(hexToRgb(hex));
  if (kind === 'skin') { s = Math.min(0.62, Math.max(0.28, s)); l = Math.min(0.88, Math.max(0.3, l)); h = Math.min(0.11, Math.max(0.02, h > 0.5 ? 0.03 : h)); }
  else if (kind === 'hair') { s = Math.min(0.72, s); l = Math.min(0.86, Math.max(0.1, l)); }
  else { s = Math.min(0.78, s); l = Math.min(0.93, Math.max(0.13, l)); }
  return rgbToHex(hslToRgb([h, s, l]));
}

// ---------- sprite builder ----------
const FACE_ROWS = {
  round:  { 3: [6, 13], 4: [4, 15], 5: [3, 16], 12: [3, 16], 13: [4, 15], 14: [5, 14], 15: [7, 12] },
  oval:   { 3: [6, 13], 4: [5, 14], 5: [4, 15], 12: [4, 15], 13: [5, 14], 14: [6, 13], 15: [7, 12] },
  square: { 3: [5, 14], 4: [3, 16], 5: [3, 16], 13: [3, 16], 14: [4, 15], 15: [5, 14] },
  heart:  { 3: [5, 14], 4: [3, 16], 5: [3, 16], 11: [3, 16], 12: [4, 15], 13: [5, 14], 14: [6, 13], 15: [8, 11] },
  wide:   { 3: [5, 14], 4: [3, 16], 5: [2, 17], 12: [2, 17], 13: [3, 16], 14: [4, 15], 15: [6, 13] },
};
function faceSpan(shape, y) {
  const rows = FACE_ROWS[shape] || FACE_ROWS.round;
  if (rows[y]) return rows[y];
  // fill between defined rows with the nearest earlier definition
  let k = y; while (k > 3 && !rows[k]) k--; return rows[k];
}

function build(av, frame) {
  const g = Array.from({ length: GH }, () => new Array(GW).fill(null));
  const px = (x, y, c) => { y += YO; if (x >= 0 && x < GW && y >= 0 && y < GH && c) g[y][x] = c; };
  const clr = (x, y) => { y += YO; if (x >= 0 && x < GW && y >= 0 && y < GH) g[y][x] = null; };
  const r = (x, y, w, h, c) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) px(x + i, y + j, c); };

  const skin = col(av.skin, SKIN, 2), skinS = shade(skin, -0.08), skinH = shade(skin, 0.06);
  const hair = col(av.hair, HAIR, 0);
  const dark = rgbToHsl(hexToRgb(hair))[2] < 0.16;
  const hairS = shade(hair, dark ? 0.05 : -0.1), hairH = shade(hair, dark ? 0.16 : 0.12);
  const c = col(av.color, COLORS, 1), cS = shade(c, -0.12), cH = shade(c, 0.08);
  const c2 = isHex(av.color2) ? av.color2 : COLORS[PAIR[Number.isInteger(av.color) ? av.color : nearest(hexToRgb(c), COLORS)] ?? 6];
  const c2S = shade(c2, -0.12);
  const hp = resolveHair(av);
  const back = frame === 'back' || frame === 'back1' || frame === 'back2';
  const liftL = frame === 'walk1' || frame === 'back1', liftR = frame === 'walk2' || frame === 'back2';
  const walking = frame === 'walk1' || frame === 'walk2';
  const dx = walking ? 1 : 0;
  const pose = frame === 'up' ? 'up' : frame === 'wave' ? 'wave' : frame === 'eat' ? 'eat' : 'normal';
  const shape = FACES.includes(av.face) ? av.face : 'round';

  // ---- 1. back layer ----
  if (av.acc === 'veil') { r(1, 4, 18, 22, 'rgba(255,255,255,0.72)'); r(2, 26, 16, 1, 'rgba(255,255,255,0.5)'); }
  hairBack(hp, back);

  // ---- 2. legs / skirt / body ----
  const legs = (pant, shoe, x1 = 6, x2 = 11, w = 3, y0 = 24) => {
    r(x1, y0, w, (liftL ? 3 : 4) - (y0 - 24), pant); r(x2, y0, w, (liftR ? 3 : 4) - (y0 - 24), pant);
    r(x1, liftL ? 27 : 28, w, 1, shoe); r(x2, liftR ? 27 : 28, w, 1, shoe);
  };
  const skirtShoes = shoe => { if (!liftL) r(6, 28, 3, 1, shoe); if (!liftR) r(11, 28, 3, 1, shoe); };
  const white = '#f7f5f0';
  const blouseC = mix(c, '#ffffff', 0.78);
  const sleeve = { suit: c, dress: null, hanbok_chima: c, hanbok_baji: c, casual: c, vest: white, overalls: c2, blouse: blouseC, longdress: null }[av.outfit] ?? c;

  switch (av.outfit) {
    case 'dress':
      r(5, 17, 10, 4, c); r(14, 17, 1, 4, cS); r(5, 20, 10, 1, cH);
      r(4, 21, 12, 1, c); r(3, 22, 14, 2, c); r(2, 24, 16, 3, c); r(2, 27, 16, 1, cS);
      r(15, 22, 1, 2, cS); r(16, 24, 1, 3, cS); if (!back) { px(7, 23, cH); px(5, 25, cH); px(11, 24, cH); px(13, 26, cH); }
      skirtShoes(shade(c, -0.28));
      break;
    case 'hanbok_chima': {
      const rib = c2 === COLORS[6] ? COLORS[1] : COLORS[6];
      r(5, 17, 10, 3, c); r(14, 17, 1, 3, cS);
      r(5, 20, 10, 1, c2); r(4, 21, 12, 2, c2); r(3, 23, 14, 3, c2); r(2, 26, 16, 2, c2);
      [5, 8, 11, 14].forEach(x => r(x, 22, 1, 6, c2S)); r(17, 26, 1, 2, c2S);
      if (!back) { px(7, 17, white); px(8, 18, white); px(12, 17, white); px(11, 18, white); px(10, 19, rib); px(10, 20, rib); px(11, 21, rib); px(11, 22, rib); px(9, 20, rib); }
      skirtShoes('#f4f1ea');
      break;
    }
    case 'hanbok_baji':
      r(5, 17, 10, 6, c); r(14, 17, 1, 6, cS);
      if (!back) { px(7, 17, white); px(8, 18, white); px(12, 17, white); px(11, 18, white); px(10, 19, c2); px(10, 20, c2); px(11, 20, c2); px(11, 21, c2); }
      legs('#ece6d6', '#3b302c', 5, 11, 4, 23); r(5, liftL ? 26 : 27, 4, 1, '#c9bfa8'); r(11, liftR ? 26 : 27, 4, 1, '#c9bfa8');
      break;
    case 'casual':
      r(5, 17, 10, 6, c); r(14, 17, 1, 6, cS); if (!back) { r(8, 17, 4, 1, cS); px(7, 20, cH); }
      r(5, 23, 10, 1, '#4a6fa5'); legs('#4a6fa5', '#f3f1ec'); if (!back) { px(7, 25, '#5b80b6'); px(12, 24, '#5b80b6'); }
      if (!liftL) px(8, 28, c2); if (!liftR) px(13, 28, c2);
      break;
    // ---- v4.1 outfits ----
    case 'vest': {                                        // white shirt · waistcoat · slacks
      r(5, 17, 10, 6, c); r(14, 17, 1, 6, cS);
      if (!back) { r(9, 17, 2, 6, white); px(8, 17, white); px(11, 17, white); px(10, 18, c2); px(10, 19, c2); px(9, 20, c2); px(8, 19, cS); px(8, 21, cS); px(11, 19, cS); px(11, 21, cS); }
      else r(5, 17, 10, 1, white);
      r(5, 23, 10, 1, '#3b302c'); legs('#45404f', '#16141a');
      break;
    }
    case 'cardigan': {                                    // open cardigan over a white tee · jeans
      r(5, 17, 10, 6, c); r(14, 17, 1, 6, cS); r(5, 22, 10, 1, cS);
      if (!back) { r(8, 17, 4, 6, '#f4f1ea'); px(7, 18, cS); px(7, 20, cS); px(12, 18, cS); px(12, 20, cS); }
      r(5, 23, 10, 1, '#4a6fa5'); legs('#4a6fa5', '#f3f1ec');
      break;
    }
    case 'hoodie': {                                      // hoodie · pocket · joggers
      r(5, 17, 10, 6, c); r(14, 17, 1, 6, cS); r(5, 22, 10, 1, cS);
      if (!back) { px(7, 17, cS); px(12, 17, cS); px(8, 18, '#f4f1ea'); px(8, 19, '#f4f1ea'); px(11, 18, '#f4f1ea'); px(11, 19, '#f4f1ea'); r(7, 20, 6, 2, cS); r(8, 20, 4, 1, cH); }
      else { r(6, 17, 8, 3, cS); r(7, 20, 6, 1, cS); }
      r(5, 23, 10, 1, '#5a5560'); legs('#5a5560', '#f3f1ec');
      break;
    }
    case 'overalls': {                                    // shirt (colour 2) · denim-ish bib and trousers (colour 1)
      r(5, 17, 10, 6, c2); r(14, 17, 1, 6, c2S);
      r(7, 19, 6, 4, c); r(12, 19, 1, 4, cS); r(7, 17, 1, 2, c); r(12, 17, 1, 2, c);
      if (!back) { px(7, 19, '#f3c34f'); px(12, 19, '#f3c34f'); r(9, 20, 2, 1, cS); }
      r(5, 23, 10, 1, c); legs(c, '#3b302c'); if (!back) { px(7, 25, cS); px(12, 25, cS); }
      break;
    }
    case 'blouse': {                                      // light blouse · knee skirt (colour 1)
      r(5, 17, 10, 4, blouseC); r(14, 17, 1, 4, shade(blouseC, -0.1));
      if (!back) { px(9, 17, c); px(10, 17, c); px(10, 18, shade(blouseC, -0.12)); px(10, 20, shade(blouseC, -0.12)); }
      r(5, 21, 10, 1, c); r(4, 22, 12, 3, c); r(15, 22, 1, 3, cS); r(4, 25, 12, 1, cS); if (!back) { px(7, 23, cH); px(12, 24, cH); }
      legs(skin, shade(c, -0.28), 6, 11, 3, 26);
      break;
    }
    case 'longdress': {                                   // floor-length gown with a waist ribbon (colour 2)
      r(5, 17, 10, 4, c); r(14, 17, 1, 4, cS); r(5, 21, 10, 1, c2);
      r(5, 22, 10, 3, c); r(4, 25, 12, 3, c); r(3, 28, 14, 1, c); r(14, 22, 1, 3, cS); r(15, 25, 1, 3, cS); r(16, 28, 1, 1, cS);
      if (!back) { px(9, 21, shade(c2, 0.12)); px(8, 23, cH); px(6, 26, cH); px(12, 27, cH); px(7, 18, cH); }
      break;
    }
    case 'aline': {                                       // short A-line dress with a white collar
      r(5, 17, 10, 3, c); r(14, 17, 1, 3, cS);
      if (!back) { r(8, 17, 4, 1, white); px(7, 17, white); px(12, 17, white); px(10, 19, cS); }
      r(5, 20, 10, 1, c); r(4, 21, 12, 2, c); r(3, 23, 14, 2, c); r(3, 25, 14, 1, cS); r(15, 21, 1, 2, cS); r(16, 23, 1, 2, cS);
      legs(skin, shade(c, -0.3), 6, 11, 3, 26);
      break;
    }
    case 'aloha': {                                       // Florida: flower shirt · beige shorts · sandals
      r(5, 17, 10, 6, c); r(14, 17, 1, 6, cS);
      if (!back) { px(9, 17, skin); px(10, 17, skin); px(9, 18, skinS); px(10, 18, cS); px(10, 20, cS); px(10, 22, cS); }
      [[6, 18], [12, 19], [7, 21], [13, 21], [11, 22], [6, 20]].forEach(([x, y], i) => px(x, y, i % 2 ? '#f7f5f0' : c2));
      r(5, 23, 10, 2, '#d9c4a3'); r(14, 23, 1, 2, '#c4ad88');
      legs(skin, '#8b5a3c', 6, 11, 3, 25);
      break;
    }
    case 'durumagi': {                                    // hanbok overcoat to the knee · light baji
      r(5, 17, 10, 9, c); r(14, 17, 1, 9, cS);
      if (!back) { px(7, 17, white); px(8, 18, white); px(12, 17, white); px(11, 18, white); px(10, 19, c2); px(10, 20, c2); px(11, 21, c2); px(11, 22, c2); r(10, 22, 1, 4, cS); }
      else r(9, 18, 2, 8, cS);
      legs('#ece6d6', '#3b302c', 6, 11, 3, 26);
      break;
    }
    case 'dangui': {                                      // court-style long jeogori with gold trim · chima (colour 2)
      r(3, 23, 14, 3, c2); r(2, 26, 16, 2, c2); [5, 9, 13].forEach(x => r(x, 24, 1, 4, c2S)); r(17, 26, 1, 2, c2S);
      r(5, 17, 10, 5, c); r(14, 17, 1, 5, cS); r(5, 22, 3, 1, c); r(12, 22, 3, 1, c); px(5, 23, c); px(14, 23, c);
      if (!back) { px(7, 17, white); px(8, 18, white); px(12, 17, white); px(11, 18, white); px(10, 19, c2); px(10, 20, c2); px(7, 20, '#f3c34f'); px(12, 20, '#f3c34f'); px(6, 21, '#f3c34f'); px(13, 21, '#f3c34f'); }
      skirtShoes('#f4f1ea');
      break;
    }
    case 'jumpsuit': {                                    // one piece · belt
      r(5, 17, 10, 6, c); r(14, 17, 1, 6, cS);
      if (!back) { px(9, 17, cS); px(10, 17, cS); px(9, 18, cS); }
      r(5, 21, 10, 1, '#3b302c'); if (!back) px(10, 21, '#f3c34f');
      r(5, 23, 10, 1, c); legs(c, '#16141a', 5, 11, 4); if (!back) { px(8, 25, cS); px(11, 25, cS); }
      break;
    }
    case 'trench': {                                      // belted trench coat to the knee
      r(5, 17, 10, 8, c); r(14, 17, 1, 8, cS); r(5, 21, 10, 1, cS);
      if (!back) { px(8, 17, cS); px(11, 17, cS); px(8, 18, cS); px(11, 18, cS); r(9, 17, 2, 1, '#f4f1ea'); px(10, 21, '#3b302c'); [19, 23].forEach(y => { px(8, y, '#3b302c'); px(11, y, '#3b302c'); }); }
      else r(9, 22, 2, 3, cS);
      legs('#3b3542', '#16141a', 6, 11, 3, 25);
      break;
    }
    case 'suit':
    default: {
      const pants = shade(c, rgbToHsl(hexToRgb(c))[2] > 0.7 ? -0.06 : -0.1);
      r(5, 17, 10, 6, c); r(14, 17, 1, 6, cS);
      if (!back) {
        r(9, 17, 2, 5, white); px(8, 17, white); px(11, 17, white); px(8, 18, cS); px(11, 18, cS);
        const tie = isHex(av.color2) ? av.color2 : (rgbToHsl(hexToRgb(c))[2] < 0.3 ? '#1b1820' : '#2b2033');
        r(9, 17, 2, 1, tie); px(8, 17, tie); px(11, 17, tie); px(10, 21, cS); px(10, 22, cH);
      } else { r(9, 17, 2, 6, cS); }
      r(5, 23, 10, 1, pants); legs(pants, '#16141a');
    }
  }
  // arms (short sleeves: skin below the elbow · bare: skin all the way)
  const armCol = sleeve || skin, armS = sleeve ? (sleeve === c ? cS : shade(sleeve, -0.12)) : skinS;
  const BARE = av.outfit === 'dress' || av.outfit === 'longdress';
  const armsLower = BARE || ['casual', 'aline', 'aloha', 'jumpsuit'].includes(av.outfit);
  const arm = (x, y, h, colr, side) => {
    for (let j = 0; j < h; j++) {
      const lower = armsLower && (BARE ? true : j >= 2);
      px(x, y + j, lower ? (side ? skinS : skin) : (side ? armS : armCol));
      px(x + 1, y + j, lower ? (side ? skinS : skin) : (side ? armS : armCol));
    }
  };
  const cuff = (x, y) => { if (av.outfit.startsWith('hanbok') || av.outfit === 'durumagi' || av.outfit === 'dangui') r(x, y, 2, 1, white); };
  if (pose === 'up') {
    arm(1, 11, 6, armCol, false); arm(17, 11, 6, armCol, true); r(1, 10, 2, 1, skin); r(17, 10, 2, 1, skinS);
    r(3, 17, 2, 1, armCol); r(15, 17, 2, 1, armS);
  } else if (pose === 'wave') {
    arm(3, 17, 5, armCol, false); r(3, 22, 2, 1, skin); cuff(3, 21);
    arm(17, 11, 6, armCol, true); r(17, 10, 2, 1, skinS); r(15, 17, 2, 1, armS);
  } else if (pose === 'eat') {
    arm(3, 17, 5, armCol, false); r(3, 22, 2, 1, skin); cuff(3, 21);
    arm(15, 17, 2, armCol, true); r(13, 18, 2, 2, armS); r(12, 16, 2, 2, skinS);
  } else {
    const hl = walking && liftL ? 21 : 22, hr = walking && liftR ? 21 : 22;
    arm(3, 17, hl - 17, armCol, false); r(3, hl, 2, 1, skin); cuff(3, hl - 1);
    arm(15, 17, hr - 17, armCol, true); r(15, hr, 2, 1, skinS); cuff(15, hr - 1);
  }

  // ---- 3. head ----
  for (let y = 3; y <= 15; y++) { const [a, b] = faceSpan(shape, y); r(a, y, b - a + 1, 1, skin); px(b, y, skinS); }
  { const [a, b] = faceSpan(shape, 15); r(a, 15, b - a + 1, 1, skinS); }
  r(8, 16, 4, 1, skinS);                                    // neck
  const earL = shape === 'oval' ? 3 : 2, earR = shape === 'oval' ? 16 : 17;
  r(earL, 9, 1, 2, skin); r(earR, 9, 1, 2, skinS);

  if (back) {
    hairBackHead(hp, shape);
  } else {
    // ---- 4. face ----
    const blush = mix(skin, '#ff7d8a', 0.42);
    px(5, 11, blush); px(14, 11, blush);
    px(10 + dx, 11, skinS);                                   // nose
    drawBeard(av.beard);
    drawMouth(av.mouth);
    drawEyes(av.eyes);
    drawBrows(av.brows);
    drawGlasses(av.glasses);
    hairFront(hp);
  }

  // ---- 5. accessories ----
  drawAcc(av.acc);
  return g;

  // ----- helpers (hoisted) -----
  function resolveHair(a) {
    if (a.hairStyle === 'photo' && a.hp) return a.hp;
    return HAIR_PRESETS[a.hairStyle] || HAIR_PRESETS.short;
  }
  function hairBack(h, isBack) {
    if (h.t < 0) return;
    if (h.l >= 2) {
      const yEnd = [0, 0, 15, 19, 24][h.l];
      const xl = h.c ? 1 : 2, xr = h.c ? 18 : 17;
      r(xl, 5, xr - xl + 1, yEnd - 4, isBack ? hair : hairS);
      for (let x = xl; x <= xr; x += 3) px(x, yEnd + 1, hairS);
      if (h.c) for (let y = 7; y < yEnd; y += 3) { px(xl + 1 + (y % 2), y, hair); px(xr - 1 - (y % 2), y + 1, hair); }
      if (isBack) for (let y = 7; y < yEnd; y += 3) px(9 + (y % 2), y, hairS);
    }
    if (h.k === 'pony') { r(17, 3, 2, 10, hair); px(18, 13, hairS); px(17, 13, hairS); px(17, 4, c2); }
    if (h.k === 'twin') { r(0, 7, 2, 10, hair); r(18, 7, 2, 10, hairS); px(1, 7, c2); px(18, 7, c2); px(0, 17, hairS); px(19, 17, hairS); }
    if (h.k === 'side') { r(0, 7, 3, 9, hair); r(0, 16, 2, 1, hairS); px(0, 9, hairS); px(1, 12, hairS); px(2, 7, c2); }
  }
  function cap(h) {
    if (h.t === 0) { r(5, 3, 10, 1, hairS); r(4, 4, 12, 1, hairS); px(3, 5, hairS); px(16, 5, hairS); px(6, 3, hair); px(9, 3, hair); return; }
    if (h.t === 2) { r(6, 0, 8, 1, hair); r(3, 1, 14, 1, hair); r(2, 2, 16, 4, hair); }
    else { r(6, 1, 8, 1, hair); r(4, 2, 12, 1, hair); r(3, 3, 14, 3, hair); }
    if (h.c) { const top = h.t === 2 ? 0 : 1; px(5, top, hair); px(14, top, hair); [[6, top + 2], [10, top + 1], [13, top + 2], [8, top + 3], [4, top + 3]].forEach(([x, y]) => px(x, y, hairS)); }
    px(6, h.t === 2 ? 1 : 2, hairH); px(7, h.t === 2 ? 1 : 2, hairH); px(5, 3, hairH);
    r(16, 3, 1, 3, hairS);
  }
  function topExtras(h) {                                   // knots and buns that sit on top of the head (front and back views)
    if (h.k === 'buns') { r(3, -1, 4, 3, hair); r(13, -1, 4, 3, hair); px(4, -1, hairH); px(14, -1, hairH); r(3, 1, 4, 1, hairS); r(13, 1, 4, 1, hairS); }
    if (h.k === 'topknot') { r(8, -2, 4, 3, hair); px(9, -2, hairH); r(8, 0, 4, 1, '#c8433f'); px(7, -1, '#e8c25a'); px(12, -1, '#e8c25a'); }
    if (h.k === 'chignon') { r(6, -1, 8, 3, hair); px(7, -1, hairH); px(8, -1, hairH); r(6, 1, 8, 1, hairS); r(3, 0, 14, 1, '#e8c25a'); px(2, 0, '#c8433f'); px(17, 0, '#c8433f'); }   // 쪽진머리 with a binyeo
  }
  function braid(x, y0, y1) {                              // a 2-wide plait with a ribbon (colour 2) at the end
    for (let y = y0; y <= y1; y++) { px(x, y, (y % 2) ? hair : hairS); px(x + 1, y, (y % 2) ? hairS : hair); }
    px(x, y1 + 1, c2); px(x + 1, y1 + 1, c2);
  }
  function hairFront(h) {
    if (h.t < 0) { px(6, 4, skinH); px(7, 4, skinH); return; }
    if (h.k === 'bun') { r(7, -2, 6, 3, hair); px(8, -2, hairH); r(7, 0, 6, 1, hairS); }
    topExtras(h);
    cap(h);
    if (h.k === 'braid') braid(16, 12, 20);
    if (h.t === 0 && h.l === 0) return;
    if (h.l === 0) { r(3, 6, 1, 2, hair); r(16, 6, 1, 2, hairS); }
    else if (h.l === 1) { r(3, 6, 1, 4, hair); r(16, 6, 1, 4, hairS); }
    else { r(2, 5, 2, 9, hair); r(16, 5, 2, 9, hairS); if (h.c) { px(2, 14, hair); px(17, 14, hairS); } }
    switch (h.b) {
      case 'full': r(4, 6, 12, 2, hairS); [5, 8, 11, 14].forEach(x => px(x, 8, hairS)); px(6, 6, hair); px(10, 6, hair); break;
      case 'left': r(4, 6, 9, 1, hairS); r(4, 7, 6, 1, hairS); r(4, 8, 3, 1, hairS); px(13, 6, hair); px(7, 6, hair); break;
      case 'right': r(7, 6, 9, 1, hairS); r(10, 7, 6, 1, hairS); r(13, 8, 3, 1, hairS); px(6, 6, hair); px(12, 6, hair); break;
      case 'center': r(4, 6, 5, 1, hairS); r(11, 6, 5, 1, hairS); r(4, 7, 3, 1, hairS); r(13, 7, 3, 1, hairS); break;
      case 'spiky': r(4, 6, 12, 1, hairS); [4, 6, 9, 12, 15].forEach(x => px(x, 7, hairS)); break;
      case 'curtain': r(4, 6, 4, 1, hairS); r(12, 6, 4, 1, hairS); r(4, 7, 2, 1, hairS); r(14, 7, 2, 1, hairS); px(4, 8, hairS); px(15, 8, hairS); px(4, 9, hairS); px(15, 9, hairS); px(7, 6, hair); px(12, 6, hair); break;
      case 'comma': r(4, 6, 10, 1, hairS); r(4, 7, 6, 1, hairS); px(8, 8, hairS); px(9, 8, hairS); px(9, 7, hair); px(12, 6, hair); break;
      case 'side': r(4, 6, 11, 1, hairS); r(4, 7, 8, 1, hairS); r(4, 8, 5, 1, hairS); r(4, 9, 2, 1, hairS); px(9, 6, hair); px(13, 6, hair); break;
      default: px(4, 6, hairS); px(15, 6, hairS);
    }
  }
  function hairBackHead(h, shp) {
    if (h.t < 0) { px(8, 4, skinH); px(9, 4, skinH); return; }
    if (h.k === 'bun') { r(7, -2, 6, 3, hair); px(8, -2, hairH); }
    topExtras(h);
    cap(h);
    const bottom = h.l === 0 ? 11 : h.l === 1 ? 13 : 15;
    for (let y = 5; y <= bottom; y++) { const [a, b] = faceSpan(shp, y); r(a - (h.l >= 2 ? 1 : 0), y, b - a + 1 + (h.l >= 2 ? 2 : 0), 1, y === bottom ? hairS : hair); }
    for (let y = 6; y < bottom; y += 3) { px(7, y, hairS); px(12, y + 1, hairS); }
    if (h.k === 'pony') { r(9, 8, 2, 10, hair); px(9, 9, c2); px(10, 9, c2); r(9, 17, 2, 1, hairS); }
    if (h.k === 'braid') braid(9, bottom, 21);
  }
  function drawEyes(kind) {
    const L = 6 + dx, R = 12 + dx;
    if (frame === 'blink') { r(L, 10, 2, 1, EYE); r(R, 10, 2, 1, EYE); return; }
    switch (kind) {
      case 'big': [L, R].forEach(x => { r(x, 8, 2, 3, EYE); px(x, 8, '#ffffff'); px(x + 1, 10, '#6b5a80'); }); break;
      case 'narrow': [L, R].forEach(x => { r(x, 10, 2, 1, EYE); px(x - 1 + (x === R ? 3 : 0), 9, EYE); }); break;
      case 'smile': [L, R].forEach(x => { px(x - 1, 10, EYE); px(x, 9, EYE); px(x + 1, 9, EYE); px(x + 2, 10, EYE); }); break;
      case 'calm': [L, R].forEach(x => { r(x - 1, 9, 4, 1, EYE); r(x, 10, 2, 1, EYE); }); break;
      case 'sparkle': [L, R].forEach(x => { r(x, 8, 2, 3, EYE); px(x, 8, '#ffffff'); px(x + 1, 9, '#ffffff'); px(x, 10, '#8fd3ff'); }); break;
      case 'sleepy': [L, R].forEach(x => { r(x, 10, 2, 1, EYE); r(x - 1, 9, 4, 1, skinS); }); break;
      case 'wink': r(L - 1, 10, 1, 1, EYE); r(L, 9, 2, 1, EYE); px(L + 2, 10, EYE); r(R, 9, 2, 2, EYE); px(R, 9, '#ffffff'); break;
      case 'dot': [L, R].forEach(x => { r(x, 9, 1, 2, EYE); }); break;
      case 'lash': r(L, 9, 2, 2, EYE); px(L, 9, '#ffffff'); px(L - 1, 8, EYE); r(R, 9, 2, 2, EYE); px(R, 9, '#ffffff'); px(R + 2, 8, EYE); break;
      default: [L, R].forEach(x => { r(x, 9, 2, 2, EYE); px(x, 9, '#ffffff'); });
    }
  }
  function drawBrows(kind) {
    const bc = kind === 'thick' ? shade(hair, -0.05) : mix(hair, skin, 0.35);
    const L = 6 + dx, R = 12 + dx;
    if (kind === 'thick') { r(L - 1, 7, 3, 1, bc); r(R, 7, 3, 1, bc); }
    else if (kind === 'arched') { px(L - 1, 8, bc); r(L, 7, 2, 1, bc); px(R + 2, 8, bc); r(R, 7, 2, 1, bc); }
    else if (kind === 'straight') { r(L - 1, 7, 4, 1, bc); r(R - 1, 7, 4, 1, bc); }
    else { r(L, 7, 2, 1, bc); r(R, 7, 2, 1, bc); }
  }
  function drawMouth(kind) {
    const m = '#b5524f', d = '#6b2530', x = 9 + dx;
    switch (kind) {
      case 'grin': r(x - 1, 12, 4, 1, d); r(x, 12, 2, 1, '#ffffff'); r(x, 13, 2, 1, '#e0707a'); break;
      case 'small': r(x, 12, 2, 1, m); break;
      case 'open': r(x, 12, 2, 2, d); px(x, 13, '#e0707a'); break;
      case 'cat': px(x - 1, 12, d); px(x, 13, d); px(x + 1, 12, d); px(x + 2, 13, d); px(x + 3, 12, d); break;
      case 'tongue': r(x - 1, 12, 4, 1, d); r(x, 13, 2, 1, '#ff7d8a'); break;
      case 'lips': r(x, 12, 2, 1, '#b8323c'); r(x - 1, 13, 4, 1, '#d8505c'); break;
      case 'smirk': r(x, 13, 2, 1, m); px(x + 2, 12, m); break;
      default: px(x - 1, 12, m); r(x, 13, 2, 1, m); px(x + 2, 12, m);
    }
  }
  function drawBeard(kind) {
    if (!kind || kind === 'none') return;
    if (kind === 'chinstrap') return drawChinstrap();
    const bc = shade(hair, dark ? 0.04 : -0.06), st = mix(skin, hair, 0.38);
    if (kind === 'stubble') {
      for (let y = 12; y <= 15; y++) { const [a, b] = faceSpan(shape, y); for (let x = a; x <= b; x++) if ((x + y) % 2 === 0 && (x <= 7 || x >= 12 || y >= 14)) px(x, y, st); }
      r(8, 11, 4, 1, st); return;
    }
    r(8, 11, 4, 1, bc); px(7, 12, bc); px(12, 12, bc);           // mustache
    if (kind === 'goatee' || kind === 'full') { r(8, 14, 4, 2, bc); px(9, 13, bc); px(10, 13, bc); }
    if (kind === 'full') for (let y = 10; y <= 15; y++) { const [a, b] = faceSpan(shape, y); r(a, y, 2, 1, bc); r(b - 1, y, 2, 1, bc); if (y >= 14) r(a, y, b - a + 1, 1, bc); }
  }
  function drawChinstrap() {
    const bc = shade(hair, dark ? 0.04 : -0.06);
    for (let y = 10; y <= 15; y++) { const [a, b] = faceSpan(shape, y); px(a, y, bc); px(b, y, bc); if (y === 15) r(a, y, b - a + 1, 1, bc); }
  }
  function drawGlasses(kind) {
    if (!kind || kind === 'none') return;
    const f = '#3a2e3f';
    if (kind === 'sunglasses') { r(5, 9, 4, 2, '#1e1b26'); r(11, 9, 4, 2, '#1e1b26'); r(9, 9, 2, 1, '#1e1b26'); px(4, 9, f); px(15, 9, f); px(6, 9, '#8a8fb0'); px(12, 9, '#8a8fb0'); return; }
    if (kind === 'heart') {
      const pk = '#ff6f9f', pkS = '#d84a7c';
      [5, 11].forEach(x0 => { px(x0, 8, pk); px(x0 + 3, 8, pk); r(x0, 9, 4, 1, pk); r(x0 + 1, 10, 2, 1, pkS); px(x0 + 1, 9, '#ffc2d6'); });
      r(9, 9, 2, 1, f); px(4, 9, f); px(15, 9, f); return;
    }
    if (kind === 'rimless') {
      const gd = '#c9a94e';
      [5, 11].forEach(x0 => { r(x0, 11, 4, 1, gd); px(x0, 10, gd); px(x0 + 3, 10, gd); });
      r(9, 9, 2, 1, gd); px(4, 9, gd); px(15, 9, gd); return;
    }
    if (kind === 'square') {
      const k = '#1e1b26';
      [5, 11].forEach(x0 => { r(x0 - 1, 8, 6, 1, k); r(x0, 11, 4, 1, k); r(x0, 9, 1, 2, k); r(x0 + 3, 9, 1, 2, k); });
      r(9, 9, 2, 1, k); px(4, 9, k); px(15, 9, k);
      if (dx) { r(6, 9, 2, 2, skin); r(12, 9, 2, 2, skin); r(6, 9, 2, 2, EYE); r(12, 9, 2, 2, EYE); }
      return;
    }
    [5, 11].forEach(x0 => {
      r(x0, 8, 4, 1, f); r(x0, 11, 4, 1, f); r(x0, 9, 1, 2, f); r(x0 + 3, 9, 1, 2, f);
      if (kind === 'round') { clr(x0, 8); clr(x0 + 3, 8); clr(x0, 11); clr(x0 + 3, 11); px(x0, 8, skin); px(x0 + 3, 8, skin); px(x0, 11, skin); px(x0 + 3, 11, skin); }
    });
    r(9, 9, 2, 1, f); px(4, 9, f); px(15, 9, f);
    // keep eyes visible & centered inside the lenses
    if (dx) { r(6, 9, 2, 2, skin); r(12, 9, 2, 2, skin); r(6, 9, 2, 2, EYE); r(12, 9, 2, 2, EYE); }
  }
  function drawAcc(a) {
    switch (a) {
      case 'flower': px(15, 1, '#ff8fb8'); px(14, 2, '#ff8fb8'); px(16, 2, '#ff8fb8'); px(15, 3, '#ff8fb8'); px(15, 2, '#ffd75e'); px(14, 3, '#5e9a46'); break;
      case 'ribbon': r(3, 0, 2, 3, '#e2465f'); r(6, 0, 2, 3, '#e2465f'); r(5, 1, 1, 1, '#b8304a'); px(3, 0, '#f07a8c'); break;
      case 'bowtie': if (av.outfit !== 'suit') { r(7, 17, 2, 2, '#c8433f'); r(11, 17, 2, 2, '#c8433f'); r(9, 17, 2, 1, '#9e2f2c'); } break;
      case 'tiara': r(6, 2, 8, 1, '#f6e7b0'); px(7, 1, '#f6e7b0'); px(10, 0, '#f6e7b0'); px(9, 1, '#f6e7b0'); px(12, 1, '#f6e7b0'); px(10, 1, '#8fd3ff'); break;
      case 'gat': { const k = 'rgba(28,24,34,0.92)'; r(6, -2, 8, 5, k); r(0, 3, 20, 1, k); r(1, 2, 4, 1, 'rgba(28,24,34,0.35)'); r(15, 2, 4, 1, 'rgba(28,24,34,0.35)'); px(7, -1, '#4a4258'); [5, 7, 9, 11, 13, 15].forEach(y => px(16, y, '#c46a3e')); break; }
      case 'cap': r(4, 0, 12, 1, c2); r(3, 1, 14, 4, c2); r(3, 5, 14, 1, shade(c2, -0.18)); px(6, 1, shade(c2, 0.14)); px(9, 2, '#ffffff'); px(10, 2, '#ffffff'); break;
      case 'boutonniere': px(7, 18, '#ff9ec4'); px(7, 19, '#7cbf5f'); px(6, 18, '#ffd75e'); break;
      case 'veil': r(5, 2, 10, 1, '#f6e7b0'); px(9, 1, '#fff6d2'); px(10, 1, '#fff6d2'); px(7, 2, '#ffffff'); px(12, 2, '#8fd3ff'); break;
      // ---- v4.1 ----
      case 'beret': { const k = c2, kS = shade(c2, -0.2); r(5, 0, 9, 1, k); r(4, 1, 12, 2, k); r(4, 3, 11, 1, kS); px(9, -1, kS); px(6, 1, shade(c2, 0.14)); break; }
      case 'bucket': { const k = c2, kS = shade(c2, -0.16); r(5, 0, 10, 2, k); r(3, 2, 14, 1, k); r(2, 3, 16, 1, kS); r(5, 1, 10, 1, kS); px(7, 0, shade(c2, 0.14)); break; }
      case 'beanie': { const k = c2, kS = shade(c2, -0.2); r(4, 0, 12, 4, k); r(4, 3, 12, 1, kS); [5, 7, 9, 11, 13].forEach(x => px(x, 1, kS)); r(9, -2, 2, 2, '#f4f1ea'); break; }
      case 'headband': r(4, 4, 12, 1, c2); px(5, 4, shade(c2, 0.15)); px(3, 5, c2); px(16, 5, shade(c2, -0.15)); break;
      case 'flowercrown': {
        const fl = ['#ff8fb8', '#ffd75e', '#f7f5f0', '#ff8fb8', '#b9a7e3', '#ffd75e', '#ff8fb8'];
        [[3, 4], [5, 3], [7, 3], [9, 2], [11, 3], [13, 3], [15, 4]].forEach(([x, y], i) => px(x, y, fl[i]));
        [[4, 4], [6, 3], [10, 3], [12, 3], [14, 4]].forEach(([x, y]) => px(x, y, '#5e9a46'));
        break;
      }
      case 'sunhat': { const st = '#e8cf8a', stS = '#c9ac62'; r(5, -1, 10, 3, st); r(5, 1, 10, 1, c2); r(0, 2, 20, 1, st); r(1, 3, 18, 1, stS); px(7, -1, '#f4e3b0'); break; }
      case 'earrings': { const el = shape === 'oval' ? 3 : 2, er = shape === 'oval' ? 16 : 17; if (!back) { px(el, 11, '#f6e7b0'); px(er, 11, '#f6e7b0'); px(el, 12, '#e8c25a'); px(er, 12, '#e8c25a'); } break; }
      case 'pearls': if (!back) { for (let x = 7; x <= 12; x++) px(x, 17, x % 2 ? '#f4f1ea' : '#d9d4c8'); px(9, 18, '#f4f1ea'); px(10, 18, '#f4f1ea'); } break;
      case 'scarf': { const k = c2, kS = shade(c2, -0.18); r(6, 16, 8, 2, k); r(6, 17, 8, 1, kS); if (!back) { r(11, 18, 2, 3, k); px(12, 20, kS); } else r(7, 18, 2, 2, kS); break; }
      case 'lei': { const fl = ['#ff8fb8', '#ffd75e', '#f7f5f0', '#ef8f6b']; for (let x = 6; x <= 13; x++) px(x, 17, fl[x % 4]); if (!back) for (let x = 7; x <= 12; x++) px(x, 18, fl[(x + 2) % 4]); px(9, 19, '#ff8fb8'); px(10, 19, '#ffd75e'); break; }
      case 'catears': { const k = hair; r(3, -1, 3, 2, k); px(3, -2, k); r(14, -1, 3, 2, k); px(16, -2, k); px(4, 0, '#ffb3c7'); px(15, 0, '#ffb3c7'); break; }
      case 'binyeo': r(13, 1, 6, 1, '#e8c25a'); px(18, 0, '#c8433f'); px(19, 1, '#c8433f'); px(13, 1, '#b8932e'); break;
    }
  }
}

function gridToCanvas(g) {
  const cv = document.createElement('canvas'); cv.width = SPRITE_W; cv.height = SPRITE_H;
  const ctx = cv.getContext('2d');
  const filled = (x, y) => y >= 0 && y < GH && x >= 0 && x < GW && g[y][x] && !String(g[y][x]).startsWith('rgba(255,255,255,0.5');
  ctx.fillStyle = OUTLINE;
  for (let y = -1; y <= GH; y++) for (let x = -1; x <= GW; x++) {
    if (filled(x, y)) continue;
    if (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1)) ctx.fillRect(x + 1, y + 1, 1, 1);
  }
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) { if (!g[y][x]) continue; ctx.fillStyle = g[y][x]; ctx.fillRect(x + 1, y + 1, 1, 1); }
  return cv;
}

const cache = new Map();
export function getSprite(raw) {
  const av = normalizeAvatar(raw);
  const key = JSON.stringify(av);
  if (cache.has(key)) return cache.get(key);
  const s = {};
  for (const f of FRAMES) s[f] = gridToCanvas(build(av, f));
  cache.set(key, s);
  if (cache.size > 400) cache.delete(cache.keys().next().value);
  return s;
}

/** sanitize anything coming from the network/db (also upgrades v1 avatars) */
export function normalizeAvatar(a = {}) {
  const pick = (v, list, d) => list.includes(v) ? v : d;
  const colr = (v, pal, d) => isHex(v) ? v.toLowerCase() : (Number.isInteger(v) && v >= 0 && v < pal.length ? v : d);
  let hairStyle = a.hairStyle === 'photo' || HAIR_STYLES.includes(a.hairStyle) ? a.hairStyle : (a.hairStyle === 'sidepart' ? 'sidepart' : 'short');
  let hp = null;
  if (hairStyle === 'photo') {
    const h = a.hp || {};
    hp = { t: [-1, 0, 1, 2].includes(h.t) ? h.t : 1, l: [0, 1, 2, 3, 4].includes(h.l) ? h.l : 1, b: pick(h.b, BANGS, 'spiky'), c: h.c ? 1 : 0, k: pick(h.k, HAIR_EXTRAS, 'none') };
  }
  const out = {
    skin: colr(a.skin, SKIN, 2), hair: colr(a.hair, HAIR, 0), hairStyle,
    face: pick(a.face, FACES, 'round'), eyes: pick(a.eyes, EYES, 'round'), brows: pick(a.brows, BROWS, 'thin'),
    mouth: pick(a.mouth, MOUTHS, 'smile'), beard: pick(a.beard, BEARDS, 'none'),
    glasses: pick(a.glasses, GLASSES, a.acc === 'glasses' ? 'glasses' : a.acc === 'sunglasses' ? 'sunglasses' : 'none'),
    outfit: pick(a.outfit, OUTFITS, 'suit'), color: colr(a.color, COLORS, 1),
    acc: pick(a.acc, [...ACCESSORIES, ...COUPLE_ACC], 'none'),
  };
  if (isHex(a.color2)) out.color2 = a.color2.toLowerCase();
  if (hp) out.hp = hp;
  return out;
}

export function defaultAvatar() {
  return { skin: 2, hair: 0, hairStyle: 'short', face: 'round', eyes: 'round', brows: 'thin', mouth: 'smile', beard: 'none', glasses: 'none', outfit: 'suit', color: 1, acc: 'none' };
}
// a random look that reads as ONE gender (v3.3) — mixing a beard with a dress or a tiara with a buzz cut made guests
// without a photo look like the opposite gender. gender: 'male' | 'female' | null (= pick one at random)
const LOOK = {
  male: {
    hair: ['short', 'sidepart', 'pomp', 'buzz', 'curly', 'twoblock', 'comma', 'curtain', 'slick', 'short', 'comma', 'topknot'],
    outfit: ['suit', 'suit', 'vest', 'casual', 'hanbok_baji', 'durumagi', 'cardigan', 'hoodie', 'aloha', 'trench', 'overalls'],
    acc: ['none', 'none', 'none', 'bowtie', 'cap', 'gat', 'beret', 'bucket', 'beanie', 'lei', 'scarf'], beard: 0.25,
    eyes: ['round', 'narrow', 'smile', 'calm', 'dot', 'sleepy', 'wink'], brows: ['thin', 'thick', 'straight'], mouth: ['smile', 'grin', 'small', 'open', 'smirk', 'cat'],
  },
  female: {
    hair: ['bob', 'long', 'wavy', 'ponytail', 'bun', 'twin', 'braid', 'sidepony', 'spacebuns', 'chignon', 'hime', 'longwavy', 'pixie', 'longcurtain'],
    outfit: ['dress', 'dress', 'hanbok_chima', 'dangui', 'blouse', 'longdress', 'aline', 'cardigan', 'jumpsuit', 'trench', 'aloha'],
    acc: ['none', 'none', 'flower', 'ribbon', 'tiara', 'flowercrown', 'headband', 'earrings', 'pearls', 'beret', 'sunhat', 'scarf'], beard: 0,
    eyes: ['round', 'big', 'smile', 'calm', 'sparkle', 'lash', 'wink'], brows: ['thin', 'arched', 'thin'], mouth: ['smile', 'grin', 'small', 'open', 'lips', 'cat'],
  },
};
const KNOT = ['bun', 'topknot', 'spacebuns'];                // a binyeo goes through a knot (the chignon has its own)
/** accessories that need a certain hair (a hairpin needs a knot) or would hide it — keep the look coherent */
function coherent(a) {
  if (a.acc === 'binyeo' && !KNOT.includes(a.hairStyle) && !(a.hairStyle === 'photo' && ['bun', 'topknot', 'buns'].includes(a.hp?.k))) a.acc = 'none';
  if (['beanie', 'bucket', 'beret', 'sunhat', 'gat', 'cap'].includes(a.acc) && ['spacebuns', 'topknot'].includes(a.hairStyle)) a.acc = 'none';
  return a;
}
const pickOf = (a, r = Math.random) => a[Math.floor(r() * a.length)];
export function randomAvatar(keep = {}, gender = null, r = Math.random) {
  const p = a => pickOf(a, r);
  const g = gender === 'male' || gender === 'female' ? gender : (r() < 0.5 ? 'male' : 'female'), L = LOOK[g];
  return normalizeAvatar(coherent({
    skin: Math.floor(r() * 8), hair: p([0, 0, 1, 1, 2, 3, 4, 6, 7, 10, 16, 17, 18, 21]), hairStyle: p(L.hair),
    face: p(FACES), eyes: p(L.eyes), brows: p(L.brows), mouth: p(L.mouth), beard: r() < L.beard ? p(BEARDS.slice(1)) : 'none',
    glasses: r() < 0.25 ? p(GLASSES.slice(1)) : 'none', outfit: p(L.outfit), color: Math.floor(r() * COLORS.length),
    acc: p(L.acc), ...keep,
  }));
}

// ---------- suggestions (v4.1): four looks to pick from ----------
// hanbok colour pairs (jeogori · chima/goreum) that read well at pixel size
const HANBOK = [[14, 4], [8, 6], [11, 13], [15, 1], [19, 23], [24, 12], [3, 6], [21, 25]];
const HANBOK_M = [[1, 6], [10, 8], [5, 12], [18, 9], [2, 13], [11, 1], [22, 6], [4, 11]];
/** the photo look's hair as a preset family: 'long' | 'mid' | 'short' | 'bald' */
function hairFamily(a) {
  const hp = a.hairStyle === 'photo' && a.hp ? a.hp : HAIR_PRESETS[a.hairStyle] || HAIR_PRESETS.short;
  return hp.t < 0 ? 'bald' : hp.l >= 3 ? 'long' : hp.l === 2 ? 'mid' : 'short';
}
/**
 * Four looks for the customise screen. With a photo look (base): the same face, skin, hair colour, glasses and beard —
 * ① as analysed ② in hanbok ③ dressed up ④ casual with another hairstyle of the same length. Without a base: four varied
 * random looks (two of each gender, shuffled). r: random source (tests pass a seeded one).
 */
export function suggestLooks(base = null, gender = null, r = Math.random) {
  if (!base) {
    const gs = r() < 0.5 ? ['male', 'female', 'female', 'male'] : ['female', 'male', 'male', 'female'];
    const skins = [0, 2, 4, 6].sort(() => r() - 0.5);
    return gs.map((g, i) => randomAvatar({ skin: skins[i] + (r() < 0.5 ? 1 : 0) }, g, r));
  }
  const a0 = normalizeAvatar(base);
  const g = gender === 'male' || gender === 'female' ? gender : (['dress', 'hanbok_chima', 'longdress', 'aline', 'blouse', 'dangui'].includes(a0.outfit) ? 'female' : 'male');
  const fam = hairFamily(a0), p = a => pickOf(a, r);
  const keep = ({ hairStyle, hp, ...rest }) => ({ ...a0, ...rest, ...(hairStyle ? { hairStyle, hp } : {}) });
  const [hc, hc2] = p(g === 'female' ? HANBOK : HANBOK_M);
  const hanbok = g === 'female'
    ? keep({ outfit: p(['hanbok_chima', 'hanbok_chima', 'dangui']), color: hc, color2: COLORS[hc2], acc: fam === 'long' || fam === 'mid' ? 'flower' : 'none', ...(fam === 'short' || fam === 'bald' ? { hairStyle: 'chignon' } : {}) })
    : keep({ outfit: p(['hanbok_baji', 'durumagi']), color: hc, color2: COLORS[hc2], acc: r() < 0.4 ? 'gat' : 'none' });
  const formal = g === 'female'
    ? keep({ outfit: p(['longdress', 'aline', 'dress']), color: p([14, 15, 12, 19, 21, 24, 3, 13]), acc: p(['pearls', 'earrings', 'tiara', 'flowercrown']) })
    : keep({ outfit: p(['suit', 'vest', 'suit']), color: p([0, 1, 2, 5, 18, 22]), acc: p(['bowtie', 'none', 'none']) });
  const STYLE = {
    female: { long: ['braid', 'longwavy', 'longcurtain', 'wavy'], mid: ['bob', 'hime', 'sidepony', 'ponytail'], short: ['pixie', 'bob', 'spacebuns'], bald: ['pixie'] },
    male: { long: ['curtain', 'wavy', 'curly'], mid: ['curtain', 'comma', 'curly'], short: ['twoblock', 'comma', 'sidepart', 'pomp'], bald: ['buzz', 'bald'] },
  };
  const casual = keep({
    hairStyle: p(STYLE[g][fam]), hp: undefined,
    outfit: g === 'female' ? p(['blouse', 'cardigan', 'aloha', 'jumpsuit', 'trench']) : p(['aloha', 'cardigan', 'hoodie', 'casual', 'trench', 'overalls']),
    color: Math.floor(r() * COLORS.length),
    acc: g === 'female' ? p(['beret', 'sunhat', 'headband', 'scarf', 'lei']) : p(['bucket', 'beret', 'cap', 'lei', 'scarf']),
  });
  return [a0, hanbok, formal, casual].map(x => { const y = { ...x }; if (y.hp === undefined) delete y.hp; if (y.color2 === undefined) delete y.color2; return normalizeAvatar(coherent(y)); });
}

/** draw a sprite large & crisp onto a canvas (preview) */
export function drawPreview(canvas, av, frame = 'idle') {
  const s = getSprite(av)[frame];
  const ctx = canvas.getContext('2d'); ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const scale = Math.max(1, Math.floor(Math.min(canvas.width / SPRITE_W, canvas.height / SPRITE_H)));
  const w = SPRITE_W * scale, h = SPRITE_H * scale;
  const x = Math.floor((canvas.width - w) / 2), y = Math.floor((canvas.height - h) / 2);
  ctx.fillStyle = 'rgba(43,32,51,0.18)';
  ctx.beginPath(); ctx.ellipse(canvas.width / 2, y + h - scale * 2.2, w * 0.3, scale * 1.4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.drawImage(s, x, y, w, h);
}

// ---------- simple color extraction (fallback when face detection is unavailable) ----------
function regionMedian(ctx, size, x0, y0, x1, y1) {
  const X = Math.floor(x0 * size), Y = Math.floor(y0 * size), W = Math.max(1, Math.floor((x1 - x0) * size)), H = Math.max(1, Math.floor((y1 - y0) * size));
  const d = ctx.getImageData(X, Y, W, H).data; const R = [], G = [], B = [];
  for (let i = 0; i < d.length; i += 16) { R.push(d[i]); G.push(d[i + 1]); B.push(d[i + 2]); }
  const med = a => { a.sort((p, q) => p - q); return a[Math.floor(a.length / 2)] || 0; };
  return [med(R), med(G), med(B)];
}
export function extractColors(canvas) {
  const size = canvas.width, ctx = canvas.getContext('2d', { willReadFrequently: true });
  const skin = regionMedian(ctx, size, 0.42, 0.45, 0.58, 0.55), hair = regionMedian(ctx, size, 0.40, 0.10, 0.60, 0.16), cloth = regionMedian(ctx, size, 0.30, 0.86, 0.70, 0.97);
  return { skin: tidy(rgbToHex(skin), 'skin'), hair: dist(hair, skin) < 60 ? 1 : tidy(rgbToHex(hair), 'hair'), color: tidy(rgbToHex(cloth), 'cloth') };
}

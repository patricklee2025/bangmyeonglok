// ============================================================
//  WP-12 픽셀 네컷 — 그리기만 (DOM·데이터 없음)
//  컷: 4:3 가운데 자르기 → 1080×810 (메모리 부족이면 720×540) · 픽셀 효과: 1/6 축소 → 16색 + 4×4 순서 디더링 → 최근접 확대
//  세로 네컷 800×2400 (공유용) · 2×2 1200×960 (TV 포토월용, ≤ 850KB)
// ============================================================
import { spriteCanvas } from '../../core/ui.js';

export const FRAMES = { pink: { bg: '#f7d6e0', ink: '#2b2033' }, mint: { bg: '#cfeee0', ink: '#2b2033' }, night: { bg: '#2b2033', ink: '#ffffff' } };
const FONT = "Galmuri11, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif";
// 16 colours (warm skin tones kept, so faces stay faces)
const PAL = ['#1a1423', '#3b2f4a', '#6b5d73', '#a99cb0', '#f4f1ea', '#ffffff', '#7a3b2e', '#b5694f', '#e8a87c', '#ffd6b8', '#c8433f', '#ff9ec4', '#f2c94c', '#5e9a46', '#4f6fd1', '#2f4f7f']
  .map(h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)));
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v / 16 - 0.5) * 40);

const cv = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; if (!c.getContext('2d')) throw Object.assign(new Error('canvas'), { code: 'memory' }); return c; };

/** a source (video / image / bitmap) → its 4:3 middle as a w × h canvas. mirror = like the selfie preview */
export function cut(src, sw, sh, { w = 1080, h = 810, mirror = false } = {}) {
  const c = cv(w, h), g = c.getContext('2d');
  const k = Math.min(sw / 4, sh / 3), cw = k * 4, ch = k * 3;
  if (mirror) { g.translate(w, 0); g.scale(-1, 1); }
  g.drawImage(src, (sw - cw) / 2, (sh - ch) / 2, cw, ch, 0, 0, w, h);
  return c;
}

/** the pixel effect: 1/6 size, 16 colours with ordered dithering, then blown back up with hard edges */
export function pixelate(src) {
  const sw = Math.max(1, Math.round(src.width / 6)), sh = Math.max(1, Math.round(src.height / 6));
  const small = cv(sw, sh), g = small.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingEnabled = true; g.drawImage(src, 0, 0, sw, sh);
  const img = g.getImageData(0, 0, sw, sh), d = img.data;
  for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
    const i = (y * sw + x) * 4, t = BAYER[(y & 3) * 4 + (x & 3)];
    const r = d[i] + t, gg = d[i + 1] + t, b = d[i + 2] + t;
    let best = 0, bd = Infinity;
    for (let p = 0; p < PAL.length; p++) { const q = PAL[p], dr = r - q[0], dg = gg - q[1], db = b - q[2], dist = dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11; if (dist < bd) { bd = dist; best = p; } }
    d[i] = PAL[best][0]; d[i + 1] = PAL[best][1]; d[i + 2] = PAL[best][2];
  }
  g.putImageData(img, 0, 0);
  const out = cv(src.width, src.height), o = out.getContext('2d');
  o.imageSmoothingEnabled = false; o.drawImage(small, 0, 0, out.width, out.height);
  return out;
}

const text = (g, s, x, y, size, color, align = 'left', bold = true) => { g.font = `${bold ? 'bold ' : ''}${size}px ${FONT}`; g.fillStyle = color; g.textAlign = align; g.textBaseline = 'middle'; g.fillText(s, x, y); };
function heart(g, x, y, s, color) {                        // a 7 × 6 pixel heart, s = pixel size
  const rows = ['0110110', '1111111', '1111111', '0111110', '0011100', '0001000'];
  g.fillStyle = color;
  rows.forEach((r, j) => [...r].forEach((b, i) => { if (b === '1') g.fillRect(x + i * s, y + j * s, s, s); }));
}

/**
 * The strip to keep: 800 × 2400. Header (names · date · pixel hearts), 4 cuts 704 × 528, a sticker row (me ×4 · the couple ×4) + "PIXEL VILLAGE <date>".
 * opts = { cuts: [canvas ×4], frame: 'pink'|'mint'|'night', title, date, me (avatar | null), groom, bride }
 */
export function strip(opts) {
  const F = FRAMES[opts.frame] || FRAMES.pink, c = cv(800, 2400), g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.fillStyle = F.bg; g.fillRect(0, 0, 800, 2400);
  heart(g, 48, 32, 6, '#e66b8f'); heart(g, 710, 32, 6, '#e66b8f');
  text(g, opts.title, 400, 50, 46, F.ink, 'center');
  text(g, opts.date, 400, 92, 24, F.ink, 'center', false);
  opts.cuts.forEach((k, i) => {
    const y = 120 + i * (528 + 16);
    g.fillStyle = F.ink; g.fillRect(44, y - 4, 712, 536);
    g.drawImage(k, 48, y, 704, 528);
  });
  const by = 2400 - 4;                                     // sticker row: feet on the bottom margin
  let x = 48;
  const put = (src, frame) => { const s = spriteCanvas(src, frame, 4); g.drawImage(s, x, by - s.height); x += s.width + 8; };
  if (opts.me) put(opts.me, 'wave');
  put(opts.groom, 'idle'); put(opts.bride, 'idle');
  text(g, 'PIXEL VILLAGE', 752, 2318, 26, F.ink, 'right');
  text(g, opts.date, 752, 2356, 24, F.ink, 'right', false);
  return c;
}

/** The TV photo-wall picture: 1200 × 960, 2 × 2 cuts 576 × 432 + a thin caption line */
export function grid(opts) {
  const F = FRAMES[opts.frame] || FRAMES.pink, c = cv(1200, 960), g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.fillStyle = F.bg; g.fillRect(0, 0, 1200, 960);
  opts.cuts.forEach((k, i) => {
    const x = 16 + (i % 2) * (576 + 16), y = 16 + Math.floor(i / 2) * (432 + 16);
    g.drawImage(k, x, y, 576, 432);
  });
  text(g, `${opts.title} · ${opts.date}`, 600, 936, 22, F.ink, 'center');
  return c;
}

/** JPEG ≤ max bytes: quality 0.85 → 0.75 → 0.65 */
export function jpegUnder(canvas, maxBytes = 850 * 1024) {
  let url = '';
  for (const q of [0.85, 0.75, 0.65, 0.55]) { url = canvas.toDataURL('image/jpeg', q); if ((url.length - url.indexOf(',') - 1) * 0.75 <= maxBytes) return url; }
  return url;
}

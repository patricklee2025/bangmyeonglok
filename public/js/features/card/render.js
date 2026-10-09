// ============================================================
//  WP-11 내 픽셀 카드 — 1080×1350 (4:5) 카드 그리기. 순수 그리기만 (DOM 없음 · 데이터 없음).
//  위: 픽셀 마을(제단·카펫·광장)을 월드에서 잘라 4배 + 신랑·신부 ×6 + 내 캐릭터 ×14
//  아래: 이름 · 구분 · 덕담 말풍선(최대 3줄) · 페이즈 문구 · 신랑 ♥ 신부 · 날짜 · QR(마을에서 내 캐릭터) · 하객 코드
//  같은 입력 → 같은 그림 (테마 3개 · 난수 없음)
// ============================================================
import { spriteCanvas, qrCanvas } from '../../core/ui.js';
import { W, H, buildGround, buildProps } from '../../scene.js';

export const CW = 1080, CH = 1350;
const K = 4;
const CROP = { x: 105, y: 0, w: 270, h: 190 };          // world px: altar · carpet · the top of the plaza → ×4 = 1080 × 760
const SCENE_H = CROP.h * K;
const INK = '#2b2033', CREAM = '#fff8ec', PINK = '#c45a86', MUTED = '#6b5d73';
const FONT = "Galmuri11, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif";
const SIDE_COLOR = { groom: '#4f6fd1', bride: '#e66b8f', both: '#8a63d9' };

/** the village picture (ground + level-6 props, y-sorted) — night = lit windows. { canvas, lights: [[x, y]] } */
export function makeWorld(night) {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
  g.drawImage(buildGround(), 0, 0);
  const props = buildProps(6, !!night).sort((a, b) => a.base - b.base);
  for (const p of props) g.drawImage(p.img, Math.round(p.x), Math.round(p.y));
  return { canvas: c, night: !!night, lights: props.filter(p => p.light).map(p => p.light) };
}

const font = (px, bold) => `${bold ? 'bold ' : ''}${px}px ${FONT}`;

/** word wrap (Korean keep-all style, long words split) into at most maxLines; a cut ends with '…' — same rule as the village bubbles */
export function wrap(g, text, maxW, maxLines) {
  const tokens = String(text ?? '').replace(/\s+/g, ' ').trim().match(/\S+ ?/g) || [];
  const lines = []; let line = '', cut = false;
  for (let tok of tokens) {
    if (g.measureText(line + tok.trimEnd()).width <= maxW) { line += tok; continue; }
    if (line.trim()) { lines.push(line.trimEnd()); line = ''; if (lines.length === maxLines) { cut = true; break; } }
    while (g.measureText(tok.trimEnd()).width > maxW) {
      let i = tok.length; while (i > 1 && g.measureText(tok.slice(0, i)).width > maxW) i--;
      lines.push(tok.slice(0, i)); tok = tok.slice(i);
      if (lines.length === maxLines) { cut = true; break; }
    }
    if (cut) break; line = tok.trimStart();
  }
  if (!cut && line.trim()) { if (lines.length < maxLines) lines.push(line.trimEnd()); else cut = true; }
  if (cut) { let l = lines[lines.length - 1] || ''; while (l && g.measureText(l + '…').width > maxW) l = l.slice(0, -1); lines[lines.length - 1] = l.trimEnd() + '…'; }
  return lines;
}

/** one line, cut with '…' when wider than maxW (the name) */
function ellipsize(g, s, maxW) {
  s = String(s ?? '');
  if (g.measureText(s).width <= maxW) return s;
  const chars = [...s];
  while (chars.length && g.measureText(chars.join('') + '…').width > maxW) chars.pop();
  return chars.join('') + '…';
}

function text(g, s, x, y, { size, bold = false, color = INK, align = 'left' }) {
  g.font = font(size, bold); g.fillStyle = color; g.textAlign = align; g.textBaseline = 'top';
  g.fillText(s, x, y);
}

/**
 * Draw the card into `out` (a 1080×1350 canvas, reused between themes).
 * input = { world (makeWorld), theme: 'day'|'sunset'|'night', avatar, groom, bride (avatar or Frames),
 *           name, side, sideLabel, message (already chosen: text · voice line · private line), line, couple, footer, url }
 * Returns what was drawn (for the demo test hook): { theme, name, side, msg: [lines], line, footer, url }
 */
export function drawCard(out, input) {
  out.width = CW; out.height = CH;
  const g = out.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.textBaseline = 'top';

  // ---- scene ----
  g.drawImage(input.world.canvas, CROP.x, CROP.y, CROP.w, CROP.h, 0, 0, CW, SCENE_H);
  if (input.theme === 'sunset') {
    const gr = g.createLinearGradient(0, 0, 0, SCENE_H);
    gr.addColorStop(0, '#ff9a6a'); gr.addColorStop(0.55, '#ffc58f'); gr.addColorStop(1, '#ffe0c0');
    g.save(); g.globalCompositeOperation = 'multiply'; g.globalAlpha = 0.75; g.fillStyle = gr; g.fillRect(0, 0, CW, SCENE_H); g.restore();
    g.save(); g.globalAlpha = 0.12; g.fillStyle = '#ff6f61'; g.fillRect(0, 0, CW, SCENE_H); g.restore();
  } else if (input.theme === 'night') {
    g.save(); g.globalCompositeOperation = 'multiply'; g.fillStyle = '#3d4686'; g.fillRect(0, 0, CW, SCENE_H); g.restore();
    g.save(); g.globalCompositeOperation = 'lighter';
    for (const [lx, ly] of input.world.lights) {
      const x = (lx - CROP.x) * K, y = (ly - CROP.y) * K;
      if (x < -80 || x > CW + 80 || y < -80 || y > SCENE_H + 80) continue;
      const rg = g.createRadialGradient(x, y, 4, x, y, 90);
      rg.addColorStop(0, 'rgba(255, 196, 120, .55)'); rg.addColorStop(1, 'rgba(255, 196, 120, 0)');
      g.fillStyle = rg; g.fillRect(x - 90, y - 90, 180, 180);
    }
    g.restore();
  }

  // the couple on the altar (×6) and me in front (×14), feet on soft shadows
  const shadow = (cx, cy, rx, ry) => { g.save(); g.fillStyle = 'rgba(30, 20, 40, .28)'; g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); g.fill(); g.restore(); };
  const put = (src, frame, k, cx, feet) => { const c = spriteCanvas(src, frame, k); g.drawImage(c, Math.round(cx - c.width / 2), Math.round(feet - c.height)); };
  shadow(500, 226, 42, 8); shadow(624, 226, 42, 8);
  put(input.groom, 'idle', 6, 500, 228); put(input.bride, 'idle', 6, 624, 228);
  shadow(540, 736, 120, 20);
  put(input.avatar, 'wave', 14, 540, 744);

  // ---- panel ----
  g.fillStyle = CREAM; g.fillRect(0, SCENE_H, CW, CH - SCENE_H);
  g.fillStyle = INK; g.fillRect(0, SCENE_H, CW, 8);
  g.fillStyle = '#ff9ec4'; g.fillRect(0, SCENE_H + 8, CW, 6);

  // name (one line, cut with …) + side chip
  g.font = font(30, true);
  const chipW = Math.ceil(g.measureText(input.sideLabel).width) + 40;
  const chipX = CW - 60 - chipW;
  g.font = font(58, true);
  const name = ellipsize(g, input.name, chipX - 60 - 24);
  text(g, name, 60, 796, { size: 58, bold: true });
  g.fillStyle = INK; g.fillRect(chipX - 4, 800, chipW + 8, 58);
  g.fillStyle = SIDE_COLOR[input.side] || SIDE_COLOR.both; g.fillRect(chipX, 804, chipW, 50);
  text(g, input.sideLabel, chipX + chipW / 2, 815, { size: 30, bold: true, color: '#fff', align: 'center' });

  // message bubble: max 3 lines
  const BX = 60, BY = 888, BW = CW - 120, BH = 196;
  g.fillStyle = INK; g.fillRect(BX - 6, BY - 6, BW + 12, BH + 12);
  g.fillStyle = '#fff'; g.fillRect(BX, BY, BW, BH);
  // the bubble's tail pointing up at the name: a stepped pixel triangle (ink outline, white inside, open into the bubble)
  g.fillStyle = INK; g.fillRect(BX + 36, BY - 12, 48, 6); g.fillRect(BX + 42, BY - 18, 36, 6); g.fillRect(BX + 48, BY - 24, 24, 6); g.fillRect(BX + 54, BY - 30, 12, 6);
  g.fillStyle = '#fff'; g.fillRect(BX + 42, BY - 12, 36, 12); g.fillRect(BX + 48, BY - 18, 24, 6); g.fillRect(BX + 54, BY - 24, 12, 6);
  g.font = font(40, false);
  const msg = input.message ? wrap(g, input.message, BW - 64, 3) : [];
  msg.forEach((l, i) => text(g, l, BX + 32, BY + 22 + i * 56, { size: 40 }));

  // phase line · couple + date · footer · QR
  g.font = font(42, true);
  text(g, ellipsize(g, input.line, 740), 60, 1112, { size: 42, bold: true, color: PINK });
  g.font = font(36, true);
  text(g, ellipsize(g, input.couple, 740), 60, 1186, { size: 36, bold: true });
  g.font = font(28, false);
  text(g, ellipsize(g, input.footer, 740), 60, 1252, { size: 28, color: MUTED });
  const qr = qrCanvas(input.url, { ecc: 'M', scale: 1, pad: 2 });
  const QS = Math.floor(184 / qr.width) * qr.width;            // whole modules only: crisp when printed
  g.fillStyle = INK; g.fillRect(CW - 60 - QS - 6, CH - 52 - QS - 6, QS + 12, QS + 12);
  g.drawImage(qr, CW - 60 - QS, CH - 52 - QS, QS, QS);

  // frame
  g.fillStyle = INK;
  g.fillRect(0, 0, CW, 12); g.fillRect(0, CH - 12, CW, 12); g.fillRect(0, 0, 12, CH); g.fillRect(CW - 12, 0, 12, CH);

  return { theme: input.theme, name, side: input.side, msg, line: input.line, footer: input.footer, url: input.url };
}

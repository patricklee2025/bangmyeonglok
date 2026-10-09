// WP-01 §4 — 픽셀 입장권 (720×1280, 세로). 외부 이미지 없이 사각형으로 그림 (05 §5). 같은 하객 = 같은 그림 (꽃잎은 gid 로 seed).
import { spriteCanvas, qrCanvas, canvasText, ensureFonts, guestCode, seeded } from '../../core/ui.js';
import { normalizeAvatar } from '../../avatar.js';
import { dateLine, venueLine, coupleNames, meUrl, sideOf } from './shared.js';

export const TICKET_W = 720, TICKET_H = 1280;
const INK = '#2b2033', INK2 = '#5a4d63', PAPER = '#fff8ec', PINK = '#e66b8f', PINK_L = '#ffd6e4';
const SIDE_COLOR = { groom: '#3d5a9e', bride: '#c45a86', both: '#6a4fa3' };

/** the little village behind the character: sky, a hanok roof line, grass, petals */
function drawScene(g, x, y, w, h, rand) {
  g.fillStyle = '#c9d6f2'; g.fillRect(x, y, w, h);
  g.fillStyle = '#e8d9f0'; g.fillRect(x, y + h * 0.42, w, h * 0.1);                  // haze over the horizon
  // hanok: wall, posts, then the roof with its upturned eaves
  const rx = x + 40, ry = y + h * 0.34, rw = w - 80;
  g.fillStyle = '#f4ead8'; g.fillRect(rx + 30, ry + 54, rw - 60, 70);
  g.fillStyle = '#8c6236'; for (let i = 0; i <= 5; i++) g.fillRect(rx + 30 + i * ((rw - 68) / 5), ry + 54, 8, 70);
  g.fillStyle = '#3b3346'; g.fillRect(rx + 10, ry + 34, rw - 20, 22); g.fillRect(rx + 40, ry + 18, rw - 80, 18); g.fillRect(rx + 90, ry + 6, rw - 180, 14);
  g.fillRect(rx, ry + 26, 20, 10); g.fillRect(rx + rw - 20, ry + 26, 20, 10);       // eaves tips
  g.fillStyle = '#5a5168'; g.fillRect(rx + 10, ry + 52, rw - 20, 4);
  // grass with darker tufts
  const gy = y + h * 0.62;
  g.fillStyle = '#7cb45a'; g.fillRect(x, gy, w, h - (gy - y));
  g.fillStyle = '#5e9a46'; for (let i = 0; i < 40; i++) g.fillRect(x + Math.floor(rand() * (w - 8)), gy + 8 + Math.floor(rand() * (h - (gy - y) - 16)), 8, 4);
  g.fillStyle = '#c9a36a'; g.fillRect(x + w / 2 - 70, gy, 140, h - (gy - y));          // the path to the door
  g.fillStyle = '#b98a5c'; for (let i = 0; i < 6; i++) g.fillRect(x + w / 2 - 60 + Math.floor(rand() * 112), gy + 12 + i * 22, 16, 6);
  // cherry petals
  for (let i = 0; i < 26; i++) { g.fillStyle = i % 3 ? '#ffd6e4' : '#f6a8c4'; g.fillRect(x + Math.floor(rand() * (w - 8)), y + Math.floor(rand() * (h * 0.6)), 8, 8); }
}

/**
 * 입장권 캔버스. who = { gid, name, side, avatar } · lang = 'ko' | 'en' · ctx 는 문구·설정(본식 시각)·주소용
 */
export async function drawTicket(ctx, who, lang) {
  await ensureFonts();
  const c = document.createElement('canvas'); c.width = TICKET_W; c.height = TICKET_H;
  const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
  const W = TICKET_W, en = lang === 'en';
  const T = (k, v) => ctx.t(k, v);                    // ctx.t follows the page language; the ticket is drawn in `lang` (same thing on a phone)

  // paper, frame, top band
  g.fillStyle = PAPER; g.fillRect(0, 0, W, TICKET_H);
  g.fillStyle = INK; g.fillRect(0, 0, W, 8); g.fillRect(0, TICKET_H - 8, W, 8); g.fillRect(0, 0, 8, TICKET_H); g.fillRect(W - 8, 0, 8, TICKET_H);
  g.fillStyle = PINK_L; g.fillRect(16, 16, W - 32, 4); g.fillRect(16, TICKET_H - 20, W - 32, 4); g.fillRect(16, 16, 4, TICKET_H - 32); g.fillRect(W - 20, 16, 4, TICKET_H - 32);
  g.fillStyle = PINK; g.fillRect(28, 28, W - 56, 84);
  canvasText(g, T('prereg_ticket_head'), W / 2, 52, { size: 34, bold: true, color: '#fff', align: 'center', maxWidth: W - 100 });

  // couple · date · venue
  const n = coupleNames(lang);
  canvasText(g, `${n.groom} ♥ ${n.bride}`, W / 2, 140, { size: 56, bold: true, color: INK, align: 'center', maxWidth: W - 100 });
  canvasText(g, dateLine(ctx, lang), W / 2, 222, { size: 32, color: INK2, align: 'center', maxWidth: W - 100 });
  const venue = venueLine();
  if (venue) canvasText(g, venue, W / 2, 268, { size: 24, color: INK2, align: 'center', maxWidth: W - 100, minSize: 14 });

  // the village box with the character (×8)
  const bx = 60, by = 318, bw = W - 120, bh = 480;
  g.fillStyle = INK; g.fillRect(bx - 6, by - 6, bw + 12, bh + 12);
  drawScene(g, bx, by, bw, bh, seeded(String(who.gid) + '|ticket'));
  const sp = spriteCanvas(normalizeAvatar(who.avatar || {}), 'idle', 8);
  g.fillStyle = 'rgba(30,40,20,.25)'; g.fillRect(W / 2 - 72, by + bh - 34, 144, 14);   // shadow
  g.drawImage(sp, Math.round(W / 2 - sp.width / 2), by + bh - 26 - sp.height);

  // name + side chip
  const side = sideOf(who), sideText = T('prereg_side_' + side);
  const nameText = en ? String(who.name) : `${who.name}님`;
  g.font = `bold 40px Galmuri11, sans-serif`;
  const chipW = Math.max(96, Math.ceil(g.measureText(sideText).width * 0.8) + 40);
  const used = canvasText(g, nameText, W / 2 - chipW / 2 - 8, 826, { size: 40, bold: true, color: INK, align: 'center', maxWidth: W - 160 - chipW });
  g.font = `bold ${used}px Galmuri11, sans-serif`;
  const nameW = Math.min(g.measureText(nameText).width, W - 160 - chipW);
  const chipX = Math.min(W - 60 - chipW, W / 2 - chipW / 2 - 8 + nameW / 2 + 16);
  g.fillStyle = SIDE_COLOR[side]; g.fillRect(chipX, 828, chipW, 40);
  canvasText(g, sideText, chipX + chipW / 2, 834, { size: 24, bold: true, color: '#fff', align: 'center', maxWidth: chipW - 12 });

  // perforation with notches
  g.fillStyle = PAPER; g.fillRect(0, 900, 28, 40); g.fillRect(W - 28, 900, 28, 40);
  g.fillStyle = INK; g.fillRect(0, 896, 30, 4); g.fillRect(0, 940, 30, 4); g.fillRect(26, 896, 4, 48); g.fillRect(W - 30, 896, 30, 4); g.fillRect(W - 30, 940, 30, 4); g.fillRect(W - 30, 896, 4, 48);
  g.fillStyle = INK2; for (let x = 44; x < W - 44; x += 24) g.fillRect(x, 918, 12, 4);

  // number + QR (opens this guest on any phone: core #me=)
  canvasText(g, T('prereg_ticket_no', { code: guestCode(who.gid) }), 60, 990, { size: 44, bold: true, color: INK });
  canvasText(g, T('prereg_ticket_code'), 60, 1046, { size: 22, color: INK2 });
  const url = meUrl(ctx, who.gid, who.name);
  const qr = qrCanvas(url, { ecc: 'M', scale: 1, pad: 2 });
  const qs = 200;
  g.fillStyle = '#fff'; g.fillRect(W - 60 - qs - 8, 962, qs + 16, qs + 16);
  g.drawImage(qr, W - 60 - qs, 970, qs, qs);
  canvasText(g, T('prereg_ticket_note'), W / 2, 1200, { size: 26, color: INK, align: 'center', maxWidth: W - 100 });
  c.dataset.url = url;                                  // tests read the link the QR carries (A4)
  return c;
}

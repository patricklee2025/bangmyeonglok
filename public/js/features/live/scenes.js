// ============================================================
//  WP-05 장면 12종 (§4) — 전부 ctx.v.runScene, 30초 이내 (maxSec 40). 같은 seed → TV·폰에서 같은 주민·같은 자리.
//  자리는 formation(가까운 순 배정 — 기기마다 다를 수 있음) 대신 s.crowd 순서대로 타일을 하나씩 줌 → 어디서나 같은 줄서기.
//  끝: 코어가 releaseAll · 신랑·신부는 home().
// ============================================================
const T = 16;
const ALTAR = { x: 248, y: 52 };                 // the couple's spot on the stage (world px)
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
// both sides of the carpet (carpet = tiles x 14–16, y 4–8): left column 13, right column 17
const SIDE_L = range(4, 13).map(y => [13, y]), SIDE_R = range(4, 13).map(y => [17, y]);
// rows facing the stage, left and right of the carpet
const HUSH = range(4, 9).flatMap(y => [...range(9, 13).map(x => [x, y]), ...range(17, 21).map(x => [x, y])]);
// a ring around the dance floor (tiles 18–22 × 10–13)
const RING = [...range(17, 23).map(x => [x, 9]), ...range(17, 23).map(x => [x, 14]), ...range(10, 13).map(y => [17, y]), ...range(10, 13).map(y => [23, y])];

/** crowd[i] → slots[i] (the same on every device) */
function line(list, slots, face) { list.forEach((h, i) => { const s = slots[i % slots.length], f = typeof face === 'function' ? face(s) : face; h.walkTo(s, f); }); }
const once = (s, key) => { s.fired = s.fired || new Set(); if (s.fired.has(key)) return false; s.fired.add(key); return true; };
const at = (s, sec, key = 't' + sec) => s.t >= sec && once(s, key);

/**
 * scene id → runScene definition (start/update) for these village tools.
 * tools = { v, dim(on), cake(on) } — dim: the slight navy veil of hush/rings · cake: the cake prop in front of the stage
 */
export function sceneDef(id, tools) {
  const { v } = tools;
  const [groom, bride] = v.couple();
  const fx = v.fx;
  const hearts = (x, y, n) => { for (let i = 0; i < n; i++) fx.heart(x + ((i * 7) % 17) - 8, y - (i % 3) * 4); };
  const D = {
    cheer: {
      start: s => { s.c = s.crowd(12); line(s.c.slice(0, 6), SIDE_L, 'up'); line(s.c.slice(6), SIDE_R, 'up'); },
      update: s => { if (at(s, 3)) { groom.hop(); groom.wave(); hearts(groom.x, groom.y - 30, 3); } if (s.t >= 7) s.done(); },
    },
    aisle: {
      start: s => {
        s.c = s.crowd(20);
        line(s.c.filter((_, i) => i % 2 === 0), SIDE_L, 'right'); line(s.c.filter((_, i) => i % 2 === 1), SIDE_R, 'left');
        bride.walkTo(258, 146, 80);                                       // to the banner first (quick), then up the aisle
      },
      update: s => {
        if (at(s, 2)) bride.walkTo(258, ALTAR.y, 12);                     // ~8 s up the carpet
        if (at(s, 10.5)) { bride.hop(); hearts(258, ALTAR.y - 30, 5); fx.sparkle(258, ALTAR.y - 20, 16); groom.wave(); }
        if (s.t >= 13) s.done();
      },
      end: () => { bride.home(); },
    },
    hush: {
      start: s => { tools.dim(true); s.c = s.crowd(40); line(s.c, HUSH, 'up'); groom.face('right'); bride.face('left'); },
      update: s => { if (s.t >= 14) s.done(); },
      end: () => tools.dim(false),
    },
    rings: {
      start: s => { tools.dim(true); s.c = s.crowd(40); line(s.c, HUSH, 'up'); groom.face('right'); bride.face('left'); },
      update: s => {
        if (at(s, 3)) fx.sparkle(ALTAR.x, ALTAR.y - 22, 14);
        if (at(s, 6)) { fx.sparkle(ALTAR.x, ALTAR.y - 22, 14); fx.heart(ALTAR.x, ALTAR.y - 30); }
        if (s.t >= 10) s.done();
      },
      end: () => tools.dim(false),
    },
    kiss: {
      start: s => { s.c = s.crowd(30); line(s.c, HUSH, 'up'); groom.face('right'); bride.face('left'); },
      update: s => {
        if (at(s, 1)) { hearts(ALTAR.x, ALTAR.y - 30, 20); fx.confetti(ALTAR.x, ALTAR.y - 40, 60); s.c.forEach(h => h.hop()); groom.hop(); bride.hop(); }
        if (at(s, 2.5)) s.c.forEach(h => h.hop());
        if (s.t >= 7) s.done();
      },
    },
    sway: {
      start: s => { s.c = s.crowd(30); s.c.forEach(h => h.hold('left')); s.side = 'left'; s.next = 0.6; },
      update: s => {
        if (s.t >= s.next) { s.side = s.side === 'left' ? 'right' : 'left'; s.next += 0.6; s.c.forEach(h => h.hold(s.side)); groom.face(s.side); bride.face(s.side); }
        if (at(s, 1)) fx.note(ALTAR.x - 10, ALTAR.y - 30);
        if (at(s, 4)) fx.note(ALTAR.x + 10, ALTAR.y - 30);
        if (at(s, 8)) fx.note(ALTAR.x, ALTAR.y - 34);
        if (s.t >= 15) s.done();
      },
    },
    recessional: {
      start: s => { s.c = s.crowd(20); line(s.c.filter((_, i) => i % 2 === 0), SIDE_L, 'right'); line(s.c.filter((_, i) => i % 2 === 1), SIDE_R, 'left'); groom.walkTo(240, 140, 16); bride.walkTo(258, 140, 16); },
      update: s => {
        if (at(s, 1)) s.c.forEach(h => h.icon('👏', 5));
        if (s.t > 1 && s.t < 12 && Math.floor(s.t * 2) !== s.petal) { s.petal = Math.floor(s.t * 2); fx.sparkle(249, Math.min(140, ALTAR.y + s.t * 15), 4); }
        if (at(s, 6.5)) { groom.walkTo(240, ALTAR.y, 16); bride.walkTo(258, ALTAR.y, 16); s.c.forEach(h => h.icon('👏', 5)); }
        if (s.t >= 13) s.done();
      },
      end: () => { groom.home(); bride.home(); },
    },
    feast: {
      start: s => { s.c = s.crowd(20); const eat = v.SP().eat; line(s.c, eat.length ? eat : HUSH, 'up'); },
      update: s => { for (const k of [2, 8, 14, 20]) if (at(s, k)) s.c.forEach(h => h.icon('🍽', 3)); if (s.t >= 25) s.done(); },
    },
    cheers: {
      start: s => { s.c = s.crowd(40); s.c.forEach(h => h.hold('down')); },
      update: s => {
        if (at(s, 0.5)) { s.c.forEach(h => h.hop()); groom.hop(); bride.hop(); fx.fireworks(3); }
        if (at(s, 1.6)) { s.c.forEach(h => { h.hop(); h.icon('🥂', 2); }); }
        if (s.t >= 5) s.done();
      },
    },
    firstdance: {
      start: s => { s.c = s.crowd(24); line(s.c, RING, 'down'); groom.walkTo(320, 196, 30); bride.walkTo(338, 196, 30); },
      update: s => {
        if (s.t > 4 && s.t < 19 && Math.floor(s.t / 0.8) !== s.beat) {
          s.beat = Math.floor(s.t / 0.8);
          const a = s.beat % 2 ? 'right' : 'up', b = s.beat % 2 ? 'left' : 'up';
          groom.face(a); bride.face(b);
          if (s.beat % 3 === 0) fx.note(329, 170);
        }
        if (at(s, 19)) { hearts(329, 170, 8); groom.walkTo(240, ALTAR.y, 30); bride.walkTo(258, ALTAR.y, 30); }
        if (s.t >= 24) s.done();
      },
      end: () => { groom.home(); bride.home(); },
    },
    cake: {
      start: s => { tools.cake(true); s.c = s.crowd(20); line(s.c, HUSH, 'up'); groom.face('right'); bride.face('left'); },
      update: s => {
        if (at(s, 2)) fx.sparkle(ALTAR.x, ALTAR.y + 14, 16);
        if (at(s, 3.5)) hearts(ALTAR.x, ALTAR.y - 30, 8);
        if (s.t >= 8) s.done();
      },
      end: () => tools.cake(false),
    },
    bow: {
      start: () => { groom.face('down'); bride.face('down'); },
      update: s => {
        for (const k of [1, 3.5]) if (at(s, k, 'down' + k)) { groom.walkTo(240, ALTAR.y + 3, 6); bride.walkTo(258, ALTAR.y + 3, 6); }
        for (const k of [2.2, 4.7]) if (at(s, k, 'up' + k)) { groom.walkTo(240, ALTAR.y, 6); bride.walkTo(258, ALTAR.y, 6); }
        if (at(s, 5.5)) { groom.face('down'); bride.face('down'); hearts(ALTAR.x, ALTAR.y - 30, 4); }
        if (s.t >= 7) s.done();
      },
      end: () => { groom.home(); bride.home(); },
    },
  };
  return D[id] || null;
}

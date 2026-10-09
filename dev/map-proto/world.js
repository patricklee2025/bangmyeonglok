// ============================================================
//  v5 map prototype — 한옥 마을 × 올랜도 호숫가, a tall village for vertical swiping
//  24 × 56 tiles of 16 px = 384 × 896 world px. Original art drawn in code (no image files).
//  North → south: 일월오봉 backdrop · hill pavilion · hanok compound · 혼례 마당 · 정자나무 plaza ·
//  잔치 마당 · 방지원도 lotus pond · Orlando lakeside. A stream runs down the east side the whole way.
// ============================================================
export const TILE = 16, TW = 24, TH = 56, W = TW * TILE, H = TH * TILE;
const T = TILE;

export const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const cv = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
function ellipse(g, cx, cy, rx, ry, col) { g.fillStyle = col; for (let y = -ry; y <= ry; y++) { const w = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry)))); g.fillRect(Math.round(cx - w), Math.round(cy + y), w * 2 + 1, 1); } }
function pen(c) {
  const g = c.getContext('2d');
  return { g, R: (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); }, P: (x, y, col) => { g.fillStyle = col; g.fillRect(x, y, 1, 1); }, E: (cx, cy, rx, ry, col) => ellipse(g, cx, cy, rx, ry, col) };
}
const inR = (x, y, r) => x >= r[0] && x < r[2] && y >= r[1] && y < r[3];

// ---------------- zones (tile rects, end-exclusive) ----------------
export const Z = {
  sky: [0, 0, 24, 3], hill: [0, 3, 24, 6], pavilion: [3, 3, 7, 6], falls: [19, 3, 23, 5],
  compound: [2, 6, 17, 15], anchae: [3, 7, 10, 10], sarang: [11, 8, 15, 10], jangdok: [13, 10, 16, 12], gate: [10, 13, 14, 15],
  bamboo: [22, 5, 24, 16],
  madang: [4, 15, 19, 26], screen: [9, 16, 15, 17], chorye: [10, 18, 14, 19], carpet: [11, 19, 13, 26], mat1: [5, 21, 10, 24], mat2: [14, 21, 18, 24],
  plaza: [7, 26, 17, 33], zelkova: [2, 26, 7, 31], well: [11, 28, 13, 30], board: [15, 26, 17, 27],
  feast: [1, 34, 10, 42], table1: [2, 35, 9, 36], table2: [2, 38, 9, 39], dance: [12, 35, 18, 41],
  pond: [2, 42, 12, 48], dock: [15, 48, 17, 54], photo: [1, 48, 5, 49],
};
// camera stops for the zone chips / the TV tour (world px centre + label)
export const STOPS = [
  { id: 'hanok', ko: '한옥', icon: '🏯', x: 9 * T, y: 10 * T },
  { id: 'wedding', ko: '혼례', icon: '💒', x: 12 * T, y: 20.5 * T },
  { id: 'plaza', ko: '광장', icon: '🌳', x: 11 * T, y: 29.5 * T },
  { id: 'feast', ko: '잔치', icon: '🍶', x: 10 * T, y: 38 * T },
  { id: 'pond', ko: '연못', icon: '🪷', x: 8 * T, y: 45 * T },
  { id: 'lake', ko: '호숫가', icon: '🦩', x: 13 * T, y: 51.5 * T },
];

// ---------------- water ----------------
export const streamX = y => 20.9 * T + 0.8 * T * Math.sin(y / 52) + 0.35 * T * Math.sin(y / 19 + 1.3);
const streamHW = y => 0.86 * T + 0.12 * T * Math.sin(y / 31);
const STREAM_TOP = 4.1 * T;
export const lakeTop = x => 49.3 * T + 0.5 * T * Math.sin(x / 37 + 0.4) + Math.max(0, 10 * T - x) * 0.82;
const POND = [2 * T + 3, 42 * T + 5, 12 * T - 3, 48 * T - 3];
export const ISLAND = { x: 6.5 * T, y: 45 * T, r: 1.8 * T };
const onIsland = (px, py) => { const dx = px - ISLAND.x, dy = (py - ISLAND.y) * 1.2; return dx * dx + dy * dy < ISLAND.r * ISLAND.r; };
const inPondRect = (px, py) => {
  if (px < POND[0] || px >= POND[2] || py < POND[1] || py >= POND[3]) return false;
  const k = 6, cx = Math.min(Math.max(px, POND[0] + k), POND[2] - k - 1), cy = Math.min(Math.max(py, POND[1] + k), POND[3] - k - 1);   // rounded corners
  return (px - cx) ** 2 + (py - cy) ** 2 <= k * k;
};
export const isLake = (px, py) => py >= lakeTop(px);
export const isStream = (px, py) => py >= STREAM_TOP && py < lakeTop(px) + 10 && Math.abs(px - streamX(py)) < streamHW(py);
export const isPond = (px, py) => inPondRect(px, py) && !onIsland(px, py);
export const isWater = (px, py) => isLake(px, py) || isStream(px, py) || isPond(px, py);
// bridges & stepping stones over the stream (tile rows) and the plank bridge to the island
const BRIDGES = [{ y: 12, kind: 'plank' }, { y: 22, kind: 'stones' }, { y: 31, kind: 'arch' }, { y: 40, kind: 'stones' }];
const ISLAND_BRIDGE = [[9, 45], [10, 45], [11, 45]];

// ---------------- paths ----------------
const PATH = new Set();
const line = (x0, y0, x1, y1) => { for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) PATH.add(x + ',' + y); };
line(11, 13, 12, 15); line(7, 15, 16, 15); line(7, 15, 7, 20); line(16, 15, 16, 20); line(7, 20, 16, 20);   // gate → around the screen → the carpet front
line(1, 6, 1, 26); line(1, 4, 7, 4); line(1, 15, 6, 15);                                              // west lane up to the pavilion
line(17, 5, 17, 25); line(17, 25, 16, 25); line(13, 5, 18, 5);                                         // east lane by the stream, up to the falls
line(11, 33, 12, 34); line(10, 34, 11, 41); line(10, 41, 14, 41); line(13, 41, 14, 48); line(13, 48, 16, 48);   // plaza → feast → pond → dock
line(1, 26, 7, 26); line(17, 26, 18, 31); line(18, 31, 23, 31);                                     // plaza ring + arch bridge to the east bank
line(7, 4, 18, 4);
export const isPath = (tx, ty) => PATH.has(tx + ',' + ty) || inR(tx, ty, Z.plaza);

// ---------------- props placement ----------------
const PINES = [[0, 3], [8, 3], [10, 4], [15, 3], [23, 3], [0, 7], [0, 12], [0, 20], [23, 18], [0, 33], [23, 26]];
const CHERRY = [[2, 17], [3, 23], [0, 29], [23, 21], [23, 34], [23, 40], [13, 43], [1, 41], [0, 46], [12, 47], [23, 45], [20, 47]];
const AZALEA = [[11, 3], [13, 4], [2, 5], [8, 5], [5, 16], [18, 17], [9, 25], [14, 25], [16, 33], [9, 33], [1, 36], [19, 37]];
const PALMS = [[2, 51], [5, 50], [7, 53], [1, 54], [10, 52]];
const LANTERNS = [[8, 19], [15, 19], [7, 26], [16, 26], [7, 32], [16, 32], [11, 34], [18, 35], [18, 40], [14, 42]];

// ---------------- walk grid ----------------
export function buildWalk() {
  const g = Array.from({ length: TH }, () => new Array(TW).fill(true));
  const block = r => { for (let y = r[1]; y < r[3]; y++) for (let x = r[0]; x < r[2]; x++) if (g[y]) g[y][x] = false; };
  for (let x = 0; x < TW; x++) { g[0][x] = g[1][x] = g[2][x] = g[3][x] = false; g[TH - 1][x] = false; }
  for (let y = 0; y < TH; y++) { g[y][0] = false; g[y][TW - 1] = false; }
  // compound wall ring (gate opening x 11–12)
  const [a, b, c, d] = Z.compound;
  for (let x = a; x < c; x++) { g[b][x] = false; if (x < 11 || x > 12) g[d - 1][x] = false; }
  for (let y = b; y < d; y++) { g[y][a] = false; g[y][c - 1] = false; }
  [Z.anchae, Z.sarang, Z.jangdok, [3, 4, 7, 5], Z.falls, Z.bamboo, Z.screen, Z.chorye, Z.well, Z.board, Z.table1, Z.table2, [10, 13, 11, 15], [13, 13, 14, 15]].forEach(block);
  for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) {
    let wet = 0; for (const [ox, oy] of [[4, 4], [12, 4], [4, 12], [12, 12], [8, 8]]) if (isWater(x * T + ox, y * T + oy)) wet++;
    if (wet >= 2) g[y][x] = false;
  }
  for (const br of BRIDGES) for (let x = 15; x < TW - 1; x++) if (isStream(x * T + 8, br.y * T + 8) || isStream(x * T + 2, br.y * T + 8) || isStream(x * T + 14, br.y * T + 8)) g[br.y][x] = true;
  ISLAND_BRIDGE.forEach(([x, y]) => { g[y][x] = true; });
  for (let y = Z.dock[1]; y < Z.dock[3]; y++) for (let x = Z.dock[0]; x < Z.dock[2]; x++) g[y][x] = true;
  [...PINES, ...CHERRY, ...PALMS, [4, 12], [4, 30]].forEach(([x, y]) => { if (g[y]) g[y][x] = false; });
  g[10][6] = true;                                                     // the 안채 door step
  for (let x = 10; x < 14; x++) g[19][x] = g[20][x] = false;            // the couple's spot in front of the ceremony table stays clear
  return g;
}

// ---------------- activity spots ----------------
export function spots(walk) {
  const ok = (x, y) => walk[y]?.[x];
  const inside = r => { const out = []; for (let y = r[1]; y < r[3]; y++) for (let x = r[0]; x < r[2]; x++) if (ok(x, y)) out.push([x, y]); return out; };
  const near = (r, ring = 1) => { const out = []; for (let y = r[1] - ring; y < r[3] + ring; y++) for (let x = r[0] - ring; x < r[2] + ring; x++) if (ok(x, y) && !inR(x, y, r)) out.push([x, y]); return out; };
  return {
    sit: [...inside(Z.mat1), ...inside(Z.mat2)],
    chat: [...near(Z.well, 1), ...inside([2, 30, 7, 32])],
    eat: [...near(Z.table1, 1), ...near(Z.table2, 1)],
    dance: inside(Z.dance),
    pond: [...inside([5, 44, 9, 47]), ...ISLAND_BRIDGE],
    fish: inside([15, 50, 17, 54]),
    beach: inside([1, 50, 9, 55]),
    yard: inside([3, 11, 12, 14]),
    hill: inside([1, 4, 18, 6]),
    walk: inside([1, 4, TW - 1, TH - 1]),
    gate: [11, 15],
  };
}

// ============================================================
//  GROUND
// ============================================================
export function buildGround() {
  const c = cv(W, H), { g, R, P, E } = pen(c);
  const r = rng(11);

  // grass: two greens per tile, darker in the north (hill shade), tufts and spring flowers
  for (let ty = 0; ty < TH; ty++) for (let tx = 0; tx < TW; tx++) {
    const v = (tx * 7 + ty * 13) % 5;
    R(tx * T, ty * T, T, T, v === 0 ? '#6fb04a' : '#74b64c');
  }
  for (let i = 0; i < 2600; i++) {
    const x = Math.floor(r() * W), y = Math.floor(r() * H), col = r() < 0.62 ? '#5d9c3b' : '#92cd5f';
    P(x, y, col); P(x + 1, y - 1, col); if (r() < 0.5) P(x + 2, y, col);
  }
  for (let i = 0; i < 520; i++) {
    const x = Math.floor(r() * W), y = Math.floor(r() * H), col = ['#ffffff', '#ffe066', '#ff9ec4', '#ffd0e0', '#b9a2ff'][Math.floor(r() * 5)];
    P(x, y, col); P(x, y + 1, '#4f8a33');
  }

  // compound yard (마당) — packed clay with rake marks
  { const [a, b, c2, d] = Z.compound.map(v => v * T);
    for (let y = b; y < d; y++) for (let x = a; x < c2; x++) P(x, y, (x * 3 + y * 7) % 13 === 0 ? '#cfb184' : (x + y * 2) % 29 === 0 ? '#e8d3ac' : '#dcc196');
    // 화단 (flower bed) by the 안채
    R(6 * T, 12 * T + 2, 3 * T, T - 4, '#7a4f2e'); for (let x = 6 * T + 2; x < 9 * T - 2; x += 4) { P(x, 12 * T + 5, '#e8463c'); P(x + 2, 12 * T + 8, '#ffd75e'); P(x + 1, 12 * T + 11, '#ff9ec4'); P(x, 12 * T + 9, '#4f8a33'); } }

  // 혼례 마당 — fine pale sand, lightly raked
  { const [a, b, c2, d] = Z.madang.map(v => v * T);
    for (let y = b; y < d; y++) for (let x = a; x < c2; x++) {
      const edge = Math.min(x - a, c2 - 1 - x, y - b, d - 1 - y);
      if (edge < 3 && ((x * 13 + y * 7) % 5) > edge + 1) continue;           // ragged edge into the grass
      P(x, y, (y % 6 === 0 && x % 3) ? '#e2cc9f' : (x * 5 + y * 3) % 17 === 0 ? '#dcc497' : '#ecdbb3');
    } }

  // stone paths (박석 flagstones)
  const stone = (tx, ty) => {
    const x0 = tx * T, y0 = ty * T; R(x0, y0, T, T, '#b4aa92');
    const rr = rng(tx * 31 + ty * 17);
    for (let k = 0; k < 5; k++) {
      const sx = x0 + 1 + Math.floor(rr() * 10), sy = y0 + 1 + Math.floor(rr() * 10), sw = 4 + Math.floor(rr() * 3), sh = 3 + Math.floor(rr() * 2);
      R(sx, sy, sw, sh, '#d6ccb3'); R(sx, sy + sh - 1, sw, 1, '#bfb293'); R(sx, sy, sw, 1, '#e7dfca');
    }
    if (rr() < 0.3) P(x0 + Math.floor(rr() * 14), y0 + Math.floor(rr() * 14), '#7fae4f');      // a weed in the grout
  };
  for (let ty = 3; ty < TH; ty++) for (let tx = 0; tx < TW; tx++) if (isPath(tx, ty) && !inR(tx, ty, Z.carpet)) stone(tx, ty);
  // plaza ring kerb
  { const [a, b, c2, d] = Z.plaza.map(v => v * T); R(a, b, c2 - a, 1, '#8f866f'); R(a, d - 1, c2 - a, 1, '#8f866f'); R(a, b, 1, d - b, '#8f866f'); R(c2 - 1, b, 1, d - b, '#8f866f'); }

  // 돗자리 mats (guest seating) — woven stripes with a red border
  [Z.mat1, Z.mat2].forEach(m => { const [a, b, c2, d] = m.map(v => v * T);
    R(a, b, c2 - a, d - b, '#d9c27a'); for (let y = b + 1; y < d; y += 2) R(a, y, c2 - a, 1, '#c7ad62');
    R(a, b, c2 - a, 2, '#b8323f'); R(a, d - 2, c2 - a, 2, '#b8323f'); R(a, b, 2, d - b, '#b8323f'); R(c2 - 2, b, 2, d - b, '#b8323f'); });

  // 청홍 carpet — blue and red halves (the wedding colours)
  { const [a, b, c2, d] = Z.carpet.map(v => v * T), mid = (a + c2) / 2;
    R(a + 2, b - 4, mid - a - 2, d - b + 4, '#3d5fae'); R(mid, b - 4, c2 - mid - 2, d - b + 4, '#c23a45');
    R(a + 2, b - 4, 1, d - b + 4, '#e8c35e'); R(c2 - 3, b - 4, 1, d - b + 4, '#e8c35e');
    for (let y = b; y < d; y += 5) { P(a + 6, y, '#9fb4e6'); P(c2 - 7, y + 2, '#ff9eb0'); P(mid - 1, y + 3, '#f3e7c9'); } }

  // feast ground: 멍석 straw mats under the tables
  [[1, 34, 10, 37], [1, 37, 10, 40]].forEach(m => { const [a, b, c2, d] = m.map(v => v * T);
    for (let y = b + 2; y < d - 2; y++) for (let x = a + 2; x < c2 - 2; x++) P(x, y, ((x >> 1) + (y >> 1)) % 2 ? '#c9a960' : '#d6b86c'); });
  // dance yard: packed earth circle with an 오방색 dotted ring
  { const [a, b, c2, d] = Z.dance.map(v => v * T), cx = (a + c2) / 2, cy = (b + d) / 2, rx = (c2 - a) / 2, ry = (d - b) / 2;
    E(cx, cy + 1, rx, ry, '#c9a777'); E(cx, cy, rx, ry, '#d9bb8a'); E(cx, cy, rx - 6, ry - 6, '#e2c79a');
    const OB = ['#3d63b8', '#d23d4b', '#f3c34f', '#f7f3ea', '#2b2033'];
    for (let k = 0; k < 40; k++) { const t = k / 40 * Math.PI * 2; R(Math.round(cx + Math.cos(t) * (rx - 3)) - 1, Math.round(cy + Math.sin(t) * (ry - 3)) - 1, 2, 2, OB[k % 5]); } }

  // hill top: rocky outcrop and a dirt clearing in front of the pavilion
  E(5 * T, 5 * T + 6, 2.6 * T, 0.9 * T, '#d7bf91');

  // ---- water: stream, pond, lake (+ sand and pebble banks)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const lake = isLake(x, y), st = !lake && isStream(x, y), pd = !lake && !st && isPond(x, y);
    if (lake) {
      const depth = y - lakeTop(x);
      let col = depth < 5 ? '#8fd3ef' : depth < 14 ? '#64b8e3' : depth < 40 ? '#4fa6da' : '#3f93cc';
      if (depth < 5 && (x + y) % 4 === 0) col = '#c6ecf8';
      P(x, y, col);
    } else if (st) {
      const d = Math.abs(x - streamX(y)) / streamHW(y);
      P(x, y, d > 0.78 ? '#7ccbea' : d > 0.45 ? '#5fb6e2' : '#4aa2d6');
      if (d < 0.5 && (x * 7 + y * 3) % 23 === 0) P(x, y, '#bfe8f7');
    } else if (pd) {
      P(x, y, (x * 3 + y * 5) % 19 === 0 ? '#5fa9a0' : '#4b968f');           // greener pond water
    } else if (y >= STREAM_TOP && Math.abs(x - streamX(y)) < streamHW(y) + 3 && y < lakeTop(x)) {
      P(x, y, (x * 5 + y * 3) % 4 === 0 ? '#a69d8a' : (x + y) % 3 === 0 ? '#c8bfac' : '#b7ae99');   // pebble bank
    } else if (y >= lakeTop(x) - 9) {
      P(x, y, (x * 5 + y * 3) % 7 === 0 ? '#dcc185' : '#efd9a3');             // beach
    }
  }
  // beach: wider sand on the west (Florida corner)
  for (let y = 47 * T; y < H; y++) for (let x = 0; x < 11 * T; x++) if (!isWater(x, y) && y > 47 * T + (x / 3) - 6 + 6 * Math.sin(x / 13)) P(x, y, (x * 5 + y * 3) % 9 === 0 ? '#e3c98e' : '#f1dcaa');
  // pond: long cut stone edge (장대석) and the round island
  { const [a, b, c2, d] = POND;
    for (let x = a - 3; x < c2 + 3; x += 8) { R(x, b - 4, 7, 3, '#c9c2b2'); R(x, b - 2, 7, 1, '#9d968a'); R(x, d, 7, 3, '#c9c2b2'); R(x, d + 2, 7, 1, '#9d968a'); }
    for (let y = b - 2; y < d + 2; y += 8) { R(a - 4, y, 3, 7, '#c9c2b2'); R(a - 2, y, 1, 7, '#9d968a'); R(c2, y, 3, 7, '#c9c2b2'); R(c2 + 2, y, 1, 7, '#9d968a'); }
    E(ISLAND.x, ISLAND.y + 3, ISLAND.r + 2, ISLAND.r / 1.2 + 2, '#9d968a'); E(ISLAND.x, ISLAND.y + 1, ISLAND.r + 1, ISLAND.r / 1.2 + 1, '#c9c2b2'); E(ISLAND.x, ISLAND.y, ISLAND.r - 1, ISLAND.r / 1.2 - 1, '#79b84e');
    // lotus leaves and flowers
    const lr = rng(42);
    for (let i = 0; i < 26; i++) {
      const x = a + 6 + Math.floor(lr() * (c2 - a - 12)), y = b + 6 + Math.floor(lr() * (d - b - 12));
      if (!isPond(x - 4, y) || !isPond(x + 4, y) || !isPond(x, y - 3) || !isPond(x, y + 3)) continue;
      E(x, y, 4, 3, '#3f8f45'); E(x - 1, y - 1, 3, 2, '#5cad52'); P(x + 2, y, '#2f6f37');
      if (lr() < 0.45) { P(x, y - 3, '#ff9ec4'); P(x - 1, y - 2, '#f27aa6'); P(x + 1, y - 2, '#f27aa6'); P(x, y - 2, '#ffe9f2'); }
    } }
  // island plank bridge (붉은 난간 arched bridge)
  { const y0 = 45 * T + 3; R(8 * T + 4, y0, 4 * T - 7, 10, '#a8743f'); for (let x = 8 * T + 4; x < 12 * T - 3; x += 3) R(x, y0, 1, 10, '#8a5a32');
    R(8 * T + 4, y0 - 2, 4 * T - 7, 2, '#c4473f'); R(8 * T + 4, y0 + 10, 4 * T - 7, 2, '#a3362f'); }

  // stream crossings
  for (const br of BRIDGES) {
    const y0 = br.y * T, x0 = Math.round(streamX(y0 + 8) - streamHW(y0 + 8)) - 4, x1 = Math.round(streamX(y0 + 8) + streamHW(y0 + 8)) + 4;
    if (br.kind === 'stones') { for (let x = x0 + 3; x < x1 - 2; x += 7) { E(x + 2, y0 + 9, 3, 2, '#7d776c'); E(x + 2, y0 + 8, 3, 2, '#c4bfb4'); P(x + 1, y0 + 7, '#e6e2d8'); } }
    else if (br.kind === 'plank') { R(x0, y0 + 2, x1 - x0, 12, '#b98a5c'); for (let x = x0; x < x1; x += 4) { R(x, y0 + 2, 1, 12, '#8c6236'); } R(x0, y0 + 13, x1 - x0, 2, '#6e4528'); }
    else { R(x0 - 2, y0 + 1, x1 - x0 + 4, 14, '#bdb6a8'); for (let x = x0 - 2; x < x1 + 2; x += 5) R(x, y0 + 1, 1, 14, '#9d968a'); R(x0 - 2, y0, x1 - x0 + 4, 2, '#e6e2d8'); R(x0 - 2, y0 + 14, x1 - x0 + 4, 2, '#857e72'); }
  }

  // dock planks (over the lake)
  { const [a, b, c2, d] = Z.dock.map(v => v * T);
    for (let y = b; y < d; y += 4) { R(a, y, c2 - a, 3, '#b98a5c'); R(a, y, c2 - a, 1, '#d1a273'); R(a, y + 3, c2 - a, 1, '#8c6236'); }
    [[a, d - 2], [c2 - 3, d - 2], [a, b + 20], [c2 - 3, b + 20]].forEach(([x, y]) => R(x, y, 3, 5, '#5a3a22')); }

  // ---- the backdrop: 일월오봉 (sun, moon and five peaks) as the northern edge of the world
  paintPeaks(c);
  return c;
}

function paintPeaks(c) {
  const { R, P, E } = pen(c), h = 3 * T + 6;
  // sky
  for (let y = 0; y < h; y++) R(0, y, W, 1, y < 14 ? '#f3e9d2' : y < 28 ? '#efe3c8' : '#e9dcbd');
  // five peaks: tall centre, two pairs; layered blue-green with pale ridges (the royal screen's palette)
  const peaks = [[W * 0.5, 4, 70], [W * 0.27, 12, 62], [W * 0.73, 12, 62], [W * 0.08, 20, 50], [W * 0.92, 20, 50]];
  for (let y = 0; y < h + 8; y++) for (let x = 0; x < W; x++) {
    let top = 99;
    for (const [px, py, half] of peaks) { const dx = Math.abs(x - px) / half; if (dx < 1) top = Math.min(top, py + (h + 6 - py) * Math.pow(dx, 1.35)); }
    if (y < top) continue;
    const d = y - top, col = d < 2 ? '#d7e6d0' : d < 5 ? '#6fa58f' : (x + y * 2) % 11 === 0 ? '#2f6d63' : y > h - 6 ? '#2c5f4f' : '#3a7a6c';
    P(x, y, col);
  }
  // waterfalls between peaks
  [W * 0.385, W * 0.615].forEach(x => { for (let y = 24; y < h; y++) { P(Math.round(x), y, '#f7fbff'); P(Math.round(x) + 1, y, y % 3 ? '#cfe6f4' : '#ffffff'); } });
  // red sun (left) and white moon (right)
  E(W * 0.17, 12, 7, 7, '#c8433f'); E(W * 0.17 - 2, 10, 3, 3, '#e86a5f');
  E(W * 0.83, 12, 7, 7, '#f7f3ea'); E(W * 0.83 + 2, 10, 3, 3, '#ffffff');
  // ridge mist and the hill foot
  for (let x = 0; x < W; x++) { const y = h - 2 + Math.round(2 * Math.sin(x / 17)); R(x, y, 1, 4, '#4f8d58'); P(x, y, '#6fae5f'); }
  // pine silhouettes on the ridge
  const pr = rng(77);
  for (let x = 6; x < W; x += 14 + Math.floor(pr() * 10)) {
    const y = h - 3, hh = 8 + Math.floor(pr() * 6);
    R(x, y - hh, 1, hh, '#8a4b33'); [[0, hh - 2, 4], [1, hh - 5, 3], [0, hh - 8, 2]].forEach(([dx, dy, w]) => { if (dy > 0) { R(x - w + dx, y - dy, w * 2 + 1, 2, '#24503a'); R(x - w + dx, y - dy, w * 2 + 1, 1, '#3f7a52'); } });
  }
}

// ============================================================
//  PROPS (y-sorted with characters). Each: { img, x, y, base, kind, light? }
// ============================================================
export function buildProps() {
  const out = [];
  const add = (img, x, y, base, kind, extra = {}) => out.push({ img, x: Math.round(x), y: Math.round(y), base, kind, ...extra });
  const at = (img, tx, ty, kind, extra) => add(img, tx * T + 8 - img.width / 2, ty * T + 14 - img.height, ty * T + 14, kind, extra);

  // hill: pavilion, falls, trees and azaleas
  { const img = pavilionImg(false); add(img, Z.pavilion[0] * T + 32 - img.width / 2, 6 * T - img.height, 6 * T - 2, 'pavilion'); }
  add(fallsImg(), 18 * T + 6, 2 * T + 10, 5 * T, 'falls');
  const tr = rng(9);
  PINES.forEach(([x, y]) => at(pineImg(tr), x, y, 'tree'));
  CHERRY.forEach(([x, y]) => at(cherryImg(tr), x, y, 'tree'));
  PALMS.forEach(([x, y]) => at(palmImg(tr), x, y, 'tree'));
  AZALEA.forEach(([x, y]) => at(bushImg(tr, ['#e0559a', '#f27aa6', '#c64186'][Math.floor(tr() * 3)]), x, y, 'bush'));

  // hanok compound
  { const [a, b, c2, d] = Z.compound;
    for (let x = a; x < c2; x++) add(wallH(x), x * T, b * T - 8, b * T + 8, 'wall');                          // north wall
    for (let x = a; x < c2; x++) if (x < 10 || x > 13) add(wallH(x), x * T, (d - 1) * T - 8, (d - 1) * T + 14, 'wall');   // south wall (gate gap)
    for (let y = b + 1; y < d - 1; y++) { add(wallV(), a * T + 2, y * T - 8, y * T + 14, 'wall'); add(wallV(), (c2 - 1) * T + 2, y * T - 8, y * T + 14, 'wall'); } }
  { const img = anchaeImg(); add(img, Z.anchae[0] * T + (Z.anchae[2] - Z.anchae[0]) * 8 - img.width / 2, Z.anchae[3] * T - img.height + 4, Z.anchae[3] * T, 'house'); }
  { const img = sarangImg(); add(img, Z.sarang[0] * T + 32 - img.width / 2, Z.sarang[3] * T - img.height + 3, Z.sarang[3] * T, 'house'); }
  { const img = gateImg(); add(img, Z.gate[0] * T + 32 - img.width / 2, 15 * T - img.height, 15 * T - 1, 'gate'); }
  { const img = jangdokImg(); add(img, Z.jangdok[0] * T - 6, Z.jangdok[3] * T - img.height + 4, Z.jangdok[3] * T, 'jangdok'); }
  at(persimmonImg(tr), 4, 12, 'tree');
  for (let y = 5; y < 16; y += 1) for (const x of [22, 23]) if ((x + y) % 2 === 0 || y % 3 === 0) at(bambooImg(tr), x, y, 'bamboo');

  // 혼례 마당: screen, table, lanterns, geese, poles for the bunting
  { const img = screenImg(); add(img, Z.screen[0] * T + (Z.screen[2] - Z.screen[0]) * 8 - img.width / 2, 17 * T - img.height, 17 * T - 2, 'screen'); }
  { const img = choryeImg(); add(img, Z.chorye[0] * T + 32 - img.width / 2, 19 * T - img.height, 19 * T - 1, 'chorye'); }
  [[8, 16], [16, 16], [5, 21], [18, 21]].forEach(([tx, ty]) => add(poleImg(), tx * T + 6, ty * T - 30, ty * T + 2, 'pole'));

  // plaza: zelkova with 평상, well, notice board, 장승, 솟대
  { const img = zelkovaImg(); add(img, 4 * T + 8 - img.width / 2, 30 * T + 14 - img.height, 30 * T + 14, 'tree'); }
  { const img = pyeongsangImg(); add(img, 2 * T + 2, 31 * T - img.height + 2, 31 * T + 2, 'bench'); }
  { const img = wellImg(); add(img, Z.well[0] * T + 16 - img.width / 2, Z.well[3] * T - img.height + 2, Z.well[3] * T, 'well'); }
  { const img = boardImg(); add(img, Z.board[0] * T + 16 - img.width / 2, 27 * T - img.height, 27 * T - 1, 'board'); }
  add(jangseungImg(0), 10 * T + 3, 33 * T - 30, 33 * T, 'jangseung');
  add(jangseungImg(1), 13 * T + 3, 33 * T - 30, 33 * T, 'jangseung');
  add(sotdaeImg(), 18 * T + 4, 27 * T - 36, 27 * T + 2, 'sotdae');

  // feast: low tables, makgeolli jars, the 전 griddle
  [Z.table1, Z.table2].forEach((t, i) => { const img = tableImg(i); add(img, t[0] * T - 2, t[1] * T - 9, t[3] * T, 'table'); });
  add(jarsImg(), 2 * T, 40 * T - 4, 41 * T, 'jars');
  add(griddleImg(), 6 * T, 40 * T, 41 * T, 'griddle');

  // lanterns (청사초롱) — they also glow at night
  LANTERNS.forEach(([tx, ty]) => add(lanternImg(), tx * T + 3, ty * T - 16, ty * T + 10, 'lantern', { light: [tx * T + 9, ty * T - 9] }));

  // pond: the island pavilion (hexagonal, like 향원정)
  { const img = pavilionImg(true); add(img, ISLAND.x - img.width / 2, ISLAND.y + 8 - img.height, ISLAND.y + 8, 'pavilion'); }

  // lakeside: photo wall, flamingos, boat, umbrella
  add(photoWallImg(), Z.photo[0] * T, Z.photo[1] * T - 26, Z.photo[3] * T + 2, 'photowall');
  [[11, 50], [12.4, 51.2], [20, 53]].forEach(([tx, ty], i) => add(flamingoImg(i % 2), tx * T, ty * T - 12, ty * T + 6, 'flamingo'));
  add(boatImg(), 18 * T, 51 * T, 52 * T, 'boat');
  add(umbrellaImg(), 4 * T, 52 * T - 18, 53 * T, 'umbrella');
  return out;
}

// overhead layer: 오방색 bunting over the wedding yard and the dance yard, swaying gently
const OB = ['#3d63b8', '#d23d4b', '#f3c34f', '#f7f3ea', '#2b2033'];
const BUNTING = [
  [8 * T + 9, 16 * T - 28, 16 * T + 9, 16 * T - 28], [5 * T + 9, 21 * T - 28, 8 * T + 9, 16 * T - 28], [16 * T + 9, 16 * T - 28, 18 * T + 9, 21 * T - 28],
  [5 * T + 9, 21 * T - 28, 18 * T + 9, 21 * T - 28],
  [12 * T, 35 * T - 20, 18 * T, 41 * T - 20], [18 * T, 35 * T - 20, 12 * T, 41 * T - 20],
];
export function drawOverhead(g, t, view) {
  for (const [x0, y0, x1, y1] of BUNTING) {
    if (Math.max(y0, y1) + 20 < view.y || Math.min(y0, y1) - 10 > view.y + view.h) continue;
    const len = Math.hypot(x1 - x0, y1 - y0), sag = 6 + len / 40;
    for (let s = 0; s <= 1; s += 1 / len) { const x = x0 + (x1 - x0) * s, y = y0 + (y1 - y0) * s + Math.sin(s * Math.PI) * sag; g.fillStyle = '#5a4636'; g.fillRect(Math.round(x), Math.round(y), 1, 1); }
    const n = Math.max(3, Math.floor(len / 9));
    for (let k = 1; k < n; k++) {
      const s = k / n, x = Math.round(x0 + (x1 - x0) * s), y = Math.round(y0 + (y1 - y0) * s + Math.sin(s * Math.PI) * sag), sw = Math.round(Math.sin(t * 2.2 + k) * 1.2);
      g.fillStyle = OB[k % 5]; g.fillRect(x - 2, y + 1, 5, 2); g.fillRect(x - 1 + sw, y + 3, 3, 2); g.fillRect(x + sw, y + 5, 1, 1);
    }
  }
}
export function lightSources() {
  return LANTERNS.map(([tx, ty]) => ({ x: tx * T + 9, y: ty * T - 8, r: 26 }))
    .concat([[5, 9], [7, 9], [12, 9], [14, 9]].map(([tx, ty]) => ({ x: tx * T, y: ty * T, r: 20 })), [{ x: 12 * T, y: 18 * T, r: 52 }, { x: ISLAND.x, y: ISLAND.y - 10, r: 34 }]);
}

// ------------------------------------------------------------
//  prop painters
// ------------------------------------------------------------
function shadow(g, cx, cy, rx, ry = 3) { ellipse(g, cx, cy, rx, ry, 'rgba(30,40,20,0.22)'); }
function pineImg(r) {   // 소나무: red twisted trunk, flat cloud-like needle layers
  const c = cv(44, 56), { g, R, E } = pen(c);
  shadow(g, 22, 52, 12);
  let x = 22; for (let y = 52; y > 20; y--) { x += Math.round(Math.sin(y / 5) * 0.6); R(x - 2, y, 4, 1, y % 5 ? '#9b5a3a' : '#b06a45'); R(x + 1, y, 1, 1, '#6e3e28'); }
  R(x - 8, 30, 8, 2, '#8a4b33'); R(x + 2, 25, 9, 2, '#8a4b33');
  const layers = [[x - 10, 30, 10, 4], [x + 9, 24, 10, 4], [x - 2, 17, 12, 5], [x + 2, 8, 8, 4], [x - 9, 20, 6, 3]];
  layers.forEach(([lx, ly, rx, ry]) => { E(lx, ly + 2, rx, ry, '#1f4a35'); E(lx, ly, rx, ry, '#2d5f43'); E(lx - 1, ly - 1, rx - 3, ry - 2, '#3f7a52'); for (let k = -rx + 3; k < rx - 2; k += 3) R(lx + k, ly - ry + 1, 1, 1, '#64a06b'); });
  return c;
}
function cherryImg(r) {   // 벚나무 in full April bloom
  const c = cv(40, 46), { g, R, P, E } = pen(c);
  shadow(g, 20, 43, 12);
  R(18, 26, 5, 17, '#6e4a3a'); R(21, 26, 2, 17, '#55372b'); R(13, 28, 6, 2, '#6e4a3a'); R(22, 24, 7, 2, '#6e4a3a');
  [[20, 18, 16, 12], [10, 22, 8, 7], [30, 21, 8, 7], [20, 9, 11, 7]].forEach(([x, y, rx, ry]) => E(x, y + 2, rx, ry, '#e48ab3'));
  [[20, 17, 15, 11], [10, 21, 7, 6], [30, 20, 7, 6], [20, 8, 10, 6]].forEach(([x, y, rx, ry]) => E(x, y, rx, ry, '#f6b3cf'));
  [[15, 11, 5, 3], [25, 14, 4, 3], [10, 19, 3, 2]].forEach(([x, y, rx, ry]) => E(x, y, rx, ry, '#ffd9e8'));
  for (let k = 0; k < 18; k++) P(5 + Math.floor(r() * 30), 4 + Math.floor(r() * 24), r() < 0.5 ? '#ffffff' : '#d9709f');
  for (let k = 0; k < 6; k++) P(6 + Math.floor(r() * 28), 40 + Math.floor(r() * 5), '#ffc4dc');   // fallen petals
  return c;
}
function persimmonImg(r) {   // 감나무 with orange fruit
  const c = cv(40, 46), { g, R, P, E } = pen(c);
  shadow(g, 20, 43, 12);
  R(18, 25, 5, 18, '#6b4a33'); R(21, 25, 2, 18, '#51382a');
  [[20, 17, 15, 12], [11, 22, 7, 6], [29, 21, 7, 6]].forEach(([x, y, rx, ry]) => E(x, y + 2, rx, ry, '#3a7a2e'));
  [[20, 16, 14, 11], [11, 21, 6, 5], [29, 20, 6, 5]].forEach(([x, y, rx, ry]) => E(x, y, rx, ry, '#4f9a3c'));
  E(16, 10, 5, 3, '#6fbe4f');
  for (let k = 0; k < 11; k++) { const x = 8 + Math.floor(r() * 24), y = 8 + Math.floor(r() * 18); R(x, y, 2, 2, '#f08a2a'); P(x, y, '#ffb35c'); }
  return c;
}
function palmImg(r) {
  const c = cv(46, 56), { g, P } = pen(c);
  let tx = 23, ty = 54;
  for (let i = 0; i < 34; i++) { const x = Math.round(23 + 4 * Math.sin(i / 14)), y = 54 - i; g.fillStyle = i % 4 < 2 ? '#a57744' : '#8c6236'; g.fillRect(x - 1, y, 3, 1); P(x + 1, y, '#6e4a2a'); tx = x; ty = y; }
  [-170, -140, -110, -70, -40, -10, 20, 160, 200].forEach((deg, k) => {
    const a = deg * Math.PI / 180, L = 16 + (k % 3) * 2, dir = Math.cos(a) >= 0 ? 1 : -1;
    for (let s = 0; s <= L; s++) { const x = Math.round(tx + Math.cos(a) * s), y = Math.round(ty + Math.sin(a) * s + 0.035 * s * s);
      if (s > 2) { const lf = Math.min(3, Math.round((1 - s / L) * 4 + 0.5)); for (let j = 1; j <= lf; j++) { P(x - dir * Math.round(j * 0.5), y + j, '#2f6b37'); P(x, y - j, j === lf ? '#6fc35a' : '#4f9a4a'); } }
      P(x, y, '#3f8a45'); }
  });
  ellipse(g, tx, ty + 2, 2, 2, '#7a5230'); ellipse(g, tx + 3, ty + 3, 2, 2, '#6a4528');
  shadow(g, 23, 54, 9);
  return c;
}
function bushImg(r, col) {   // 진달래 / 철쭉
  const c = cv(20, 16), { g, P, E } = pen(c);
  shadow(g, 10, 14, 8, 2);
  E(10, 9, 9, 5, '#3c7a30'); E(9, 8, 8, 4, '#4f8a3e');
  for (let k = 0; k < 12; k++) { const x = 3 + Math.floor(r() * 14), y = 5 + Math.floor(r() * 7); P(x, y, col); P(x + 1, y, col); P(x, y - 1, '#ffd0e6'); }
  return c;
}
function bambooImg(r) {
  const c = cv(16, 40), { R, P } = pen(c);
  for (let k = 0; k < 3; k++) {
    const x = 2 + k * 5 + Math.floor(r() * 2), top = 2 + Math.floor(r() * 8);
    for (let y = top; y < 38; y++) { R(x, y, 2, 1, (y - top) % 7 === 0 ? '#5e8f3a' : '#86b94f'); P(x + 1, y, '#6c9f42'); }
    for (let y = top + 3; y < 30; y += 6) { R(x + 2, y, 4, 1, '#4f8a3e'); R(x - 3, y + 3, 3, 1, '#4f8a3e'); P(x + 5, y - 1, '#7cbf5f'); }
  }
  return c;
}
function zelkovaImg() {   // 정자나무 — the village's great zelkova, a canopy over the 평상
  const c = cv(96, 84), { g, R, P, E } = pen(c), r = rng(5);
  shadow(g, 48, 78, 30, 6);
  R(42, 48, 12, 32, '#6b4a33'); R(50, 48, 4, 32, '#51382a'); R(38, 76, 20, 4, '#6b4a33'); R(30, 52, 14, 3, '#6b4a33'); R(52, 46, 16, 3, '#6b4a33');
  [[48, 34, 40, 24], [24, 40, 18, 13], [72, 38, 18, 13], [48, 16, 26, 14]].forEach(([x, y, rx, ry]) => E(x, y + 3, rx, ry, '#2f6a2a'));
  [[48, 32, 39, 23], [24, 38, 17, 12], [72, 36, 17, 12], [48, 15, 25, 13]].forEach(([x, y, rx, ry]) => E(x, y, rx, ry, '#4a8f37'));
  [[36, 20, 12, 6], [62, 26, 10, 5], [26, 34, 7, 4], [50, 10, 10, 4]].forEach(([x, y, rx, ry]) => E(x, y, rx, ry, '#6fb14b'));
  for (let k = 0; k < 60; k++) P(14 + Math.floor(r() * 68), 6 + Math.floor(r() * 50), r() < 0.5 ? '#3c7d2e' : '#86c45a');
  // 금줄 (straw rope with paper strips) around the trunk — a guardian tree
  for (let x = 40; x < 56; x++) P(x, 60 + Math.round(Math.sin(x / 2)), '#d9c27a');
  [43, 47, 51].forEach(x => R(x, 61, 1, 4, '#ffffff'));
  return c;
}
function pyeongsangImg() { const c = cv(64, 22), { R } = pen(c); R(0, 4, 64, 10, '#b98a5c'); for (let x = 0; x < 64; x += 6) R(x, 4, 1, 10, '#a0703f'); R(0, 4, 64, 1, '#d1a273'); R(0, 13, 64, 3, '#8a5a32'); [2, 30, 58].forEach(x => R(x, 16, 4, 6, '#6e4528')); return c; }

function roofRows(R, w, top, eave, inset, colA = '#3c4556', colB = '#4b5568') {   // giwa roof seen from above-front with upturned ends
  for (let y = top; y < eave; y++) {
    const k = (y - top) / Math.max(1, eave - top), ins = Math.round(inset - inset * k), x0 = Math.max(0, ins), x1 = w - Math.max(0, ins);
    R(x0, y, x1 - x0, 1, y % 4 === 0 ? colA : colB);
    if (y % 4 === 2) for (let x = x0 + 2; x < x1 - 2; x += 5) R(x, y, 1, 1, '#5d6879');
  }
  R(0, eave - 2, w, 3, '#2f3746'); for (let x = 2; x < w - 2; x += 4) R(x, eave - 1, 2, 2, '#d9dde4');
  R(0, eave - 6, 4, 4, '#2f3746'); R(w - 4, eave - 6, 4, 4, '#2f3746'); R(1, eave - 8, 2, 2, '#2f3746'); R(w - 3, eave - 8, 2, 2, '#2f3746');
}
function anchaeImg() {   // 안채 — main house: stone base, paper doors, 단청 band, big giwa roof
  const w = 7 * T + 26, h = 70, c = cv(w, h), { g, R } = pen(c), ox = 13, base = h - 4, bw = w - 26;
  R(ox - 2, base - 12, bw + 4, 12, '#b9b2a6'); R(ox - 2, base - 12, bw + 4, 1, '#d2ccc0'); R(ox - 2, base - 1, bw + 4, 1, '#8f897e');
  for (let y = base - 9; y < base - 1; y += 4) for (let x = ox + ((y >> 2) % 2) * 6; x < ox + bw; x += 12) R(x, y, 1, 3, '#9d968a');
  R(ox + bw / 2 - 12, base - 4, 24, 4, '#c9c2b6');
  R(ox + 4, base - 34, bw - 8, 22, '#f2e8d2');
  const win = (x, y, ww, hh) => { R(x - 1, y - 1, ww + 2, hh + 2, '#8a5a34'); R(x, y, ww, hh, '#f6efe0'); for (let i = 3; i < ww; i += 3) R(x + i, y, 1, hh, '#a0703f'); for (let j = 3; j < hh; j += 4) R(x, y + j, ww, 1, '#a0703f'); };
  const n = 4, step = (bw - 8) / n;
  for (let i = 0; i < n; i++) { const x = ox + 4 + Math.round(i * step); R(x, base - 36, 4, 24, '#8a5a34'); R(x + 3, base - 36, 1, 24, '#6e4628'); if (i === 1 || i === 2) win(x + 7, base - 32, Math.round(step) - 14, 19); else win(x + 8, base - 30, Math.round(step) - 16, 13); }
  R(ox + bw - 8, base - 36, 4, 24, '#8a5a34');
  // 대청 (open hall) floor between doors
  R(ox + 4 + Math.round(step) + 4, base - 13, Math.round(step * 2) - 8, 2, '#c18a52');
  // 단청 band
  R(ox, base - 40, bw, 5, '#3e8e6a'); for (let x = ox; x < ox + bw; x += 8) { R(x, base - 39, 4, 3, '#c4473f'); R(x + 1, base - 38, 2, 1, '#f3e7c9'); R(x + 5, base - 39, 2, 3, '#3d63b8'); }
  roofRows(R, w, 6, base - 40, 16);
  R(20, 3, w - 40, 5, '#3a4252'); R(20, 3, w - 40, 1, '#59637a'); R(20, 6, w - 40, 1, '#cfd5de');
  R(15, 0, 7, 7, '#3a4252'); R(w - 22, 0, 7, 7, '#3a4252');
  g.globalAlpha = 0.25; R(ox, base - 39, bw, 3, '#2b2033'); g.globalAlpha = 1;
  return c;
}
function sarangImg() {   // 사랑채 — the smaller guest wing with a 툇마루 porch
  const w = 4 * T + 14, h = 52, c = cv(w, h), { R } = pen(c), ox = 7, base = h - 3, bw = w - 14;
  R(ox - 2, base - 8, bw + 4, 8, '#b9b2a6'); R(ox - 2, base - 8, bw + 4, 1, '#d2ccc0');
  R(ox + 3, base - 26, bw - 6, 18, '#f2e8d2');
  [[ox + 8, base - 23, 12, 12], [ox + bw - 20, base - 23, 12, 12]].forEach(([x, y, ww, hh]) => { R(x - 1, y - 1, ww + 2, hh + 2, '#8a5a34'); R(x, y, ww, hh, '#f6efe0'); for (let i = 3; i < ww; i += 3) R(x + i, y, 1, hh, '#a0703f'); for (let j = 3; j < hh; j += 4) R(x, y + j, ww, 1, '#a0703f'); });
  [ox + 2, ox + bw / 2 - 2, ox + bw - 5].forEach(x => R(Math.round(x), base - 28, 3, 20, '#8a5a34'));
  R(ox, base - 10, bw, 2, '#c18a52');
  R(ox, base - 31, bw, 4, '#3e8e6a'); for (let x = ox; x < ox + bw; x += 7) R(x, base - 30, 3, 2, '#c4473f');
  roofRows(R, w, 5, base - 31, 10);
  R(12, 2, w - 24, 4, '#3a4252'); R(12, 4, w - 24, 1, '#cfd5de');
  return c;
}
function gateImg() {   // 솟을대문 — the raised gate with red-painted doors (open)
  const w = 4 * T + 10, h = 50, c = cv(w, h), { R, P } = pen(c), mid = w / 2;
  // side wall stubs
  R(0, 22, 14, 26, '#e9dcc0'); R(w - 14, 22, 14, 26, '#e9dcc0'); for (let y = 26; y < 46; y += 5) { R(3, y, 6, 2, '#b4a993'); R(w - 10, y + 2, 6, 2, '#b4a993'); }
  R(0, 18, 16, 5, '#4b5568'); R(w - 16, 18, 16, 5, '#4b5568');
  // posts and open doors
  R(14, 16, 4, 32, '#8a5a34'); R(w - 18, 16, 4, 32, '#8a5a34');
  R(18, 22, 6, 24, '#a3362f'); R(w - 24, 22, 6, 24, '#a3362f'); [26, 34, 42].forEach(y => { P(20, y, '#e8c35e'); P(w - 21, y, '#e8c35e'); });
  R(18, 18, w - 36, 4, '#3e8e6a'); for (let x = 18; x < w - 18; x += 6) R(x, 19, 3, 2, '#c4473f');
  // raised roof
  for (let y = 4; y < 18; y++) { const ins = Math.round(8 - 8 * (y - 4) / 14); R(8 + ins, y, w - 16 - 2 * ins, 1, y % 4 === 0 ? '#3c4556' : '#4b5568'); }
  R(6, 16, w - 12, 3, '#2f3746'); for (let x = 8; x < w - 8; x += 4) R(x, 17, 2, 2, '#d9dde4');
  R(6, 12, 3, 4, '#2f3746'); R(w - 9, 12, 3, 4, '#2f3746');
  R(14, 2, w - 28, 4, '#3a4252'); R(14, 4, w - 28, 1, '#cfd5de');
  // name plate
  R(mid - 7, 10, 14, 5, '#2b2033'); R(mid - 6, 11, 12, 3, '#f3e7c9');
  return c;
}
function wallH(x) {   // 돌담 (stone wall with a giwa cap), front face
  const c = cv(16, 22), { R, P } = pen(c), rr = rng(x * 13 + 5);
  R(0, 6, 16, 16, '#d8ccb0');
  for (let y = 8; y < 21; y += 4) for (let k = 0; k < 3; k++) { const sx = Math.floor(rr() * 12), sw = 3 + Math.floor(rr() * 3); R(sx, y, sw, 3, ['#b9ad93', '#a69a80', '#c7bca2'][k]); P(sx, y, '#e6dcc4'); }
  R(0, 21, 16, 1, '#8f8470');
  R(0, 2, 16, 5, '#4b5568'); R(0, 1, 16, 1, '#6b7689'); for (let k = 1; k < 16; k += 3) P(k, 6, '#d9dde4');
  return c;
}
function wallV() {   // side wall seen from above: a continuous giwa cap with a sliver of stone face
  const c = cv(12, 24), { R, P } = pen(c);
  R(8, 0, 4, 24, '#d8ccb0'); for (let y = 2; y < 24; y += 4) R(9, y, 2, 2, '#b4a993');
  R(1, 0, 8, 24, '#4b5568'); R(1, 0, 1, 24, '#6b7689'); R(8, 0, 1, 24, '#2f3746');
  for (let y = 1; y < 24; y += 3) { R(3, y, 4, 1, '#3c4556'); P(4, y + 1, '#5d6879'); }
  return c;
}
function jangdokImg() {   // 장독대 — soy & pepper paste jars on a stone platform
  const c = cv(3 * T + 6, 30), { g, R, P, E } = pen(c);
  R(0, 18, 3 * T + 6, 10, '#b9b2a6'); R(0, 18, 3 * T + 6, 1, '#d2ccc0'); R(0, 27, 3 * T + 6, 2, '#8f897e');
  const jar = (x, y, s) => { E(x, y, 5 * s, 6 * s, '#6e3f26'); E(x - 1, y - 1, 4 * s, 5 * s, '#8a5232'); E(x - 2, y - 3, 1, 2, '#b8805a'); R(x - 4 * s, y - 6 * s - 1, 8 * s, 2, '#5a3220'); P(x - 3, y - 4, '#c9946c'); };
  [[8, 16, 1], [20, 14, 1.15], [33, 16, 1], [44, 15, 0.9], [14, 22, 0.8], [27, 22, 0.85], [39, 23, 0.75]].forEach(([x, y, s]) => jar(x, y, s));
  return c;
}
function screenImg() {   // 병풍 — eight-panel folding screen with peonies (모란도), the wedding screen
  const w = 6 * T + 4, h = 34, c = cv(w, h), { R, P, E } = pen(c), panels = 8, pw = (w - 4) / panels;
  R(0, 2, w, 30, '#5a3a22'); R(0, 31, w, 3, '#3e2716');
  for (let i = 0; i < panels; i++) {
    const x = 2 + Math.round(i * pw), ww = Math.round(pw) - 1, shade = i % 2 ? '#f4ead2' : '#efe2c4';
    R(x, 4, ww, 26, shade);
    R(x + ww / 2 - 1 | 0, 18, 1, 12, '#5e8f3a');
    E(x + ww / 2, 15, 3, 3, ['#d23d4b', '#f27aa6', '#e8463c', '#ff9ec4'][i % 4]); P(x + ww / 2, 14, '#ffd0e0');
    E(x + 3, 21, 2, 1, '#4f8a33'); E(x + ww - 3, 24, 2, 1, '#4f8a33');
    if (i % 3 === 0) { E(x + ww / 2 + 2, 10, 2, 2, '#ffffff'); P(x + ww / 2 + 2, 10, '#f7c6d4'); }
  }
  return c;
}
function choryeImg() {   // 초례상 — the ceremony table: red & blue cloth, candles, pine & bamboo vases, wooden geese
  const w = 4 * T + 6, h = 30, c = cv(w, h), { R, P, E } = pen(c);
  R(2, 12, w - 4, 12, '#5a3a22'); R(4, 24, 3, 6, '#3e2716'); R(w - 7, 24, 3, 6, '#3e2716');
  R(2, 12, (w - 4) / 2, 9, '#3d5fae'); R(2 + (w - 4) / 2, 12, (w - 4) / 2, 9, '#c23a45'); R(2, 12, w - 4, 1, '#f3e7c9');
  // candles
  [[10, '#3d5fae'], [w - 12, '#c23a45']].forEach(([x, col]) => { R(x, 4, 2, 8, col); P(x, 2, '#ffd75e'); P(x + 1, 3, '#ff9b4a'); });
  // pine & bamboo vases
  R(18, 6, 4, 6, '#e8dcc4'); E(20, 4, 4, 3, '#2d5f43'); R(w - 22, 6, 4, 6, '#e8dcc4'); R(w - 21, 0, 1, 6, '#86b94f'); R(w - 19, 1, 1, 5, '#86b94f');
  // wooden geese pair (기러기) — wrapped in red & blue cloth
  E(w / 2 - 5, 9, 4, 2, '#8a5a32'); P(w / 2 - 9, 7, '#8a5a32'); P(w / 2 - 9, 6, '#6e4528'); R(w / 2 - 6, 9, 3, 1, '#3d5fae');
  E(w / 2 + 5, 9, 4, 2, '#8a5a32'); P(w / 2 + 9, 7, '#8a5a32'); P(w / 2 + 9, 6, '#6e4528'); R(w / 2 + 4, 9, 3, 1, '#c23a45');
  // 대추 & 밤 bowls
  E(w / 2, 14, 3, 1, '#a3362f'); E(26, 15, 2, 1, '#8a5232'); E(w - 26, 15, 2, 1, '#d9b16a');
  return c;
}
function poleImg() { const c = cv(6, 34), { R } = pen(c); R(2, 2, 2, 32, '#7a4f2a'); R(2, 2, 1, 32, '#a06f3e'); R(1, 0, 4, 3, '#4a3a35'); return c; }
function wellImg() {   // 우물 — stone well with a little giwa roof and a gourd dipper
  const c = cv(36, 42), { R, P, E } = pen(c);
  E(18, 34, 15, 6, '#8f897e'); E(18, 32, 15, 6, '#c9c2b6'); for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2; P(Math.round(18 + Math.cos(a) * 13), Math.round(32 + Math.sin(a) * 5), '#a39d90'); }
  E(18, 31, 10, 3, '#2c4a6b'); E(16, 30, 4, 1, '#4f7fb0');
  R(4, 10, 3, 23, '#7a4f2a'); R(29, 10, 3, 23, '#7a4f2a');
  for (let y = 3; y < 12; y++) R(1 + (12 - y) / 2, y, 34 - (12 - y), 1, y % 3 ? '#4b5568' : '#3c4556');
  R(0, 11, 36, 2, '#2f3746');
  E(27, 34, 3, 2, '#d9b16a'); R(29, 33, 4, 1, '#a07a3a');
  return c;
}
function boardImg() { const c = cv(30, 30), { R, P } = pen(c); R(3, 8, 3, 22, '#7a4f2a'); R(24, 8, 3, 22, '#7a4f2a'); R(0, 2, 30, 18, '#8a5a34'); R(2, 4, 26, 14, '#e9dcc0'); R(4, 6, 9, 5, '#fff8ec'); R(15, 7, 10, 7, '#ffd6e4'); R(5, 12, 7, 4, '#dbe4ff'); P(8, 6, '#c8433f'); P(19, 7, '#c8433f'); R(0, 0, 30, 3, '#4b5568'); return c; }
function jangseungImg(k) {   // 장승 — the village guardians at the plaza entrance (天下大將軍 / 地下女將軍)
  const c = cv(12, 32), { R, P } = pen(c), hat = k ? '#3d63b8' : '#2b2033', face = k ? '#c8433f' : '#c8433f';
  R(3, 4, 6, 28, '#b98a5c'); R(8, 4, 1, 28, '#8c6236');
  R(2, 1, 8, 4, hat); R(3, 0, 6, 1, hat);
  R(3, 6, 6, 7, face); P(4, 8, '#ffffff'); P(7, 8, '#ffffff'); P(4, 9, '#2b2033'); P(7, 9, '#2b2033'); R(4, 11, 4, 1, '#ffffff'); P(5, 12, '#2b2033'); P(6, 12, '#2b2033');
  for (let y = 15; y < 30; y += 3) P(6, y, '#2b2033');
  return c;
}
function sotdaeImg() { const c = cv(14, 40), { R, P } = pen(c); R(6, 6, 2, 34, '#9b7a55'); R(7, 6, 1, 34, '#7a5a3a'); R(2, 2, 10, 3, '#c9a777'); R(10, 1, 3, 2, '#c9a777'); P(12, 0, '#2b2033'); P(11, 2, '#2b2033'); R(1, 3, 2, 1, '#a3854f'); return c; }
function tableImg(i) {   // 교자상 — long low tables with the feast
  const w = 7 * T + 4, c = cv(w, 26), { R, E } = pen(c);
  R(0, 8, w, 10, '#8a2f2a'); R(0, 8, w, 1, '#b8483f'); R(0, 17, w, 3, '#5a1f1b'); [2, w / 2 - 2, w - 6].forEach(x => R(Math.round(x), 20, 4, 6, '#4a1a16'));
  const food = [
    x => { E(x, 12, 5, 3, '#ffffff'); [[-3, '#f49ac1'], [0, '#ffffff'], [3, '#9fd36b']].forEach(([d, col]) => R(x + d - 1, 10, 3, 2, col)); },   // 떡
    x => { E(x, 12, 5, 3, '#e8dcc4'); R(x - 3, 10, 6, 3, '#c97a3a'); R(x - 2, 10, 4, 1, '#e3a060'); },                                            // 전
    x => { E(x, 12, 5, 3, '#f7f3ea'); R(x - 3, 10, 2, 2, '#e8463c'); R(x, 9, 2, 2, '#f3c34f'); R(x + 2, 10, 2, 2, '#7cbf5f'); },                    // fruit
    x => { E(x, 12, 4, 3, '#2b2b36'); E(x, 11, 3, 2, '#d8b06a'); },                                                                             // 잡채 bowl
    x => { R(x - 1, 6, 3, 6, '#e9dcc0'); R(x - 1, 6, 3, 1, '#c9bb9d'); R(x + 3, 9, 2, 3, '#f7f3ea'); },                                            // makgeolli kettle & cup
  ];
  for (let k = 0; k < 7; k++) food[(k + i * 2) % food.length](8 + k * 16);
  return c;
}
function jarsImg() { const c = cv(40, 20), { R, P, E } = pen(c); [[7, 12], [18, 11], [29, 12]].forEach(([x, y], i) => { E(x, y, 6, 7, i === 1 ? '#a3836a' : '#8a6a52'); E(x - 1, y - 1, 5, 6, i === 1 ? '#c2a284' : '#a3836a'); R(x - 4, y - 7, 8, 2, '#f7f3ea'); P(x - 3, y - 2, '#d9c4a8'); }); return c; }
function griddleImg() { const c = cv(26, 16), { R, P, E } = pen(c); R(4, 10, 2, 6, '#4a3a35'); R(20, 10, 2, 6, '#4a3a35'); E(13, 9, 12, 4, '#2b2b36'); E(13, 8, 10, 3, '#4a4a55'); E(9, 8, 3, 1, '#e3a060'); E(16, 8, 3, 1, '#d98f4f'); P(13, 3, '#ffffff'); P(14, 1, 'rgba(255,255,255,0.6)'); return c; }
function lanternImg() {   // 청사초롱 on a wooden post — blue top, red bottom
  const c = cv(14, 28), { g, R } = pen(c);
  R(2, 2, 2, 26, '#7a4f2a'); R(2, 2, 9, 2, '#7a4f2a'); R(9, 4, 1, 2, '#4a3a35');
  R(6, 6, 7, 1, '#2b2033'); R(5, 7, 9, 3, '#3d63b8'); R(6, 7, 1, 3, '#5b82d6'); R(5, 10, 9, 4, '#d23d4b'); R(6, 10, 1, 4, '#ec6170'); R(6, 14, 7, 1, '#2b2033'); R(9, 15, 1, 3, '#f3c34f');
  ellipse(g, 3, 27, 3, 1, 'rgba(30,40,20,0.25)');
  return c;
}
function pavilionImg(hex) {   // 정자 — open pavilion with red pillars and a flared roof (hex = the island's 향원정-style one)
  const w = hex ? 50 : 62, h = hex ? 60 : 56, c = cv(w, h), { g, R, P } = pen(c), base = h - 3;
  R(4, base - 8, w - 8, 8, '#b9b2a6'); R(4, base - 8, w - 8, 1, '#d2ccc0'); R(4, base - 1, w - 8, 1, '#8f897e');
  R(6, base - 11, w - 12, 3, '#c18a52'); R(6, base - 11, w - 12, 1, '#d6a06a');
  const posts = hex ? [9, w / 2 - 1, w - 12] : [9, 22, w - 25, w - 12];
  posts.forEach(x => { R(Math.round(x), base - 34, 3, 23, '#b23a32'); R(Math.round(x) + 2, base - 34, 1, 23, '#8a2a25'); });
  R(6, base - 37, w - 12, 4, '#3e8e6a'); for (let x = 6; x < w - 6; x += 6) { R(x, base - 36, 3, 2, '#c4473f'); P(x + 4, base - 36, '#f3e7c9'); }
  for (let y = 4; y < base - 37; y++) {
    const k = (y - 4) / (base - 41), ins = Math.round((hex ? 18 : 16) * (1 - k));
    R(ins, y, w - 2 * ins, 1, y % 4 === 0 ? '#3c4556' : '#4b5568');
  }
  R(0, base - 40, w, 3, '#2f3746'); for (let x = 2; x < w - 2; x += 4) R(x, base - 39, 2, 2, '#d9dde4');
  R(0, base - 45, 3, 5, '#2f3746'); R(w - 3, base - 45, 3, 5, '#2f3746');
  if (hex) { R(w / 2 - 2, 0, 4, 6, '#2f3746'); R(w / 2 - 1, 0, 2, 2, '#e8c35e'); } else { R(18, 2, w - 36, 4, '#3a4252'); R(18, 4, w - 36, 1, '#cfd5de'); }
  g.globalAlpha = 0.22; R(6, base - 33, w - 12, 3, '#2b2033'); g.globalAlpha = 1;
  return c;
}
function fallsImg() { const c = cv(64, 40), { R, P, E } = pen(c), r = rng(3);
  [[10, 26, 10, 7], [52, 24, 11, 8], [30, 32, 8, 5], [44, 34, 7, 4], [16, 34, 6, 4]].forEach(([x, y, rx, ry]) => { E(x, y + 2, rx, ry, '#6f6a62'); E(x, y, rx, ry, '#9d968a'); E(x - 2, y - 2, rx - 4, ry - 3, '#c4bfb4'); });
  for (let y = 4; y < 34; y++) { const x = 30 + Math.round(Math.sin(y / 6)); R(x - 3, y, 7, 1, y % 3 ? '#cfe6f4' : '#ffffff'); P(x - 3, y, '#9fd0ec'); }
  for (let k = 0; k < 14; k++) P(24 + Math.floor(r() * 14), 32 + Math.floor(r() * 6), '#ffffff');
  E(14, 18, 4, 3, '#2d5f43'); E(50, 14, 5, 3, '#2d5f43');
  return c; }
function photoWallImg() {   // flower photo wall facing the sunset
  const w = 4 * T, c = cv(w, 42), { R } = pen(c), fr = rng(8);
  R(0, 2, w, 36, '#4f8a3e');
  for (let i = 0; i < 150; i++) { const x = Math.floor(fr() * (w - 2)) + 1, y = 3 + Math.floor(fr() * 33); R(x, y, 2, 2, ['#ff9ec4', '#ffffff', '#ffc39a', '#f27aa6', '#e8463c'][Math.floor(fr() * 5)]); }
  R(w / 2 - 12, 12, 24, 12, '#fff8ec'); R(w / 2 - 12, 12, 24, 1, '#c99a6b'); R(w / 2 - 12, 23, 24, 1, '#c99a6b');
  ['.x.x.', 'xxxxx', '.xxx.', '..x..'].forEach((row, y) => [...row].forEach((ch, x) => ch === 'x' && R(w / 2 - 3 + x, 15 + y, 1, 1, '#e66b8f')));
  R(2, 36, 3, 6, '#6e4528'); R(w - 5, 36, 3, 6, '#6e4528');
  return c;
}
function flamingoImg(k) {
  const c = cv(14, 20), { g, P } = pen(c);
  ellipse(g, 6, 10, 4, 2, '#f49ac1'); P(2, 9, '#f7b3d1'); P(3, 9, '#f7b3d1');
  const neck = k ? [[9, 9], [10, 8], [10, 7], [9, 6], [9, 5], [10, 4], [11, 3]] : [[9, 9], [10, 9], [11, 8], [11, 7], [12, 6], [12, 5], [12, 4]];
  neck.forEach(([x, y]) => P(x, y, '#f49ac1'));
  const [hx, hy] = neck[neck.length - 1]; P(hx, hy - 1, '#f49ac1'); P(hx + 1, hy - 1, '#f49ac1'); P(hx + 2, hy, '#2b2033'); P(hx + 1, hy, '#f3f1ec');
  for (let y = 12; y < 19; y++) P(6, y, '#e57aa8'); P(7, 14, '#e57aa8'); P(8, 15, '#e57aa8');
  g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(3, 19, 7, 1);
  return c;
}
function boatImg() { const c = cv(26, 12), { g, R } = pen(c); ellipse(g, 13, 6, 12, 4, '#8a5a32'); ellipse(g, 13, 5, 10, 3, '#c18a52'); R(7, 4, 1, 4, '#a06f3e'); R(18, 4, 1, 4, '#a06f3e'); R(12, 0, 1, 6, '#7a4f2a'); g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(2, 10, 22, 1); return c; }
function umbrellaImg() { const c = cv(30, 34), { g, R } = pen(c); R(14, 8, 2, 26, '#f7f3ea'); for (let y = 0; y < 10; y++) { const w = Math.round(14 * Math.sin((y + 1) / 10 * Math.PI / 2)); for (let x = -w; x <= w; x++) R(15 + x, y, 1, 1, (Math.floor((x + 15) / 5) % 2) ? '#f27aa6' : '#fff8ec'); } ellipse(g, 15, 33, 9, 2, 'rgba(30,40,20,0.18)'); return c; }

export { ellipse };

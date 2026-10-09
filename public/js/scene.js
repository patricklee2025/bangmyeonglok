// ============================================================
//  Top-down (3/4) pixel village — Hanok × Florida lakeside
//  30 x 17 tiles of 16px = 480 x 272 world pixels. Original art drawn in code.
// ============================================================
export const TILE = 16, TW = 30, TH = 17, W = TW * TILE, H = TH * TILE;

function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const cv = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const inR = (x, y, r) => x >= r[0] && x < r[2] && y >= r[1] && y < r[3];   // r = [x0,y0,x1,y1) in tiles

// ---------------- zones (tile rects, end-exclusive) ----------------
export const Z = {
  hanok: [1, 1, 9, 4], yard: [1, 4, 10, 6], garden: [1, 7, 5, 10], altar: [13, 1, 18, 4], carpet: [14, 4, 17, 9],
  plaza: [7, 9, 15, 14], fountain: [10, 10, 12, 12], dance: [18, 10, 23, 14], dock: [20, 6, 25, 7],
  table1: [2, 11, 8, 12], table2: [2, 14, 8, 15], photo: [25, 12, 29, 13],
};
// lake: smooth blob in pixel space
const LAKE = { cx: 26.6 * TILE, cy: 4.4 * TILE, rx: 5.6 * TILE, ry: 4.3 * TILE };
export function isWater(px, py) {
  const dx = (px - LAKE.cx) / LAKE.rx, dy = (py - LAKE.cy) / LAKE.ry;
  const wob = 0.06 * Math.sin(px / 9) + 0.05 * Math.sin(py / 7 + 1);
  return dx * dx + dy * dy < 1 + wob && py > 10;
}
const isSand = (px, py) => !isWater(px, py) && (isWater(px + 4, py) || isWater(px - 4, py) || isWater(px, py + 5) || isWater(px, py - 4) || isWater(px + 3, py + 3) || isWater(px - 3, py + 3));

const PATH = [
  [4, 6], [5, 6], [5, 7], [5, 8], [6, 8], [6, 9], [7, 9],            // yard → plaza
  [15, 9], [16, 9], [17, 9], [17, 10],                            // plaza → carpet → dance
  [18, 9], [19, 9], [19, 8], [19, 7], [20, 7], [20, 8],           // → dock
  [7, 10], [7, 11], [7, 12], [8, 12], [8, 13], [8, 14], [8, 15],  // plaza → banquet / south
  [23, 12], [24, 12], [24, 13], [25, 13], [26, 13], [27, 13], [28, 13], [23, 11], // dance → photo
  [10, 14], [11, 14], [12, 14], [13, 14], [14, 14], [15, 14], [16, 14], [17, 14], [17, 13], [17, 12], [17, 11], // loop
];
const pathSet = new Set(PATH.map(([x, y]) => x + ',' + y));
export const isPath = (tx, ty) => pathSet.has(tx + ',' + ty) || inR(tx, ty, Z.plaza);

// ---------------- props placement ----------------
const TREES = [ // [tx, ty, kind]
  [10, 1, 'oak'], [11, 3, 'pine'], [20, 1, 'oak'], [19, 3, 'flower'], [0, 6, 'oak'], [0, 12, 'oak'], [12, 7, 'flower'],
  [21, 9, 'palm'], [29, 9, 'palm'], [24, 15, 'palm'], [29, 15, 'palm'], [5, 16, 'oak'], [9, 15, 'flower'], [19, 15, 'oak'], [13, 15, 'flower'],
];
const LANTERNS = [[3, 6], [9, 6], [13, 8], [18, 8], [7, 13], [15, 13], [23, 10], [23, 14], [20, 5]];

// ---------------- walk grid ----------------
export function buildWalk(level) {
  const g = Array.from({ length: TH }, () => new Array(TW).fill(true));
  const block = r => { for (let y = r[1]; y < r[3]; y++) for (let x = r[0]; x < r[2]; x++) if (g[y]) g[y][x] = false; };
  for (let x = 0; x < TW; x++) { g[0][x] = false; g[TH - 1][x] = false; }
  for (let y = 0; y < TH; y++) { g[y][0] = false; g[y][TW - 1] = false; }
  [Z.hanok, Z.garden, Z.altar, Z.fountain, Z.table1, Z.table2, Z.photo].forEach(block);
  for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) {
    let wet = 0; for (const [ox, oy] of [[4, 4], [12, 4], [4, 12], [12, 12], [8, 8]]) if (isWater(x * TILE + ox, y * TILE + oy)) wet++;
    if (wet >= 2) g[y][x] = false;
  }
  for (let x = Z.dock[0]; x < Z.dock[2]; x++) g[6][x] = true;     // dock planks over water
  TREES.forEach(([x, y]) => { if (g[y]) g[y][x] = false; });
  g[4][4] = true; g[4][5] = true;                                  // hanok door step
  return g;
}

// ---------------- activity spots ----------------
export function spots(walk) {
  const ok = (x, y) => walk[y]?.[x];
  const near = (r, ring = 1) => { const out = []; for (let y = r[1] - ring; y < r[3] + ring; y++) for (let x = r[0] - ring; x < r[2] + ring; x++) if (ok(x, y) && !inR(x, y, r)) out.push([x, y]); return out; };
  const inside = r => { const out = []; for (let y = r[1]; y < r[3]; y++) for (let x = r[0]; x < r[2]; x++) if (ok(x, y)) out.push([x, y]); return out; };
  const shore = [];
  for (let y = 1; y < TH - 1; y++) for (let x = 15; x < TW - 1; x++) if (ok(x, y) && !inR(x, y, Z.dock)) {
    const cxp = x * TILE + 8, cyp = y * TILE + 8;
    if (isWater(cxp + 16, cyp) || isWater(cxp - 16, cyp) || isWater(cxp, cyp - 16) || isWater(cxp, cyp + 14)) shore.push([x, y]);
  }
  // keep the couple visible: nobody parks right in front of the stage
  const clearOfStage = ([x, y]) => !(x >= Z.altar[0] - 1 && x < Z.altar[2] + 1 && y <= Z.altar[3] + 1);
  return {
    fish: [[23, 6], [24, 6], [22, 6], ...shore],
    dance: inside(Z.dance),
    chat: near(Z.fountain, 1),
    eat: [...near(Z.table1, 1), ...near(Z.table2, 1)].filter(([x, y]) => y !== 13 || true),
    photo: [...inside([10, 6, 21, 9]), ...near(Z.photo, 1)].filter(clearOfStage),
    walk: inside([1, 1, TW - 1, TH - 1]).filter(clearOfStage),
    door: [4, 4],
    group: (() => { const s = []; for (let row = 0; row < 5; row++) for (let i = 0; i < 13; i++) { const x = 15 + (i % 2 ? Math.ceil(i / 2) : -Math.ceil(i / 2)); const y = 6 + row; if (ok(x, y)) s.push([x, y]); } return s; })(),
  };
}

// ============================================================
//  GROUND LAYER
// ============================================================
export function buildGround() {
  const c = cv(W, H), g = c.getContext('2d');
  const r = rng(11);
  const P = (x, y, col) => { g.fillStyle = col; g.fillRect(x, y, 1, 1); };
  const R = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };

  // grass base with per-tile variation
  for (let ty = 0; ty < TH; ty++) for (let tx = 0; tx < TW; tx++) {
    const v = (tx * 7 + ty * 13) % 5;
    R(tx * TILE, ty * TILE, TILE, TILE, v === 0 ? '#71b24a' : '#76b84d');
  }
  for (let i = 0; i < 900; i++) {
    const x = Math.floor(r() * W), y = Math.floor(r() * H);
    const col = r() < 0.6 ? '#5f9e3c' : '#94cf62';
    P(x, y, col); P(x + 1, y - 1, col); if (r() < 0.5) P(x + 2, y, col);
  }
  for (let i = 0; i < 140; i++) { const x = Math.floor(r() * W), y = Math.floor(r() * H); const col = ['#ffffff', '#ffe066', '#ff9ec4', '#b9a2ff'][Math.floor(r() * 4)]; P(x, y, col); P(x, y + 1, '#4f8a33'); }

  // yard (마당, packed earth)
  for (let y = Z.yard[1] * TILE; y < Z.yard[3] * TILE; y++) for (let x = Z.yard[0] * TILE; x < Z.yard[2] * TILE; x++) P(x, y, (x * 3 + y * 7) % 11 === 0 ? '#c9a777' : '#d8b98a');
  // stone paths
  const stone = (tx, ty) => {
    const x0 = tx * TILE, y0 = ty * TILE;
    R(x0, y0, TILE, TILE, '#b9ad93');
    const rr = rng(tx * 31 + ty * 17);
    for (let k = 0; k < 5; k++) {
      const sx = x0 + 1 + Math.floor(rr() * 10), sy = y0 + 1 + Math.floor(rr() * 10), sw = 4 + Math.floor(rr() * 3), sh = 3 + Math.floor(rr() * 2);
      R(sx, sy, sw, sh, '#d9cfb6'); R(sx, sy + sh - 1, sw, 1, '#c2b698'); R(sx, sy, sw, 1, '#e8e0cb');
    }
  };
  for (let ty = 0; ty < TH; ty++) for (let tx = 0; tx < TW; tx++) if (isPath(tx, ty)) stone(tx, ty);
  // plaza ring border
  { const [a, b, c2, d] = Z.plaza.map(v => v * TILE); R(a, b, c2 - a, 1, '#9d927a'); R(a, d - 1, c2 - a, 1, '#9d927a'); R(a, b, 1, d - b, '#9d927a'); R(c2 - 1, b, 1, d - b, '#9d927a'); }

  // garden (텃밭): tilled rows
  { const [a, b, c2, d] = Z.garden.map(v => v * TILE);
    R(a, b, c2 - a, d - b, '#8a5a36');
    for (let y = b + 2; y < d; y += 6) { R(a + 2, y, c2 - a - 4, 3, '#6e4528'); R(a + 2, y, c2 - a - 4, 1, '#a06c42'); }
    R(a, b, c2 - a, 1, '#6e4528'); R(a, d - 1, c2 - a, 1, '#6e4528'); }

  // lake / sand
  for (let y = 0; y < H; y++) for (let x = 15 * TILE; x < W; x++) {
    if (isWater(x, y)) {
      const dx = (x - LAKE.cx) / LAKE.rx, dy = (y - LAKE.cy) / LAKE.ry, d = dx * dx + dy * dy;
      let col = d > 0.82 ? '#7cc4e8' : d > 0.55 ? '#58ade0' : '#4799d2';
      if (d > 0.82 && (x + y) % 3 === 0) col = '#9ed6f0';
      P(x, y, col);
    } else if (isSand(x, y)) P(x, y, (x * 5 + y * 3) % 7 === 0 ? '#dcc185' : '#ecd59e');
  }
  // lily pads
  [[27, 2], [28, 6], [25, 3]].forEach(([tx, ty]) => { const x = tx * TILE + 4, y = ty * TILE + 6; ellipseFill(g, x, y, 4, 3, '#4e9a46'); P(x + 2, y - 1, '#76b84d'); P(x, y, '#3f7f39'); P(x - 1, y - 2, '#ff9ec4'); P(x, y - 2, '#ffd0e0'); });

  // altar stage (wood platform)
  { const [a, b, c2, d] = Z.altar.map(v => v * TILE);
    R(a - 2, b + 6, c2 - a + 4, d - b - 2, '#8a5a32');
    for (let y = b + 6; y < d - 2; y += 4) { R(a - 1, y, c2 - a + 2, 3, '#c18a52'); R(a - 1, y, c2 - a + 2, 1, '#d6a06a'); }
    R(a - 2, d - 3, c2 - a + 4, 3, '#6e4528'); R(a - 2, d - 3, c2 - a + 4, 1, '#a06f3e'); }
  // carpet
  { const [a, b, c2, d] = Z.carpet.map(v => v * TILE);
    R(a + 3, b - 2, c2 - a - 6, d - b + 2, '#b8323f'); R(a + 3, b - 2, 1, d - b + 2, '#e8c35e'); R(c2 - 4, b - 2, 1, d - b + 2, '#e8c35e');
    for (let y = b; y < d; y += 6) { P(a + 10, y, '#ffd0e0'); P(a + 30, y + 3, '#ffffff'); P(a + 20, y + 2, '#ff9ec4'); } }

  // dance floor (checker wood)
  { const [a, b, c2, d] = Z.dance.map(v => v * TILE);
    for (let ty = Z.dance[1]; ty < Z.dance[3]; ty++) for (let tx = Z.dance[0]; tx < Z.dance[2]; tx++) {
      const x0 = tx * TILE, y0 = ty * TILE, alt = (tx + ty) % 2;
      R(x0, y0, TILE, TILE, alt ? '#c99a62' : '#b5844f');
      for (let k = 0; k < TILE; k += 4) R(x0, y0 + k, TILE, 1, alt ? '#b8894f' : '#a3733f');
    }
    R(a - 2, b - 2, c2 - a + 4, 2, '#7a4f2a'); R(a - 2, d, c2 - a + 4, 2, '#7a4f2a'); R(a - 2, b - 2, 2, d - b + 4, '#7a4f2a'); R(c2, b - 2, 2, d - b + 4, '#7a4f2a'); }

  // dock planks
  { const [a, b, c2] = Z.dock.map(v => v * TILE);
    for (let x = a; x < c2; x += 4) { R(x, b + 2, 3, 13, '#b98a5c'); R(x, b + 2, 3, 1, '#d1a273'); R(x + 3, b + 2, 1, 13, '#8c6236'); }
    R(a, b + 14, c2 - a, 2, '#6e4528'); [a + 1, c2 - 3].forEach(x => { R(x, b + 14, 2, 4, '#5a3a22'); }); }
  return c;
}

function ellipseFill(g, cx, cy, rx, ry, col) {
  g.fillStyle = col;
  for (let y = -ry; y <= ry; y++) { const w = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry)))); g.fillRect(cx - w, cy + y, w * 2 + 1, 1); }
}
const disc = (g, cx, cy, rad, col) => ellipseFill(g, cx, cy, rad, rad, col);

// ============================================================
//  PROPS (y-sorted with characters). Each: { img, x, y, base, kind, light? }
// ============================================================
export function buildProps(level, night) {
  const out = [];
  const add = (img, x, y, base, kind, extra = {}) => out.push({ img, x, y, base, kind, ...extra });

  // forest edge along the top & sides
  const fr = rng(5);
  for (let x = -8; x < W + 8; x += 18) { if (x > 300 && x < 440) continue; const t = treeImg('oak', fr); add(t, x - 6 + Math.floor(fr() * 6), -26 + Math.floor(fr() * 4), 8 + x % 3, 'tree'); }
  for (let x = 300; x < 440; x += 22) { const t = treeImg('palm', fr); add(t, x - 10, -30, 6, 'tree'); }

  // hanok
  add(hanokImg(night), Z.hanok[0] * TILE - 12, -14, Z.hanok[3] * TILE, 'hanok');
  // stone wall segment
  add(wallImg(), 9 * TILE + 2, 2 * TILE - 4, 4 * TILE, 'wall');

  // trees
  const tr = rng(9);
  TREES.forEach(([tx, ty, k]) => { const img = treeImg(k, tr); add(img, tx * TILE + 8 - img.width / 2, ty * TILE + 14 - img.height, ty * TILE + 14, 'tree'); });

  // garden crops
  add(gardenImg(), Z.garden[0] * TILE, Z.garden[1] * TILE - 6, Z.garden[3] * TILE - 2, 'garden');

  // wedding arch on the altar
  add(archImg(level), Z.altar[0] * TILE - 4, 4, Z.altar[1] * TILE + 26, 'arch');
  // vases at stage front
  [[Z.altar[0] * TILE - 6, Z.altar[3] * TILE - 12], [Z.altar[2] * TILE - 2, Z.altar[3] * TILE - 12]].forEach(([x, y]) => add(vaseImg(), x, y, y + 12, 'vase'));

  // fountain (level 2+) or well
  const fx = Z.fountain[0] * TILE, fy = Z.fountain[1] * TILE;
  add(level >= 2 ? fountainImg() : wellImg(), fx - 4, fy - 14, fy + 30, level >= 2 ? 'fountain' : 'well');
  // benches
  [[8 * TILE + 2, 10 * TILE + 4], [13 * TILE - 2, 10 * TILE + 4]].forEach(([x, y]) => add(benchImg(), x, y, y + 10, 'bench'));

  // banquet tables
  [Z.table1, Z.table2].forEach((t, i) => add(tableImg(i), t[0] * TILE - 2, t[1] * TILE - 8, t[3] * TILE, 'table'));

  // photo wall + tripod
  add(photoWallImg(), Z.photo[0] * TILE - 2, Z.photo[1] * TILE - 22, Z.photo[3] * TILE, 'photowall');
  add(tripodImg(), 27 * TILE + 2, 14 * TILE + 2, 15 * TILE + 4, 'tripod');

  // dance floor posts (string lights are drawn in the overhead layer)
  [[Z.dance[0], Z.dance[1]], [Z.dance[2], Z.dance[1]], [Z.dance[0], Z.dance[3]], [Z.dance[2], Z.dance[3]]].forEach(([tx, ty]) => add(postImg(), tx * TILE - 3, ty * TILE - 26, ty * TILE + 1, 'post'));

  // lantern posts (청사초롱)
  LANTERNS.forEach(([tx, ty]) => add(lanternPostImg(), tx * TILE + 4, ty * TILE - 14, ty * TILE + 10, 'lantern', { light: [tx * TILE + 9, ty * TILE - 8] }));

  // flamingo + boat
  add(flamingoImg(), 26 * TILE, 7 * TILE - 4, 8 * TILE, 'flamingo');
  add(boatImg(), 27 * TILE, 3 * TILE, 4 * TILE, 'boat');

  // flower arches along the carpet (level 3+)
  if (level >= 3) [5, 7].forEach(ty => add(flowerArchImg(), Z.carpet[0] * TILE - 2, ty * TILE - 22, ty * TILE + 2, 'farch'));

  // welcome banner over the carpet entrance (names are drawn on the overlay)
  add(bannerImg(), Z.carpet[0] * TILE - 10, 9 * TILE - 30, 9 * TILE + 6, 'banner');

  // hedge row at the bottom
  const hr = rng(21);
  for (let x = -6; x < W; x += 14) add(hedgeImg(hr, x < 240), x, H - 16, H + 2, 'hedge');
  return out;
}

// overhead layer: string lights over the dance floor
export function drawOverhead(g, t, level, night) {
  const [a, b, c2, d] = Z.dance.map(v => v * TILE);
  const lines = [[a, b - 24, c2, d - 24], [c2, b - 24, a, d - 24]];
  lines.forEach(([x0, y0, x1, y1]) => {
    for (let s = 0; s <= 1; s += 0.01) {
      const x = x0 + (x1 - x0) * s, y = y0 + (y1 - y0) * s + Math.sin(s * Math.PI) * 8;
      g.fillStyle = '#4a3a35'; g.fillRect(Math.round(x), Math.round(y), 1, 1);
    }
    for (let k = 1; k < 10; k++) {
      const s = k / 10, x = x0 + (x1 - x0) * s, y = y0 + (y1 - y0) * s + Math.sin(s * Math.PI) * 8;
      const on = level >= 1 && (Math.floor(t * 3 + k) % 4 !== 0 || !night);
      g.fillStyle = on ? ['#ffd75e', '#ff8fb8', '#8fd3ff', '#b7f08a'][k % 4] : '#8a7f70';
      g.fillRect(Math.round(x), Math.round(y) + 1, 2, 2);
    }
  });
}
export function lightSources(level) {
  const L = LANTERNS.map(([tx, ty]) => ({ x: tx * TILE + 9, y: ty * TILE - 6, r: 22, c: 'rgba(255,190,120,A)' }));
  const [a, b, c2, d] = Z.dance.map(v => v * TILE);
  if (level >= 1) for (let k = 1; k < 10; k++) [[a, b - 24, c2, d - 24], [c2, b - 24, a, d - 24]].forEach(([x0, y0, x1, y1]) => { const s = k / 10; L.push({ x: x0 + (x1 - x0) * s, y: y0 + (y1 - y0) * s + Math.sin(s * Math.PI) * 8 + 2, r: 12, c: 'rgba(255,220,150,A)' }); });
  [[2, 3], [4, 3], [6, 3], [8, 3]].forEach(([tx, ty]) => L.push({ x: tx * TILE, y: ty * TILE, r: 18, c: 'rgba(255,200,120,A)' }));
  L.push({ x: 15.5 * TILE, y: 2 * TILE, r: 46, c: 'rgba(255,170,200,A)' });
  return L;
}

// ------------------------------------------------------------
//  prop painters
// ------------------------------------------------------------
function treeImg(kind, r) {
  if (kind === 'palm') {
    const c = cv(46, 56), g = c.getContext('2d');
    const P = (x, y, col) => { g.fillStyle = col; g.fillRect(x, y, 1, 1); };
    let tx = 23, ty = 54;
    for (let i = 0; i < 34; i++) { const x = Math.round(23 + 4 * Math.sin(i / 14)), y = 54 - i; g.fillStyle = i % 4 < 2 ? '#a57744' : '#8c6236'; g.fillRect(x - 1, y, 3, 1); P(x + 1, y, '#6e4a2a'); tx = x; ty = y; }
    [-170, -140, -110, -70, -40, -10, 20, 160, 200].forEach((deg, k) => {
      const a = deg * Math.PI / 180, L = 16 + (k % 3) * 2, dir = Math.cos(a) >= 0 ? 1 : -1;
      for (let s = 0; s <= L; s++) { const x = Math.round(tx + Math.cos(a) * s), y = Math.round(ty + Math.sin(a) * s + 0.035 * s * s);
        if (s > 2) { const lf = Math.min(3, Math.round((1 - s / L) * 4 + 0.5)); for (let j = 1; j <= lf; j++) { P(x - dir * Math.round(j * 0.5), y + j, '#2f6b37'); P(x, y - j, j === lf ? '#6fc35a' : '#4f9a4a'); } }
        P(x, y, '#3f8a45'); }
    });
    disc(g, tx, ty + 2, 2, '#7a5230'); disc(g, tx + 3, ty + 3, 2, '#6a4528');
    shadow(g, 23, 54, 9);
    return c;
  }
  if (kind === 'pine') {
    const c = cv(40, 50), g = c.getContext('2d');
    shadow(g, 20, 48, 9);
    for (let i = 0; i < 20; i++) { const x = Math.round(20 + 3 * Math.sin(i / 6)); g.fillStyle = '#9b5a3a'; g.fillRect(x - 2, 48 - i, 4, 1); g.fillStyle = '#7a4430'; g.fillRect(x + 1, 48 - i, 1, 1); }
    [[12, 26, 11, 5], [27, 22, 11, 5], [19, 14, 12, 5], [22, 30, 9, 4], [18, 6, 8, 4]].forEach(([x, y, rx, ry]) => { ellipseFill(g, x, y + 1, rx, ry, '#24503a'); ellipseFill(g, x, y, rx, ry, '#2f5e43'); ellipseFill(g, x - 1, y - 1, rx - 3, ry - 2, '#3f7a52'); for (let k = -rx + 3; k < rx - 2; k += 3) { g.fillStyle = '#5b9a66'; g.fillRect(x + k, y - ry + 1, 1, 1); } });
    return c;
  }
  const flower = kind === 'flower';
  const c = cv(36, 44), g = c.getContext('2d');
  shadow(g, 18, 42, 10);
  g.fillStyle = '#7a4f2e'; g.fillRect(15, 26, 6, 16); g.fillStyle = '#5e3b22'; g.fillRect(19, 26, 2, 16); g.fillStyle = '#946039'; g.fillRect(15, 30, 1, 8);
  const base = flower ? '#e99abf' : '#4f9a3c', dark = flower ? '#c66f98' : '#3c7d2e', light = flower ? '#ffc4dc' : '#6fbe4f';
  [[18, 17, 15, 12], [10, 21, 8, 7], [26, 21, 8, 7], [18, 9, 10, 7]].forEach(([x, y, rx, ry]) => ellipseFill(g, x, y + 2, rx, ry, dark));
  [[18, 16, 14, 11], [10, 20, 7, 6], [26, 20, 7, 6], [18, 8, 9, 6]].forEach(([x, y, rx, ry]) => ellipseFill(g, x, y, rx, ry, base));
  [[14, 10, 5, 3], [23, 14, 4, 3], [9, 18, 3, 2]].forEach(([x, y, rx, ry]) => ellipseFill(g, x, y, rx, ry, light));
  for (let k = 0; k < 10; k++) { g.fillStyle = flower ? '#fff0f6' : (r() < 0.5 ? '#e8463c' : '#3c7d2e'); g.fillRect(6 + Math.floor(r() * 24), 6 + Math.floor(r() * 20), 1, 1); }
  return c;
}
function shadow(g, cx, cy, rx) { g.fillStyle = 'rgba(30,40,20,0.22)'; ellipseFill(g, cx, cy, rx, 3, 'rgba(30,40,20,0.22)'); }

function hanokImg(night) {
  const w = 8 * TILE + 24, h = 4 * TILE + 14 + 4, c = cv(w, h), g = c.getContext('2d');
  const R = (x, y, ww, hh, col) => { g.fillStyle = col; g.fillRect(x, y, ww, hh); };
  const ox = 12, base = h - 4;   // building spans ox..ox+128 horizontally
  // stone base (기단)
  R(ox - 2, base - 12, 132, 12, '#b9b2a6'); R(ox - 2, base - 12, 132, 1, '#d2ccc0'); R(ox - 2, base - 1, 132, 1, '#8f897e');
  for (let y = base - 9; y < base - 1; y += 4) for (let x = ox + ((y >> 2) % 2) * 6; x < ox + 128; x += 12) R(x, y, 1, 3, '#9d968a');
  R(ox + 54, base - 4, 20, 4, '#c9c2b6');
  // walls & doors
  R(ox + 4, base - 34, 120, 22, night ? '#e9d5ac' : '#f2e8d2');
  const win = (x, y, ww, hh) => { R(x - 1, y - 1, ww + 2, hh + 2, '#8a5a34'); R(x, y, ww, hh, night ? '#ffd88a' : '#f6efe0'); for (let i = 3; i < ww; i += 3) R(x + i, y, 1, hh, '#a0703f'); for (let j = 3; j < hh; j += 4) R(x, y + j, ww, 1, '#a0703f'); };
  win(ox + 10, base - 30, 18, 13); win(ox + 34, base - 30, 14, 13); win(ox + 54, base - 32, 9, 19); win(ox + 65, base - 32, 9, 19); win(ox + 80, base - 30, 14, 13); win(ox + 100, base - 30, 18, 13);
  [ox + 4, ox + 30, ox + 50, ox + 76, ox + 96, ox + 120].forEach(x => { R(x, base - 36, 4, 24, '#8a5a34'); R(x + 3, base - 36, 1, 24, '#6e4628'); });
  // dancheong band
  R(ox, base - 40, 128, 5, '#3e8e6a'); for (let x = ox; x < ox + 128; x += 8) { R(x, base - 39, 4, 3, '#c4473f'); R(x + 1, base - 38, 2, 1, '#f3e7c9'); }
  // roof seen from above-front: tiled plane with upturned corners
  const roofTop = 4, eave = base - 40;
  for (let y = roofTop; y < eave; y++) {
    const k = (y - roofTop) / (eave - roofTop);
    const inset = Math.round(14 - 14 * k);
    const x0 = Math.max(0, inset), x1 = w - Math.max(0, inset);
    R(x0, y, x1 - x0, 1, y % 4 === 0 ? '#3c4556' : '#4b5568');
    if (y % 4 === 2) for (let x = x0 + 2; x < x1 - 2; x += 5) R(x, y, 1, 1, '#5d6879');
  }
  // eave edge with round tile ends + upturned corners
  R(0, eave - 2, w, 3, '#2f3746'); for (let x = 2; x < w - 2; x += 4) R(x, eave - 1, 2, 2, '#d9dde4');
  R(0, eave - 6, 4, 4, '#2f3746'); R(w - 4, eave - 6, 4, 4, '#2f3746'); R(1, eave - 8, 2, 2, '#2f3746'); R(w - 3, eave - 8, 2, 2, '#2f3746');
  // ridge (용마루)
  R(18, roofTop - 2, w - 36, 5, '#3a4252'); R(18, roofTop - 2, w - 36, 1, '#59637a'); R(18, roofTop + 1, w - 36, 1, '#cfd5de');
  R(14, roofTop - 5, 6, 6, '#3a4252'); R(w - 20, roofTop - 5, 6, 6, '#3a4252');
  // shadow under eave
  g.globalAlpha = 0.25; R(ox, eave + 1, 128, 3, '#2b2033'); g.globalAlpha = 1;
  return c;
}
function wallImg() {
  const c = cv(12, 40), g = c.getContext('2d'), R = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  R(1, 6, 10, 34, '#e9dcc0'); for (let y = 10; y < 40; y += 5) R(3 + (y % 2) * 3, y, 4, 2, '#b4a993');
  R(0, 2, 12, 5, '#4b5568'); R(0, 1, 12, 1, '#6b7689'); for (let x = 1; x < 12; x += 3) R(x, 6, 1, 1, '#d9dde4');
  return c;
}
function gardenImg() {
  const [a, b, c2, d] = Z.garden.map(v => v * TILE);
  const c = cv(c2 - a, d - b + 6), g = c.getContext('2d'), R = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  for (let row = 0; row < 8; row++) for (let i = 0; i < 6; i++) {
    const x = 4 + i * 10, y = 8 + row * 6; if (y > d - b) continue;
    if ((i + row) % 5 === 0) { R(x + 1, y - 10, 1, 10, '#4f8a33'); ellipseFill(g, x + 1, y - 12, 3, 3, '#f3c34f'); R(x, y - 13, 3, 2, '#7a4f2e'); continue; }  // sunflower
    if (row % 2) { ellipseFill(g, x + 2, y, 3, 2, '#7cbf5f'); R(x + 1, y - 1, 3, 1, '#a8dc7f'); R(x + 2, y, 1, 1, '#e9f6d2'); }    // cabbage
    else { R(x + 1, y - 3, 1, 3, '#4f8a33'); R(x, y - 2, 1, 2, '#e8463c'); R(x + 2, y - 1, 1, 2, '#e8463c'); }                    // chili
  }
  return c;
}
function archImg(level) {
  const [a, , c2] = Z.altar.map(v => v * TILE); const w = c2 - a + 8, c = cv(w, 40), g = c.getContext('2d');
  const R = (x, y, ww, hh, col) => { g.fillStyle = col; g.fillRect(x, y, ww, hh); }, P = (x, y, col) => R(x, y, 1, 1, col);
  const cx = w / 2;
  R(8, 12, 4, 26, '#f7f3ea'); R(11, 12, 1, 26, '#d8d0c0'); R(w - 12, 12, 4, 26, '#f7f3ea'); R(w - 9, 12, 1, 26, '#d8d0c0');
  for (let t = 0; t <= Math.PI; t += 0.01) for (let rr = 26; rr <= 30; rr++) P(Math.round(cx + Math.cos(t) * rr), Math.round(14 - Math.sin(t) * rr * 0.4), rr === 30 ? '#d8d0c0' : '#f7f3ea');
  const flower = (x, y, col) => { P(x, y - 1, col); P(x - 1, y, col); P(x + 1, y, col); P(x, y + 1, col); P(x, y, '#ffe9a8'); };
  const fr = rng(3);
  for (let t = 0; t <= Math.PI; t += 0.08) { const x = Math.round(cx + Math.cos(t) * 28), y = Math.round(14 - Math.sin(t) * 11); ellipseFill(g, x, y, 2, 2, '#5e9a46'); }
  for (let t = 0; t <= Math.PI; t += 0.12) { const x = Math.round(cx + Math.cos(t) * (27 + fr() * 2)), y = Math.round(14 - Math.sin(t) * 11); flower(x, y, ['#ff9ec4', '#ffffff', '#ffc39a', '#f27aa6'][Math.floor(fr() * 4)]); }
  for (let y = 16; y < 36; y += 5) { flower(9, y, '#ffffff'); flower(w - 10, y + 2, '#ff9ec4'); }
  g.globalAlpha = 0.5; for (let i = 0; i < 20; i++) { R(12, 14 + i, 3 + Math.round(4 * Math.sin(i / 20 * Math.PI)), 1, '#ffd6e4'); R(w - 15 - Math.round(4 * Math.sin(i / 20 * Math.PI)), 14 + i, 3 + Math.round(4 * Math.sin(i / 20 * Math.PI)), 1, '#ffd6e4'); } g.globalAlpha = 1;
  if (level >= 4) { R(cx - 12, 0, 24, 8, '#c8433f'); R(cx - 12, 0, 24, 1, '#e86a5f'); g.fillStyle = '#ffd75e'; g.font = '7px sans-serif'; g.fillText('囍', cx - 4, 7); }
  return c;
}
export const BANNER = { x: Z.carpet[0] * TILE - 10, y: 9 * TILE - 30, w: 3 * TILE + 20 };
function bannerImg() {
  const w = BANNER.w, c = cv(w, 38), g = c.getContext('2d'), R = (x, y, ww, h, col) => { g.fillStyle = col; g.fillRect(x, y, ww, h); };
  R(1, 4, 3, 34, '#7a4f2a'); R(w - 4, 4, 3, 34, '#7a4f2a'); R(1, 4, 1, 34, '#a06f3e'); R(w - 4, 4, 1, 34, '#a06f3e');
  R(0, 2, w, 2, '#5a3a22');
  R(5, 5, w - 10, 16, '#fff8ec'); R(5, 5, w - 10, 1, '#ffffff'); R(5, 20, w - 10, 1, '#d9c9a8'); R(4, 5, 1, 16, '#c99a6b'); R(w - 5, 5, 1, 16, '#c99a6b');
  [[6, 5], [w - 8, 5], [6, 19], [w - 8, 19]].forEach(([x, y]) => { R(x, y, 2, 2, '#ff9ec4'); });
  return c;
}
function vaseImg() { const c = cv(10, 14), g = c.getContext('2d'); ellipseFill(g, 5, 4, 4, 3, '#5e9a46'); [[3, 3, '#ff9ec4'], [6, 2, '#ffffff'], [5, 5, '#ffc39a'], [7, 4, '#f27aa6']].forEach(([x, y, col]) => { g.fillStyle = col; g.fillRect(x, y, 2, 2); }); g.fillStyle = '#e8dcc4'; g.fillRect(3, 7, 5, 6); g.fillStyle = '#c9bb9d'; g.fillRect(6, 7, 2, 6); return c; }
function wellImg() {
  const c = cv(40, 46), g = c.getContext('2d'), R = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  ellipseFill(g, 20, 38, 16, 7, '#8f897e'); ellipseFill(g, 20, 36, 16, 7, '#b9b2a6'); ellipseFill(g, 20, 35, 11, 4, '#2c4a6b'); ellipseFill(g, 18, 34, 4, 1, '#4f7fb0');
  R(5, 10, 3, 26, '#7a4f2a'); R(32, 10, 3, 26, '#7a4f2a');
  for (let y = 4; y < 14; y++) R(1 + (14 - y) / 2, y, 38 - (14 - y), 1, y % 3 ? '#4b5568' : '#3c4556');
  R(16, 16, 8, 6, '#8a5a34'); R(19, 14, 2, 10, '#4a3a35');
  return c;
}
function fountainImg() {
  const c = cv(40, 46), g = c.getContext('2d'), R = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  ellipseFill(g, 20, 38, 18, 7, '#8f897e'); ellipseFill(g, 20, 36, 18, 7, '#d6d0c4'); ellipseFill(g, 20, 35, 14, 5, '#58ade0'); ellipseFill(g, 18, 34, 6, 2, '#9ed6f0');
  R(18, 18, 4, 16, '#d6d0c4'); R(21, 18, 1, 16, '#b9b2a6'); ellipseFill(g, 20, 18, 7, 3, '#b9b2a6'); ellipseFill(g, 20, 17, 6, 2, '#7cc4e8');
  R(19, 8, 2, 9, '#bfe6f8'); R(18, 6, 4, 2, '#ffffff');
  return c;
}
function benchImg() { const c = cv(14, 12), g = c.getContext('2d'), R = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); }; R(0, 2, 14, 3, '#b98a5c'); R(0, 2, 14, 1, '#d1a273'); R(0, 6, 14, 3, '#a87a4c'); R(1, 9, 2, 3, '#6e4528'); R(11, 9, 2, 3, '#6e4528'); return c; }
function tableImg(i) {
  const w = 6 * TILE + 4, c = cv(w, 26), g = c.getContext('2d'), R = (x, y, ww, h, col) => { g.fillStyle = col; g.fillRect(x, y, ww, h); };
  R(0, 6, w, 12, '#fbf6ee'); R(0, 17, w, 6, '#e9dfcf'); R(0, 22, w, 1, '#c9bb9d'); R(0, 10, w, 3, '#c8433f'); R(0, 10, w, 1, '#e86a5f');
  const food = [
    (x) => { ellipseFill(g, x, 9, 5, 3, '#ffffff'); [[-3, '#f49ac1'], [0, '#ffffff'], [3, '#9fd36b']].forEach(([d, col]) => R(x + d - 1, 7, 3, 2, col)); },          // 떡
    (x) => { ellipseFill(g, x, 9, 5, 3, '#e0b070'); R(x - 3, 6, 2, 2, '#e8463c'); R(x, 6, 2, 2, '#f3c34f'); R(x + 2, 7, 2, 2, '#7cbf5f'); },                       // fruit
    (x) => { R(x - 4, 3, 9, 7, '#fff8ec'); R(x - 4, 3, 9, 1, '#ff9ec4'); R(x - 3, 0, 7, 3, '#fff8ec'); R(x, -2 + 2, 1, 1, '#ffd75e'); R(x - 1, 5, 3, 1, '#ff9ec4'); }, // cake
    (x) => { ellipseFill(g, x, 9, 5, 3, '#ffffff'); R(x - 3, 7, 6, 3, '#c97a3a'); R(x - 2, 7, 4, 1, '#e3a060'); },                                                  // 갈비/jeon
    (x) => { R(x - 1, 4, 2, 5, 'rgba(255,255,255,0.6)'); R(x - 1, 5, 2, 2, '#c84a62'); R(x + 3, 4, 2, 5, 'rgba(255,255,255,0.6)'); R(x + 3, 6, 2, 1, '#f3e08a'); },  // glasses
  ];
  for (let k = 0; k < 6; k++) food[(k + i * 2) % food.length](8 + k * 16);
  return c;
}
function photoWallImg() {
  const w = 4 * TILE + 4, c = cv(w, 40), g = c.getContext('2d'), R = (x, y, ww, h, col) => { g.fillStyle = col; g.fillRect(x, y, ww, h); };
  R(0, 2, w, 36, '#4f8a3e'); const fr = rng(8);
  for (let i = 0; i < 160; i++) { const x = Math.floor(fr() * (w - 2)) + 1, y = 3 + Math.floor(fr() * 33); R(x, y, 2, 2, ['#ff9ec4', '#ffffff', '#ffc39a', '#f27aa6', '#e8463c'][Math.floor(fr() * 5)]); }
  R(w / 2 - 12, 12, 24, 12, '#fff8ec'); R(w / 2 - 12, 12, 24, 1, '#c99a6b'); R(w / 2 - 12, 23, 24, 1, '#c99a6b');
  ['.x.x.', 'xxxxx', '.xxx.', '..x..'].forEach((row, y) => [...row].forEach((ch, x) => ch === 'x' && R(w / 2 - 3 + x, 15 + y, 1, 1, '#e66b8f')));
  R(2, 36, 3, 4, '#6e4528'); R(w - 5, 36, 3, 4, '#6e4528');
  return c;
}
function tripodImg() { const c = cv(12, 20), g = c.getContext('2d'), R = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); }; R(2, 1, 8, 6, '#2b2b36'); R(4, 2, 3, 3, '#8fd3ff'); R(8, 0, 2, 1, '#e8463c'); R(5, 7, 1, 12, '#4a4a55'); R(2, 12, 1, 7, '#4a4a55'); R(9, 12, 1, 7, '#4a4a55'); return c; }
function postImg() { const c = cv(6, 30), g = c.getContext('2d'); g.fillStyle = '#7a4f2a'; g.fillRect(2, 2, 3, 28); g.fillStyle = '#a06f3e'; g.fillRect(2, 2, 1, 28); g.fillStyle = '#4a3a35'; g.fillRect(1, 0, 5, 3); return c; }
function lanternPostImg() {
  const c = cv(14, 26), g = c.getContext('2d'), R = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  R(2, 2, 2, 24, '#7a4f2a'); R(2, 2, 9, 2, '#7a4f2a'); R(9, 4, 1, 2, '#4a3a35');
  R(6, 6, 7, 1, '#2b2033'); R(5, 7, 9, 3, '#3d63b8'); R(6, 7, 1, 3, '#5b82d6'); R(5, 10, 9, 3, '#d23d4b'); R(6, 10, 1, 3, '#ec6170'); R(6, 13, 7, 1, '#2b2033'); R(9, 14, 1, 2, '#f3c34f');
  ellipseFill(g, 3, 25, 3, 1, 'rgba(30,40,20,0.25)');
  return c;
}
function flamingoImg() {
  const c = cv(14, 20), g = c.getContext('2d'), P = (x, y, col) => { g.fillStyle = col; g.fillRect(x, y, 1, 1); };
  ellipseFill(g, 6, 10, 4, 2, '#f49ac1'); P(2, 9, '#f7b3d1'); P(3, 9, '#f7b3d1');
  [[9, 9], [10, 8], [10, 7], [9, 6], [9, 5], [10, 4], [11, 3]].forEach(([x, y]) => P(x, y, '#f49ac1'));
  P(11, 2, '#f49ac1'); P(12, 2, '#f49ac1'); P(13, 3, '#2b2033'); P(12, 3, '#f3f1ec'); P(12, 1, '#2b2033');
  for (let y = 12; y < 19; y++) P(6, y, '#e57aa8'); P(7, 14, '#e57aa8'); P(8, 15, '#e57aa8');
  g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(3, 19, 7, 1);
  return c;
}
function boatImg() { const c = cv(24, 12), g = c.getContext('2d'); ellipseFill(g, 12, 6, 11, 4, '#8a5a32'); ellipseFill(g, 12, 5, 9, 3, '#c18a52'); g.fillStyle = '#a06f3e'; g.fillRect(6, 4, 1, 4); g.fillRect(17, 4, 1, 4); g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(2, 10, 20, 1); return c; }
function flowerArchImg() {
  const w = 3 * TILE + 4, c = cv(w, 26), g = c.getContext('2d'), P = (x, y, col) => { g.fillStyle = col; g.fillRect(x, y, 1, 1); };
  g.fillStyle = '#7a4f2a'; g.fillRect(1, 6, 2, 20); g.fillRect(w - 3, 6, 2, 20);
  for (let t = 0; t <= Math.PI; t += 0.03) { const x = Math.round(w / 2 + Math.cos(t) * (w / 2 - 2)), y = Math.round(8 - Math.sin(t) * 6); P(x, y, '#5e9a46'); P(x, y + 1, '#4f8a3e'); if (Math.round(t * 30) % 4 === 0) { P(x, y - 1, '#ff9ec4'); P(x + 1, y, '#ffffff'); } }
  for (let y = 8; y < 24; y += 4) { P(2, y, '#ff9ec4'); P(w - 2, y + 2, '#ffffff'); }
  return c;
}
function hedgeImg(r, left) {
  const c = cv(20, 20), g = c.getContext('2d');
  ellipseFill(g, 10, 12, 10, 8, '#3f7a30'); ellipseFill(g, 9, 11, 8, 6, '#4f8a3e'); g.fillStyle = '#6fae52'; g.fillRect(5, 6, 2, 1); g.fillRect(11, 5, 2, 1);
  for (let k = 0; k < 3; k++) { const x = 4 + Math.floor(r() * 12), y = 7 + Math.floor(r() * 6), p = left ? '#e48bc2' : '#e8434f', m = left ? '#b8336a' : '#ffd75e';
    g.fillStyle = p; g.fillRect(x, y - 1, 1, 1); g.fillRect(x - 1, y, 1, 1); g.fillRect(x + 1, y, 1, 1); g.fillRect(x, y + 1, 1, 1); g.fillStyle = m; g.fillRect(x, y, 1, 1); }
  return c;
}

// small creatures
export function chickenImg(frame) {
  const c = cv(10, 10), g = c.getContext('2d'), P = (x, y, col) => { g.fillStyle = col; g.fillRect(x, y, 1, 1); };
  ellipseFill(g, 5, 6, 3, 2, '#fbf6ee'); P(7, 3 + frame, '#fbf6ee'); P(7, 4 + frame, '#fbf6ee'); P(8, 4 + frame, '#f3c34f'); P(7, 2 + frame, '#e8463c'); P(7, 3 + frame, '#2b2033');
  P(4, 9, '#f3c34f'); P(6, 9, '#f3c34f'); P(2, 5, '#e9dfcf');
  return c;
}
export function petImg(kind, frame) {
  const c = cv(14, 12), g = c.getContext('2d'), P = (x, y, col) => { g.fillStyle = col; g.fillRect(x, y, 1, 1); };
  const b = kind === 'cat' ? '#f0a35e' : '#c9a777', d = kind === 'cat' ? '#c97a3a' : '#8a6a4a';
  ellipseFill(g, 6, 7, 5, 3, b); ellipseFill(g, 11, 5, 3, 3, b);
  if (kind === 'cat') { P(9, 2, b); P(12, 2, b); P(10, 5, '#2b2033'); P(12, 5, '#2b2033'); P(1, 5 - frame, d); P(0, 4 - frame, d); }
  else { P(9, 3, d); P(13, 3, d); P(10, 5, '#2b2033'); P(12, 5, '#2b2033'); P(13, 6, '#2b2033'); P(0, 6 - frame, d); }
  [3, 5, 8, 10].forEach((x, i) => P(x, 10 + ((i + frame) % 2 ? 0 : 1) - 1, d));
  for (let x = 2; x < 9; x += 3) P(x, 6, d);
  return c;
}

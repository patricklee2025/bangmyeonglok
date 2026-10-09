// ============================================================
//  v5 map prototype — renderer, camera and demo villagers
//  Phone: swipe (momentum + soft edges) · pinch / double-tap zoom (snaps to crisp pixel steps) · zone chips · mini-map rail
//  TV: the ceremony stays the home shot; the camera glides slowly around the village and visits each new arrival
// ============================================================
import { TILE, TW, TH, W, H, Z, STOPS, buildGround, buildProps, buildWalk, spots, drawOverhead, lightSources, isWater, rng, ellipse } from './world.js';
import { getSprite, randomAvatar, SPRITE_W, SPRITE_H } from './avatar.js';

const T = TILE;
const $ = s => document.querySelector(s);
const cvs = $('#map'), ctx = cvs.getContext('2d', { alpha: false });
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------------- world ----------------
const ground = buildGround(), props = buildProps(), walk = buildWalk(), SP = spots(walk);
const lights = lightSources();

// water sparkles (precomputed, drawn only when in view)
const sparkles = [];
{ const r = rng(99); for (let i = 0; i < 900 && sparkles.length < 420; i++) { const x = Math.floor(r() * W), y = Math.floor(r() * H); if (isWater(x, y) && isWater(x + 3, y) && isWater(x - 3, y)) sparkles.push({ x, y, p: r() * 6.28, s: 0.6 + r() * 1.4 }); } }

// ---------------- villagers ----------------
const NAMES = ['민지', '서준', 'Emily', '하은', '도윤', 'Jake', '수아', '지호', 'Olivia', '예린', '현우', 'Daniel', '채원', '준서', 'Grace', '유나', '시우', 'Sophia', '다인', '건우', 'Liam', '소율', '태오', 'Mia', '나은', '우진', 'Noah', '서윤', '은호', 'Chloe'];
const ACTS = ['sit', 'sit', 'chat', 'eat', 'eat', 'dance', 'pond', 'fish', 'beach', 'yard', 'hill', 'walk', 'walk'];
const vr = rng(2027);
const people = [];
function bfs(sx, sy, tx, ty) {
  if (!walk[ty]?.[tx]) return null;
  const prev = new Int16Array(TW * TH).fill(-1), q = [sy * TW + sx]; prev[sy * TW + sx] = sy * TW + sx;
  for (let qi = 0; qi < q.length; qi++) {
    const cur = q[qi], cx = cur % TW, cy = (cur / TW) | 0;
    if (cx === tx && cy === ty) { const path = []; let k = cur; while (k !== sy * TW + sx) { path.push([k % TW, (k / TW) | 0]); k = prev[k]; } return path.reverse(); }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy, ni = ny * TW + nx;
      if (nx < 0 || ny < 0 || nx >= TW || ny >= TH || prev[ni] !== -1 || !walk[ny][nx]) continue;
      prev[ni] = cur; q.push(ni);
    }
  }
  return null;
}
const pick = a => a[Math.floor(vr() * a.length)];
function newPerson(name, tx, ty, opts = {}) {
  const av = opts.avatar || randomAvatar({}, vr() < 0.5 ? 'female' : 'male', vr);
  const p = { name, spr: getSprite(av), x: tx * T + 8, y: ty * T + 12, path: null, wait: 1 + vr() * 6, act: 'walk', dir: 1, anim: vr() * 10, fixed: !!opts.fixed, frame: 'idle', base: 0, born: performance.now() };
  people.push(p); return p;
}
function plan(p) {
  const act = pick(ACTS), list = SP[act];
  if (!list?.length) return;
  const [tx, ty] = pick(list), path = bfs(Math.floor(p.x / T), Math.floor((p.y - 4) / T), tx, ty);
  if (path) { p.path = path; p.act = act; }
}
{ const starts = SP.walk;
  for (let i = 0; i < 28; i++) { const [x, y] = pick(starts); newPerson(NAMES[i % NAMES.length], x, y); } }
// the couple at the ceremony table: groom (east, blue side) and bride (west, red side)
const couple = [
  newPerson('지환', 11, 20, { fixed: true, avatar: { skin: 2, hair: 0, hairStyle: 'comma', face: 'oval', eyes: 'smile', brows: 'thick', mouth: 'smile', outfit: 'durumagi', color: 1, color2: 3, acc: 'gat' } }),
  newPerson('선경', 12, 20, { fixed: true, avatar: { skin: 1, hair: 1, hairStyle: 'chignon', face: 'oval', eyes: 'lash', brows: 'thin', mouth: 'smile', outfit: 'dangui', color: 7, color2: 9, acc: 'binyeo' } }),
];
couple.forEach(p => { p.x = (p === couple[0] ? 11 : 12) * T + 8; p.y = 20 * T + 4; });

function stepPeople(dt, now) {
  for (const p of people) {
    p.anim += dt;
    if (p.fixed) { p.frame = Math.floor(now / 1000 * 0.5) % 7 === 0 ? 'blink' : 'idle'; continue; }
    if (p.path && p.path.length) {
      const [tx, ty] = p.path[0], gx = tx * T + 8, gy = ty * T + 12, dx = gx - p.x, dy = gy - p.y, d = Math.hypot(dx, dy), sp = 24 * dt;
      if (d <= sp) { p.x = gx; p.y = gy; p.path.shift(); }
      else { p.x += dx / d * sp; p.y += dy / d * sp; if (Math.abs(dx) > 0.5) p.dir = dx > 0 ? 1 : -1; }
      const up = dy < -0.5 && Math.abs(dy) > Math.abs(dx), step = Math.floor(p.anim * 6) % 2;
      p.frame = up ? (step ? 'back1' : 'back2') : (step ? 'walk1' : 'walk2');
      if (!p.path.length) { p.path = null; p.wait = 4 + vr() * 12; }
    } else {
      p.wait -= dt;
      p.frame = p.act === 'dance' ? (Math.floor(p.anim * 2.5) % 2 ? 'up' : 'wave') : p.act === 'eat' ? (Math.floor(p.anim * 1.2) % 3 ? 'idle' : 'eat') : (Math.floor(p.anim * 0.7) % 9 === 0 ? 'blink' : 'idle');
      if (p.wait <= 0) plan(p);
    }
  }
}

// ---------------- view & camera ----------------
const params = new URLSearchParams(location.search);
let mode = params.get('view') || location.hash.slice(1) || (matchMedia('(pointer: coarse)').matches ? 'phone' : 'tv');
if (mode !== 'tv') mode = 'phone';
let dpr = 1, Zd = 0, zLevels = [], zoomAnim = null;
const cam = { x: 0, y: 0, vx: 0, vy: 0 };
let glide = null;          // { x0, y0, x1, y1, t0, dur }
let springing = false;
const viewW = () => cvs.width / Zd, viewH = () => cvs.height / Zd;
const bounds = () => ({ minX: Math.min(0, (W - viewW()) / 2), maxX: Math.max(0, W - viewW()), minY: -10, maxY: Math.max(0, H - viewH()) + 10 });
function clampCam(soft = false) {
  const b = bounds(); let over = false;
  for (const [k, lo, hi] of [['x', b.minX, b.maxX], ['y', b.minY, b.maxY]]) {
    if (b.maxX < 0 && k === 'x') { cam.x = (W - viewW()) / 2; continue; }
    if (cam[k] < lo) { if (soft) over = true; else cam[k] = lo; }
    if (cam[k] > hi) { if (soft) over = true; else cam[k] = hi; }
  }
  return over;
}
function layout() {
  dpr = Math.min(3, window.devicePixelRatio || 1);
  const vw = innerWidth, vh = innerHeight;
  cvs.width = Math.round(vw * dpr); cvs.height = Math.round(vh * dpr);
  cvs.style.width = vw + 'px'; cvs.style.height = vh + 'px';
  // crisp zoom steps: whole device pixels per world pixel
  const fitW = cvs.width / W;
  if (mode === 'tv') { zLevels = [Math.max(1, fitW)]; }
  else {
    const close = Math.max(2, Math.round(cvs.width / (14.5 * T)));            // ≈ 14½ tiles across — characters big enough to recognise
    const fit = Math.max(1, Math.floor(fitW));                               // the whole width of the village
    zLevels = [...new Set([fit, Math.round((fit + close) / 2), close, close + Math.max(1, Math.round(close / 3))])].filter(z => z >= 1).sort((a, b) => a - b);
  }
  const centre = { x: cam.x + viewW() / 2, y: cam.y + viewH() / 2 };
  if (!zLevels.includes(Zd)) Zd = mode === 'tv' ? zLevels[0] : zLevels[Math.min(2, zLevels.length - 1)];
  if (!layout.done) { const s = STOPS[1]; centre.x = s.x; centre.y = s.y; layout.done = true; }
  cam.x = centre.x - viewW() / 2; cam.y = centre.y - viewH() / 2; clampCam();
  document.body.dataset.mode = mode;
  paintRail();
}
addEventListener('resize', layout);

const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
function glideTo(x, y, dur = 0.8) {
  const b = bounds(), tx = Math.max(b.minX, Math.min(b.maxX, x - viewW() / 2)), ty = Math.max(0, Math.min(b.maxY - 10, y - viewH() / 2));
  glide = { x0: cam.x, y0: cam.y, x1: tx, y1: ty, t0: performance.now(), dur: reduceMotion ? 0.01 : dur * 1000 };
  cam.vx = cam.vy = 0;
}
function zoomTo(z, fx, fy) {   // fx, fy: focus in screen device px
  z = Math.max(zLevels[0], Math.min(zLevels[zLevels.length - 1], z));
  zoomAnim = { z0: Zd, z1: z, fx, fy, wx: cam.x + fx / Zd, wy: cam.y + fy / Zd, t0: performance.now(), dur: reduceMotion ? 1 : 260 };
}
function setZoomAround(z, fx, fy, wx, wy) { Zd = z; cam.x = wx - fx / Zd; cam.y = wy - fy / Zd; }

// ---- touch / mouse
const pointers = new Map();
let drag = null, pinch = null, lastTap = 0, interacted = false;
const samples = [];
cvs.addEventListener('pointerdown', e => {
  cvs.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX * dpr, y: e.clientY * dpr });
  glide = null; zoomAnim = null; springing = false; touched();
  if (mode === 'tv') return;
  if (pointers.size === 1) { drag = { x: e.clientX * dpr, y: e.clientY * dpr, cx: cam.x, cy: cam.y, moved: false }; samples.length = 0; cam.vx = cam.vy = 0; }
  else if (pointers.size === 2) {
    const [a, b] = [...pointers.values()], fx = (a.x + b.x) / 2, fy = (a.y + b.y) / 2;
    pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y), z0: Zd, wx: cam.x + fx / Zd, wy: cam.y + fy / Zd }; drag = null;
  }
});
cvs.addEventListener('pointermove', e => {
  const p = pointers.get(e.pointerId); if (!p) return;
  p.x = e.clientX * dpr; p.y = e.clientY * dpr;
  if (pinch && pointers.size >= 2) {
    const [a, b] = [...pointers.values()], fx = (a.x + b.x) / 2, fy = (a.y + b.y) / 2, d = Math.hypot(a.x - b.x, a.y - b.y);
    const lo = zLevels[0] * 0.8, hi = zLevels[zLevels.length - 1] * 1.25;
    setZoomAround(Math.max(lo, Math.min(hi, pinch.z0 * d / pinch.d0)), fx, fy, pinch.wx, pinch.wy);
    return;
  }
  if (!drag) return;
  const dx = p.x - drag.x, dy = p.y - drag.y;
  if (!drag.moved && Math.hypot(dx, dy) > 8 * dpr) drag.moved = true;
  let nx = drag.cx - dx / Zd, ny = drag.cy - dy / Zd;
  const b = bounds(), rub = (v, lo, hi) => v < lo ? lo - Math.min(48, (lo - v) * 0.35) : v > hi ? hi + Math.min(48, (v - hi) * 0.35) : v;   // soft edges
  cam.x = b.maxX <= 0 ? (W - viewW()) / 2 : rub(nx, b.minX, b.maxX); cam.y = rub(ny, b.minY, b.maxY);
  const now = performance.now(); samples.push([now, cam.x, cam.y]); while (samples.length && now - samples[0][0] > 90) samples.shift();
});
function endPointer(e) {
  pointers.delete(e.pointerId);
  if (pinch && pointers.size < 2) {
    // snap to the nearest crisp zoom step
    const target = zLevels.reduce((best, z) => Math.abs(Math.log(z / Zd)) < Math.abs(Math.log(best / Zd)) ? z : best, zLevels[0]);
    zoomTo(target, cvs.width / 2, cvs.height / 2); pinch = null;
    const rest = [...pointers.values()][0]; drag = rest ? { x: rest.x, y: rest.y, cx: cam.x, cy: cam.y, moved: true } : null; samples.length = 0;
    return;
  }
  if (!drag) return;
  if (!drag.moved) {   // a tap: double-tap toggles close ↔ whole width
    const now = performance.now();
    if (now - lastTap < 320) { const far = Zd > zLevels[0] ? zLevels[0] : zLevels[Math.min(2, zLevels.length - 1)]; zoomTo(far, e.clientX * dpr, e.clientY * dpr); lastTap = 0; }
    else lastTap = now;
  } else if (samples.length > 1) {
    const [t0, x0, y0] = samples[0], [t1, x1, y1] = samples[samples.length - 1], dt = Math.max(16, t1 - t0) / 1000;
    cam.vx = (x1 - x0) / dt; cam.vy = (y1 - y0) / dt;
    const max = 2600 / Zd * dpr; cam.vx = Math.max(-max, Math.min(max, cam.vx)); cam.vy = Math.max(-max, Math.min(max, cam.vy));
  }
  drag = null; springing = true;
}
cvs.addEventListener('pointerup', endPointer); cvs.addEventListener('pointercancel', endPointer);
cvs.addEventListener('wheel', e => {
  e.preventDefault(); touched(); glide = null;
  if (e.ctrlKey || e.metaKey) { const i = zLevels.indexOf(Zd), j = Math.max(0, Math.min(zLevels.length - 1, (i < 0 ? 0 : i) + (e.deltaY > 0 ? -1 : 1))); zoomTo(zLevels[j], e.clientX * dpr, e.clientY * dpr); return; }
  cam.x += e.deltaX * dpr / Zd; cam.y += e.deltaY * dpr / Zd; clampCam();
}, { passive: false });
addEventListener('keydown', e => {
  const k = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[e.key];
  if (k && mode === 'phone') { glide = null; cam.vx = k[0] * 260; cam.vy = k[1] * 260; springing = true; }
});

function updateCamera(dt, now) {
  if (zoomAnim) {
    const k = Math.min(1, (now - zoomAnim.t0) / zoomAnim.dur), e = ease(k);
    setZoomAround(zoomAnim.z0 + (zoomAnim.z1 - zoomAnim.z0) * e, zoomAnim.fx, zoomAnim.fy, zoomAnim.wx, zoomAnim.wy);
    if (k >= 1) { Zd = zoomAnim.z1; zoomAnim = null; springing = true; }
    return;
  }
  if (glide) {
    const k = Math.min(1, (now - glide.t0) / glide.dur), e = ease(k);
    cam.x = glide.x0 + (glide.x1 - glide.x0) * e; cam.y = glide.y0 + (glide.y1 - glide.y0) * e;
    if (k >= 1) glide = null;
    return;
  }
  if (mode === 'tv') { tvTour(dt, now); return; }
  if (drag || pinch) return;
  if (springing) {
    // momentum: time-based exponential decay (same feel at 60 and 120 Hz); soft edges spring back
    const decay = Math.exp(-dt / 0.33);
    cam.x += cam.vx * dt; cam.y += cam.vy * dt; cam.vx *= decay; cam.vy *= decay;
    const b = bounds(), pull = (k, lo, hi) => { if (cam[k] < lo) { cam[k] += (lo - cam[k]) * Math.min(1, dt * 12); cam['v' + k] *= 0.5; } else if (cam[k] > hi) { cam[k] += (hi - cam[k]) * Math.min(1, dt * 12); cam['v' + k] *= 0.5; } };
    if (b.maxX <= 0) cam.x = (W - viewW()) / 2; else pull('x', b.minX, b.maxX);
    pull('y', b.minY, b.maxY);
    if (Math.hypot(cam.vx, cam.vy) < 4 && !clampCam(true)) { cam.vx = cam.vy = 0; springing = false; }
  }
}

// ---- TV: the ceremony is home; a slow loop through the village; new arrivals get a visit
let tv = { i: 1, until: 0, visiting: null };
const TV_ROUTE = [1, 2, 1, 0, 1, 3, 4, 1, 5, 2];        // indexes into STOPS — the wedding (1) keeps coming back
function tvTour(dt, now) {
  if (tv.visiting) { const p = tv.visiting; if (now > tv.visitUntil) tv.visiting = null; else { cam.x += (p.x - viewW() / 2 - cam.x) * Math.min(1, dt * 1.6); cam.y += (p.y - 20 - viewH() / 2 - cam.y) * Math.min(1, dt * 1.6); clampCam(); return; } }
  if (now > tv.until) {
    tv.i = (tv.i + 1) % TV_ROUTE.length; const s = STOPS[TV_ROUTE[tv.i]];
    glideTo(s.x, s.y, 5.5); tv.until = now + (TV_ROUTE[tv.i] === 1 ? 22000 : 12000);
    setActiveChip(s.id);
  } else { cam.x += Math.sin(now / 4000) * 2 * dt; cam.y += Math.cos(now / 5200) * 1.5 * dt; }   // a gentle drift while it rests
}

// ---------------- arrivals (demo: someone new walks in through the gate every ~25 s) ----------------
let nextArrival = performance.now() + 9000, arrivals = 0;
const MORE = ['Hannah', '지우', 'Lucas', '서아', 'Ella', '로운', 'Ben', '아린'];
function arrive(now) {
  const p = newPerson(MORE[arrivals++ % MORE.length], 11, 15);
  p.wait = 0.5; p.act = 'sit'; p.arrived = now;
  const [tx, ty] = pick(SP.sit); p.path = bfs(11, 15, tx, ty);
  if (mode === 'tv') { tv.visiting = p; tv.visitUntil = now + 7000; glide = null; }
  else toast(`🎉 ${p.name} 님이 마을에 들어왔어요`, () => glideTo(p.x, p.y, 0.9));
}

// ---------------- render ----------------
const items = [];
props.forEach(pr => items.push({ k: 0, o: pr, base: pr.base }));
let petals = [];
{ const r = rng(5); for (let i = 0; i < 70; i++) petals.push({ x: r() * W, y: r() * H, vx: 4 + r() * 6, vy: 8 + r() * 8, p: r() * 6.28, c: r() < 0.5 ? '#ffd0e0' : '#ffffff' }); }
let fontPx = 11;
function render(now) {
  const g = ctx, t = now / 1000;
  g.setTransform(1, 0, 0, 1, 0, 0); g.imageSmoothingEnabled = false;
  g.fillStyle = '#2c5f4f'; g.fillRect(0, 0, cvs.width, cvs.height);
  const ox = Math.round(cam.x * Zd), oy = Math.round(cam.y * Zd);
  g.setTransform(Zd, 0, 0, Zd, -ox, -oy);
  const vx = ox / Zd, vy = oy / Zd, vw = viewW(), vh = viewH();
  // ground (only the visible part)
  const sx = Math.max(0, Math.floor(vx)), sy = Math.max(0, Math.floor(vy)), sw = Math.min(W - sx, Math.ceil(vw) + 2), sh = Math.min(H - sy, Math.ceil(vh) + 2);
  if (sw > 0 && sh > 0) g.drawImage(ground, sx, sy, sw, sh, sx, sy, sw, sh);
  // water sparkles
  for (const s of sparkles) {
    if (s.x < vx || s.x > vx + vw || s.y < vy || s.y > vy + vh) continue;
    const a = Math.sin(t * s.s + s.p); if (a < 0.55) continue;
    g.fillStyle = a > 0.9 ? '#ffffff' : '#c6ecf8'; g.fillRect(s.x, s.y, a > 0.85 ? 2 : 1, 1);
  }
  // y-sorted props + people (insertion sort keeps it allocation-free and fast on a nearly sorted list)
  for (const it of items) it.base = it.k ? it.o.y : it.o.base;
  for (let i = 1; i < items.length; i++) { const it = items[i]; let j = i - 1; while (j >= 0 && items[j].base > it.base) { items[j + 1] = items[j]; j--; } items[j + 1] = it; }
  for (const it of items) {
    if (it.k === 0) {
      const p = it.o; if (p.x > vx + vw || p.x + p.img.width < vx || p.y > vy + vh || p.y + p.img.height < vy) continue;
      g.drawImage(p.img, p.x, p.y);
    } else {
      const p = it.o, x = Math.round(p.x), y = Math.round(p.y);
      if (x + 12 < vx || x - 12 > vx + vw || y < vy || y - 40 > vy + vh) continue;
      ellipse(g, x, y, 6, 2, 'rgba(30,40,20,0.25)');
      const img = p.spr[p.frame] || p.spr.idle;
      const bob = p.frame === 'up' ? -1 : 0;
      if (p.dir < 0 && !p.frame.startsWith('back')) { g.save(); g.translate(x + SPRITE_W / 2, y - SPRITE_H + 2 + bob); g.scale(-1, 1); g.drawImage(img, 0, 0); g.restore(); }
      else g.drawImage(img, x - SPRITE_W / 2, y - SPRITE_H + 2 + bob);
      if (p.arrived && now - p.arrived < 2500) { const k = (now - p.arrived) / 2500; g.fillStyle = `rgba(255,236,150,${0.8 * (1 - k)})`; for (let i = 0; i < 6; i++) { const a = i / 6 * 6.28 + k * 4; g.fillRect(Math.round(x + Math.cos(a) * (8 + k * 10)), Math.round(y - 16 + Math.sin(a) * (8 + k * 10)), 2, 2); } }
    }
  }
  drawOverhead(g, t, { x: vx, y: vy, w: vw, h: vh });
  // cherry petals drifting through the view
  if (!reduceMotion) for (const p of petals) {
    const x = ((p.x + t * p.vx + Math.sin(t + p.p) * 6) % W + W) % W, y = ((p.y + t * p.vy) % H + H) % H;
    if (x < vx || x > vx + vw || y < vy || y > vy + vh) continue;
    g.fillStyle = p.c; g.fillRect(Math.round(x), Math.round(y), 2, 1); g.fillRect(Math.round(x) + (Math.sin(t * 3 + p.p) > 0 ? 1 : 0), Math.round(y) + 1, 1, 1);
  }
  // name tags (screen space, fixed size)
  g.setTransform(1, 0, 0, 1, 0, 0);
  const showNames = Zd / dpr >= 1.3 || mode === 'tv';
  if (showNames) {
    fontPx = Math.round((mode === 'tv' ? Math.max(12, Zd * 2.4) : 11 * dpr));
    g.font = `700 ${fontPx}px Galmuri11, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif`; g.textAlign = 'center'; g.textBaseline = 'bottom';
    for (const p of people) {
      const sxp = Math.round((p.x - cam.x) * Zd), syp = Math.round((p.y - SPRITE_H - 1 - cam.y) * Zd);
      if (sxp < -60 || sxp > cvs.width + 60 || syp < 0 || syp > cvs.height + 40) continue;
      const w = g.measureText(p.name).width + fontPx * 0.8, h = fontPx * 1.35;
      g.fillStyle = p.fixed ? 'rgba(200,67,63,0.92)' : 'rgba(43,32,51,0.72)'; g.fillRect(sxp - w / 2, syp - h, w, h);
      g.fillStyle = '#fff8ec'; g.fillText(p.name, sxp, syp - fontPx * 0.12);
    }
  }
}

// ---------------- HUD: zone chips · mini-map rail · toast · mode switch ----------------
const chips = $('#chips');
STOPS.forEach(s => {
  const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.dataset.id = s.id;
  const i = document.createElement('span'); i.className = 'chip-i'; i.textContent = s.icon;
  const l = document.createElement('span'); l.textContent = s.ko; b.append(i, l);
  b.addEventListener('click', () => { touched(); if (mode === 'tv') return; glideTo(s.x, s.y); setActiveChip(s.id); });
  chips.append(b);
});
function setActiveChip(id) { for (const b of chips.children) b.setAttribute('aria-pressed', String(b.dataset.id === id)); }
function nearestStop() { const cy = cam.y + viewH() / 2; let best = STOPS[0]; for (const s of STOPS) if (Math.abs(s.y - cy) < Math.abs(best.y - cy)) best = s; return best.id; }

const rail = $('#rail'), rctx = rail.getContext('2d'), railBox = $('#rail-box');
let railScale = 1;
function paintRail() {
  const cssW = 56, cssH = Math.round(cssW * H / W);
  $('#rail-wrap').style.height = cssH + 'px';
  const ww = Math.round(cssW * dpr), hh = Math.round(cssH * dpr);
  rail.width = ww; rail.height = hh; rail.style.width = cssW + 'px'; rail.style.height = cssH + 'px';
  rctx.imageSmoothingEnabled = true; rctx.drawImage(ground, 0, 0, W, H, 0, 0, ww, hh);
  for (const p of props) if (p.img.width > 40) rctx.drawImage(p.img, p.x * ww / W, p.y * hh / H, p.img.width * ww / W, p.img.height * hh / H);
  railScale = hh / H / dpr;   // css px per world px
}
function updateRail() {
  railBox.style.transform = `translate(${Math.round(Math.max(0, cam.x) * railScale)}px, ${Math.round(Math.max(0, cam.y) * railScale)}px)`;
  railBox.style.width = Math.round(Math.min(W, viewW()) * railScale) + 'px'; railBox.style.height = Math.round(Math.min(H, viewH()) * railScale) + 'px';
}
let railDrag = false;
const railTo = e => { const r = rail.getBoundingClientRect(); const wy = (e.clientY - r.top) / railScale, wx = (e.clientX - r.left) / railScale; cam.x = wx - viewW() / 2; cam.y = wy - viewH() / 2; clampCam(); cam.vx = cam.vy = 0; glide = null; };
$('#rail-wrap').addEventListener('pointerdown', e => { if (mode === 'tv') return; railDrag = true; e.currentTarget.setPointerCapture(e.pointerId); touched(); railTo(e); });
$('#rail-wrap').addEventListener('pointermove', e => { if (railDrag) railTo(e); });
$('#rail-wrap').addEventListener('pointerup', () => { railDrag = false; });

let toastT = 0;
function toast(text, onTap) {
  const el = $('#toast'); el.textContent = text; el.hidden = false; el.onclick = () => { el.hidden = true; onTap?.(); };
  clearTimeout(toastT); toastT = setTimeout(() => { el.hidden = true; }, 5000);
}
function touched() { if (interacted) return; interacted = true; $('#hint').classList.add('gone'); }

$('#mode').addEventListener('click', () => { mode = mode === 'tv' ? 'phone' : 'tv'; layout.done = false; Zd = 0; layout(); syncMode(); tv.until = 0; });
function syncMode() { $('#mode').textContent = mode === 'tv' ? '📱 폰으로 보기' : '📺 TV로 보기'; $('#hint-text').textContent = mode === 'tv' ? 'TV: 혼례 마당을 중심으로 천천히 둘러봐요' : '위아래로 밀어 둘러보기 · 두 번 탭하면 전체'; }
syncMode();

// ---------------- loop ----------------
layout();
let last = performance.now(), chipT = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  stepPeople(dt, now);
  if (now > nextArrival) { arrive(now); nextArrival = now + 25000; }
  updateCamera(dt, now);
  render(now);
  updateRail();
  if (mode === 'phone' && now > chipT) { chipT = now + 250; setActiveChip(nearestStop()); }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
people.forEach(p => items.push({ k: 1, o: p, base: p.y }));
const _push = people.push.bind(people);
people.push = (...ps) => { ps.forEach(p => items.push({ k: 1, o: p, base: p.y })); return _push(...ps); };
window.__proto = { cam, get Zd() { return Zd; }, zLevels: () => zLevels, glideTo, STOPS, people };

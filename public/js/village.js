// ============================================================
//  Village display (TV / projector) — top-down pixel village
//  keys: F fullscreen · S save PNG · H hide panels · M sound · N night/day
//        B bouquet toss · G group photo · X fireworks
//  demo mode only: D add sample guest · E random emote · L +5 guests
// ============================================================
import { CONFIG, DEMO, LEVELS } from './config.js';
import { getStore, EMOTES } from './store.js';
import { getSprite, randomAvatar, SPRITE_W, SPRITE_H } from './avatar.js';
import { W, H, TILE, TW, TH, Z, BANNER, buildGround, buildProps, buildWalk, spots, drawOverhead, lightSources, isWater, chickenImg, petImg } from './scene.js';
import { getLang, t, applyI18n } from './i18n.js';
import { qrcode } from './vendor/qrcode.mjs';
import { mountSnapUploader, mySnaps, setSnapSink } from './snaps.js';
import { emit, on as busOn } from './core/bus.js';                 // v4: page events for features (02 §5) — no-ops when nobody listens
import { bootFeatures, whenGateReady } from './core/features.js';  // v4: feature loader (WP-00b); the feature-facing code is in "v4 extension points" at the bottom
import { getLive } from './core/settings.js';
import { currentPhase } from './core/phase.js';
setSnapSink(emit);                                                  // snaps.js reports 'snap:uploaded' through the bus

const $ = s => document.querySelector(s);
const world = $('#world'), wctx = world.getContext('2d');
const over = $('#overlay'), octx = over.getContext('2d');
const stage = $('#stage'), hud = $('.hud');
world.width = W; world.height = H; wctx.imageSmoothingEnabled = false;
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];
const lang = getLang();
const params = new URLSearchParams(location.search);

// ============================================================
//  v4 hook state (WP-00c §5) — features reach this page only through ctx.v ("v4 extension points" at the bottom).
//  Everything below is empty / null while every feature is off, so each hook point costs one empty-loop check.
// ============================================================
let quiet = false;                                       // live.quiet (the admin's 🤫 toggle): no chime, fireworks, polaroid, spotlight or banner while true
let updHooks = [], decoHooks = [], extraProps = [];      // replaced — never edited — on removal, so a loop that is running keeps its own snapshot
const layerHooks = { ground: [], overhead: [], fx: [] };
const overlayHooks = { 'under-tags': [], 'over-tags': [], top: [] };
let presenceP = null, tickerExtraP = null, tickerPrefixP = null;       // one-feature-only providers { fn, scope } (ctx.v.setPresence …)
let gestureHooks = [], tapHooks = []; const keyHooks = new Map();         // ctx.v.keys.add · onGesture · onTap (the listeners are at the bottom)
let syncing = false;                                                     // inside sync(): a ctx.v.refresh() from a bus handler waits for the next tick
const arrivals = new Map();                              // gid → via ('checkin' …): ctx.v.arrive() marks a guest; the next sync() that creates the villager uses it
const heldBack = new Set();                              // guests the presence filter kept out: when they show up later without arrive() they are not a "new arrival"
let lastList = [];                                       // the list the last sync() got — ctx.v.refresh() runs it again
let frameTime = 0;                                       // seconds, set once per frame (overlay hooks read it)
const HINFO = { time: 0, dt: 0, night: false, level: 0 };                 // reused every frame — hooks must not keep these objects
const DINFO = { x: 0, y: 0, time: 0 };
const OINFO = { X: null, Y: null, k: 1, fs: 11, dpr: 1, time: 0, w: 0, h: 0 };
function runHooks(list, a, b) { for (let i = 0; i < list.length; i++) { const h = list[i]; if (!h.scope.alive()) continue; try { h.fn(a, b); } catch (e) { h.scope.report(e); } } }
function drawLayer(name) {
  const list = layerHooks[name]; if (!list.length) return;
  for (let i = 0; i < list.length; i++) { const h = list[i]; if (!h.scope.alive()) continue; wctx.save(); try { h.fn(wctx, HINFO); } catch (e) { h.scope.report(e); } wctx.restore(); }
}
function decorate(e, x, y, time) {
  const list = decoHooks, api = villagerApi(e); DINFO.x = x; DINFO.y = y; DINFO.time = time;
  for (let i = 0; i < list.length; i++) { const h = list[i]; if (!h.scope.alive()) continue; wctx.save(); try { h.fn(wctx, api, DINFO); } catch (er) { h.scope.report(er); } wctx.restore(); }
}
function overlayLayer(name) {
  const list = overlayHooks[name]; if (!list.length) return;
  for (let i = 0; i < list.length; i++) { const h = list[i]; if (!h.scope.alive()) continue; octx.save(); try { h.fn(octx, OINFO); } catch (e) { h.scope.report(e); } octx.restore(); }
}

// ---------- time of day ----------
const timeMode = params.get('time') || CONFIG.timeOfDay;
const autoNight = () => { if (timeMode === 'night') return true; if (timeMode === 'sunset' || timeMode === 'day') return false; const h = new Date().getHours(); return h >= 19 || h < 5; };
let night = autoNight(), nightManual = false;

// ---------- world state ----------
let level = 0;
const levelFor = n => LEVELS.filter(l => n >= l.at).length;
let ground = buildGround(), props = [], walk = [], SP = {};
function rebuild() { props = buildProps(level, night); walk = buildWalk(level); SP = spots(walk); }
rebuild();

// ---------- layout & camera ----------
// TV/desktop: "fit" (whole map, letterboxed). Phones: "fill" (map fills the screen, drag to pan / follows you).
const FORCE_TV = params.has('host') || params.has('tv');
// phones/tablets: coarse pointer and no hover. A touchscreen laptop driving the TV is NOT a phone.
// (fallback: any touch screen narrower than 600px is a phone, in case a browser misreports the pointer)
const TOUCH = !FORCE_TV && (matchMedia('(pointer: coarse)').matches || (navigator.maxTouchPoints > 0 && Math.min(screen.width, screen.height) < 600));
if (TOUCH) document.body.classList.add('touch');
let viewMode = params.get('view') || (TOUCH ? 'fill' : 'fit');
let S = 1, dpr = 1, baseX = 0, baseY = 0, maxCamX = 0, maxCamY = 0;
let camX = 0, camY = 0, camVX = 0, camVY = 0;
const view = { x: 0, y: 0, w: 0, h: 0 };
function layout() {
  dpr = Math.min(2, window.devicePixelRatio || 1);
  const vw = innerWidth, vh = innerHeight;
  S = viewMode === 'fill' ? Math.max(vw / W, vh / H) : Math.min(vw / W, vh / H);
  const sw = W * S, sh = H * S;
  baseX = sw < vw ? Math.floor((vw - sw) / 2) : 0; baseY = sh < vh ? Math.floor((vh - sh) / 2) : 0;
  maxCamX = Math.max(0, sw - vw); maxCamY = Math.max(0, sh - vh);
  Object.assign(view, { x: baseX, y: baseY, w: Math.min(sw, vw), h: Math.min(sh, vh) });
  Object.assign(stage.style, { width: sw + 'px', height: sh + 'px' });
  stage.style.setProperty('--S', S);                                     // v4 ctx.v.anchor: CSS px per world px (text inside anchored boxes)
  const box = { left: view.x + 'px', top: view.y + 'px', width: view.w + 'px', height: view.h + 'px' };
  Object.assign(over.style, box);
  // phones: HUD uses the whole screen (so controls sit outside a letterboxed map); TV: HUD hugs the map
  Object.assign(hud.style, TOUCH ? { left: '0px', top: '0px', width: vw + 'px', height: vh + 'px' } : box);
  over.width = Math.floor(view.w * dpr); over.height = Math.floor(view.h * dpr);
  hud.style.setProperty('--s', TOUCH ? Math.max(1.6, Math.min(S, 2.1)) : S);
  camX = Math.min(camX, maxCamX); camY = Math.min(camY, maxCamY);
  if (!camInit && maxCamX) { camX = maxCamX * 0.5; camY = maxCamY * 0.2; camInit = true; }
  applyCam();
  $('#b-fit')?.setAttribute('aria-pressed', viewMode === 'fit');
}
let camInit = false;
function applyCam() { stage.style.transform = `translate3d(${Math.round(baseX - camX)}px, ${Math.round(baseY - camY)}px, 0)`; }
addEventListener('resize', layout); addEventListener('orientationchange', () => setTimeout(layout, 300));
layout();

// who is "me" on this phone? (?me=<guestId> from the guestbook, or the last guestbook written on this device)
// a laptop/TV only becomes "me" with an explicit ?me= (the couple may have tested the guestbook on the TV laptop)
const ME = params.get('me') || (TOUCH ? (() => { try { const m = JSON.parse(localStorage.getItem('wgb_mine') || '[]'); return m.length ? m[m.length - 1].id : null; } catch { return null; } })() : null);
let follow = !!ME, dragUntil = 0, focus = null;   // focus: { x, y, until } temporary camera target (events, arrivals)
function camFocus(x, y, sec = 5) { focus = { x, y, until: performance.now() + sec * 1000 }; }
function updateCamera(dt, time) {
  if (!maxCamX && !maxCamY) { camX = camY = 0; applyCam(); return; }
  const now = performance.now();
  if (now < dragUntil) { // inertia after a drag
    camX = Math.max(0, Math.min(maxCamX, camX + camVX * dt)); camY = Math.max(0, Math.min(maxCamY, camY + camVY * dt));
    camVX *= 0.9; camVY *= 0.9; applyCam(); return;
  }
  let tx = null, ty = null;
  if (focus && now < focus.until) { tx = focus.x; ty = focus.y; }
  else if (follow && ME && villagers.get(ME)) { const v = villagers.get(ME); tx = v.x; ty = v.y - 16; }
  else { tx = W / 2 + Math.sin(time * 0.05) * W * 0.32; ty = H / 2 + Math.sin(time * 0.037) * H * 0.25; }   // slow scenic tour
  const dx = Math.max(0, Math.min(maxCamX, tx * S - view.w / 2)), dy = Math.max(0, Math.min(maxCamY, ty * S - view.h / 2));
  const k = Math.min(1, dt * 2.5);
  camX += (dx - camX) * k; camY += (dy - camY) * k; applyCam();
}

// drag to pan (touch & mouse)
let drag = null;
addEventListener('pointerdown', e => {
  if (e.target.closest('button, a, input, label, .sheet, .sheet-bg, .wanchor.live')) return;
  if (!maxCamX && !maxCamY) return;
  drag = { x: e.clientX, y: e.clientY, cx: camX, cy: camY, t: performance.now(), lx: e.clientX, ly: e.clientY };
  document.body.classList.add('dragging');
});
addEventListener('pointermove', e => {
  if (!drag) return;
  if (e.pointerType === 'mouse' && e.buttons === 0) { endDrag(); return; }   // button released outside the window
  const now = performance.now(), dtm = Math.max(1, now - drag.t) / 1000;
  camVX = -(e.clientX - drag.lx) / dtm; camVY = -(e.clientY - drag.ly) / dtm;
  drag.lx = e.clientX; drag.ly = e.clientY; drag.t = now;
  camX = Math.max(0, Math.min(maxCamX, drag.cx - (e.clientX - drag.x))); camY = Math.max(0, Math.min(maxCamY, drag.cy - (e.clientY - drag.y)));
  dragUntil = now + 7000; applyCam();
});
function endDrag() {
  if (!drag) return;
  const moved = Math.hypot(drag.lx - drag.x, drag.ly - drag.y) > 6;
  drag = null; document.body.classList.remove('dragging');
  if (!moved) dragUntil = 0;                                   // a tap is not a pan
  else if (follow) $('#b-me')?.setAttribute('aria-pressed', 'false');
}
setInterval(() => { if (follow && performance.now() > dragUntil) $('#b-me')?.setAttribute('aria-pressed', 'true'); }, 500);
addEventListener('pointerup', endDrag); addEventListener('pointercancel', endDrag);

// ---------- QR ----------
(function drawQR() {
  const url = CONFIG.guestUrl || new URL('./', location.href).href;
  const q = qrcode(0, 'M'); q.addData(url); q.make();
  const n = q.getModuleCount(), pad = 2, c = $('#qr-canvas'); c.width = c.height = n + pad * 2;
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.fillStyle = '#2b2033';
  for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (q.isDark(r, k)) g.fillRect(k + pad, r + pad, 1, 1);
  // alternate the caption so guests learn the same QR also takes them to photo sharing
  const lbl = $('#qr-label'); let i = 0; lbl.textContent = t('sign_here');
  setInterval(() => { i ^= 1; lbl.textContent = t(i ? 'snap_here' : 'sign_here'); }, 6000);
})();

// ============================================================
//  PATHFINDING (BFS on the tile grid)
// ============================================================
const tileOf = (x, y) => [Math.max(0, Math.min(TW - 1, Math.floor(x / TILE))), Math.max(0, Math.min(TH - 1, Math.floor(y / TILE)))];
function nearestWalkable(tx, ty) {
  if (walk[ty]?.[tx]) return [tx, ty];
  for (let r = 1; r < 6; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (walk[ty + dy]?.[tx + dx]) return [tx + dx, ty + dy];
  return [15, 12];
}
function findPath(sx, sy, tx, ty) {
  [sx, sy] = nearestWalkable(sx, sy); [tx, ty] = nearestWalkable(tx, ty);
  const key = (x, y) => y * TW + x, prev = new Map([[key(sx, sy), -1]]), q = [[sx, sy]];
  while (q.length) {
    const [x, y] = q.shift();
    if (x === tx && y === ty) break;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, k = key(nx, ny);
      if (!walk[ny]?.[nx] || prev.has(k)) continue;
      prev.set(k, key(x, y)); q.push([nx, ny]);
    }
  }
  if (!prev.has(key(tx, ty))) return [];
  const out = []; let k = key(tx, ty);
  while (k !== -1) { out.push([k % TW, Math.floor(k / TW)]); k = prev.get(k); }
  return out.reverse().slice(1);
}

// ============================================================
//  ENTITIES
// ============================================================
const reserved = new Map(); // tileKey -> villager id
const tk = ([x, y]) => x + ',' + y;
const ACT_FACING = {
  fish: (tx, ty) => { const cx = tx * TILE + 8, cy = ty * TILE + 8; return isWater(cx + 18, cy) ? 'right' : isWater(cx - 18, cy) ? 'left' : isWater(cx, cy - 16) ? 'up' : 'down'; },
  chat: (tx, ty) => { const fx = (Z.fountain[0] + 1) * TILE, fy = (Z.fountain[1] + 1) * TILE, dx = fx - (tx * TILE + 8), dy = fy - (ty * TILE + 8); return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'); },
  eat: (tx, ty) => ([Z.table1, Z.table2].some(r => ty === r[3]) ? 'up' : 'down'),
  photo: () => 'up', dance: () => pick(['down', 'left', 'right']), walk: () => pick(['down', 'left', 'right']),
};

class Villager {
  constructor(g, spawn) {
    this.g = g; this.sprite = getSprite(g.avatar);
    const p = spawn ? SP.door : pick(SP.walk);
    this.x = p[0] * TILE + 8; this.y = p[1] * TILE + 12;
    this.facing = 'down'; this.path = []; this.state = 'idle'; this.timer = rnd(0.5, 3);
    this.anim = 0; this.blink = rnd(2, 5); this.hop = 0; this.jumpDelay = 0; this.bubble = 0; this.lastBubble = -999;
    this.act = g.activity || 'walk'; this.actT = 0; this.spot = null; this.emote = null; this.glow = 0; this.script = null; this.icon = null;
    this.fishT = rnd(6, 14); this.flashT = rnd(3, 6); this.beat = 0;
    if (spawn) { this.goTo(pick(SP.walk.filter(([x, y]) => y >= 8 && y <= 12))); sparkle(this.x, this.y - 18, 18); this.glow = 6; }
  }
  release() { if (this.spot) { reserved.delete(tk(this.spot)); this.spot = null; } }
  goTo([tx, ty], then) {
    const [sx, sy] = tileOf(this.x, this.y);
    this.path = findPath(sx, sy, tx, ty); this.state = this.path.length ? 'move' : 'arrive'; this.then = then || null;
    this.speed = rnd(20, 28);
  }
  plan() {
    this.release();
    if (this.act !== 'walk' && Math.random() < 0.72) {
      const free = (SP[this.act] || []).filter(s => !reserved.has(tk(s)));
      if (free.length) { this.spot = pick(free); reserved.set(tk(this.spot), this.g.id); this.goTo(this.spot, 'act'); return; }
    }
    this.goTo(pick(SP.walk), 'idle');
  }
  update(dt) {
    this.blink -= dt; if (this.blink < -0.13) this.blink = rnd(2.5, 6);
    if (this.jumpDelay > 0) { this.jumpDelay -= dt; if (this.jumpDelay <= 0) this.hop = 0.8; }
    if (this.hop > 0) this.hop -= dt;
    if (this.bubble > 0) this.bubble -= dt;
    if (this.glow > 0) this.glow -= dt;
    if (this.icon) { this.icon.t -= dt; if (this.icon.t <= 0) this.icon = null; }
    // emote overrides
    if (this.emote) {
      this.emote.t -= dt; this.anim += dt;
      if (this.emote.type === 'greet' && this.state === 'move') this.move(dt);
      else if (this.emote.type === 'heart' && Math.random() < dt * 3) heart(this.x + rnd(-4, 4), this.y - 34);
      else if (this.emote.type === 'clap' && Math.random() < dt * 6) sparkle(this.x, this.y - 22, 1);
      else if (this.emote.type === 'dance' && Math.random() < dt * 2) note(this.x, this.y - 34);
      if (this.emote.t <= 0) { this.emote = null; this.state = 'idle'; this.timer = 0.5; }
      return;
    }
    if (this.state === 'move') { this.move(dt); return; }
    if (this.state === 'arrive') {
      if (this.script) { this.state = 'hold'; this.facing = this.script.face || 'down'; return; }
      if (this.then === 'act' && this.spot) { this.state = 'act'; this.actT = rnd(18, 40); this.facing = (ACT_FACING[this.act] || ACT_FACING.walk)(...this.spot); }
      else { this.state = 'idle'; this.timer = rnd(2, 6); }
      return;
    }
    if (this.state === 'hold') return;                                  // event formation
    if (this.state === 'idle') { this.timer -= dt; if (this.timer <= 0) this.plan(); return; }
    if (this.state === 'act') {
      this.actT -= dt; this.anim += dt;
      this.doActivity(dt);
      if (this.actT <= 0) { this.state = 'idle'; this.timer = rnd(1, 3); if (Math.random() < 0.5) this.goTo(pick(SP.walk), 'idle'); }
    }
  }
  move(dt) {
    if (!this.path.length) { this.state = 'arrive'; return; }
    const [tx, ty] = this.path[0];
    const gx = tx * TILE + 8, gy = ty * TILE + 12, dx = gx - this.x, dy = gy - this.y, d = Math.hypot(dx, dy);
    if (d < 1) { this.path.shift(); return; }
    const s = Math.min(d, this.speed * dt); this.x += dx / d * s; this.y += dy / d * s; this.anim += dt;
    this.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
  }
  doActivity(dt) {
    switch (this.act) {
      case 'fish':
        this.fishT -= dt;
        if (this.fishT < 0.9 && !this.bite) { this.bite = true; this.icon = { ch: '!', t: 0.9 }; }
        if (this.fishT <= 0) {
          this.bite = false; this.fishT = rnd(8, 18);
          const [bx, by] = this.bobber();
          particles.push({ type: 'fish', x: bx, y: by, vx: (this.x - bx) * 1.2, vy: -60, life: 0.9, c: pick(['#8fd3ff', '#f3c34f', '#ff8f6b', '#c9a5ff']) });
          sparkle(bx, by, 6); this.hop = 0.5;
          if (Math.random() < 0.15) toast(`🐟 ${this.g.name}${lang === 'ko' ? '님 월척!' : ' caught a big one!'}`);
        }
        break;
      case 'dance': this.beat += dt; if (this.beat > 0.32) { this.beat = 0; this.facing = this.facing === 'left' ? 'right' : 'left'; if (Math.random() < 0.3) this.hop = 0.35; } if (Math.random() < dt * 0.8) note(this.x, this.y - 34); break;
      case 'chat': if (Math.random() < dt * 0.25) this.icon = { ch: pick(['…', 'ㅋㅋ', '♥', '!', '?', 'haha']), t: 1.6 }; break;
      case 'photo': this.flashT -= dt; if (this.flashT <= 0) { this.flashT = rnd(4, 8); flash(this.x + 4, this.y - 26); } break;
      case 'eat': if (Math.random() < dt * 0.2) this.icon = { ch: lang === 'ko' ? '냠' : 'yum', t: 1.2 }; break;
    }
  }
  bobber() {
    const f = this.facing, t2 = performance.now() / 1000;
    const bob = Math.sin(t2 * 3 + this.x) * 0.8 + (this.bite ? Math.sin(t2 * 30) * 1.5 : 0);
    return f === 'right' ? [this.x + 22, this.y - 4 + bob] : f === 'left' ? [this.x - 22, this.y - 4 + bob] : f === 'up' ? [this.x + 4, this.y - 30 + bob] : [this.x + 4, this.y + 14 + bob];
  }
  frame() {
    const moving = this.state === 'move' && this.hop <= 0;
    const step = Math.floor(this.anim / 0.15) % 2;
    let f, flip = this.facing === 'left';
    if (this.emote && this.emote.type !== 'greet') {
      const ph = Math.floor(this.anim / 0.25) % 4;
      if (this.emote.type === 'dance') { f = ['up', 'idle', 'wave', 'idle'][ph]; flip = ph >= 2; }
      else if (this.emote.type === 'clap') f = ph % 2 ? 'up' : 'idle';
      else if (this.emote.type === 'heart') f = 'wave';
      else f = 'up';
      return { f, flip };
    }
    if (this.emote?.type === 'greet' && this.state !== 'move') return { f: 'wave', flip: false };
    if (moving) f = this.facing === 'up' ? (step ? 'back1' : 'back2') : (step ? 'walk1' : 'walk2');
    else if (this.state === 'act') {
      if (this.act === 'dance') { const ph = Math.floor(this.anim / 0.32) % 4; f = ['up', 'idle', 'wave', 'idle'][ph]; }
      else if (this.act === 'photo') f = this.facing === 'up' ? 'back' : 'wave';
      else if (this.act === 'eat') f = this.facing === 'up' ? (Math.floor(this.anim / 0.5) % 2 ? 'back' : 'back1') : (Math.floor(this.anim / 0.5) % 2 ? 'eat' : 'idle');
      else f = this.facing === 'up' ? 'back' : (this.blink < 0 ? 'blink' : 'idle');
    } else f = this.facing === 'up' ? 'back' : (this.blink < 0 ? 'blink' : 'idle');
    return { f, flip };
  }
  hopPx() { return this.hop > 0 ? Math.round(Math.abs(Math.sin((0.8 - this.hop) * Math.PI * 2.5)) * 6) : 0; }
  doEmote(type, opts = {}) {
    this.glow = opts.glow === false ? 0 : (type === 'greet' ? 14 : 6); this.release(); this.path = [];
    if (type === 'jump') { this.hop = 0.8; this.jumpDelay = 0; setTimeout(() => (this.hop = 0.8), 800); setTimeout(() => (this.hop = 0.8), 1600); this.emote = { type, t: 2.4 }; return; }
    if (type === 'greet') { this.emote = { type, t: 14 }; const free = SP.group.slice(0, 13).filter(s => !reserved.has(tk(s))); this.goTo(pick(free.length ? free : SP.group)); this.then = null; setTimeout(() => heart(this.x, this.y - 34), 9000); return; }
    this.emote = { type, t: opts.short ? 2.2 : (type === 'dance' ? 5 : 3) }; this.anim = 0; this.state = 'emote';
  }
}

// couple on the stage
const coupleY = Z.altar[3] * TILE - 5, coupleX = (Z.altar[0] + Z.altar[2]) / 2 * TILE;
const couple = [
  { g: { name: CONFIG.couple.groom[lang], side: 'couple' }, sprite: getSprite(CONFIG.groomAvatar), x: coupleX - 9, y: coupleY, facing: 'down', blink: 3 },
  { g: { name: CONFIG.couple.bride[lang], side: 'couple' }, sprite: getSprite(CONFIG.brideAvatar), x: coupleX + 9, y: coupleY, facing: 'down', blink: 4.2 },
].map(c => Object.assign(c, {
  isCouple: true, hop: 0, jumpDelay: 0, waveT: rnd(5, 10), wave: 0, back: false,
  homeX: c.x, homeY: c.y, baseSprite: c.sprite, tgt: null,                  // v4 (ctx.v.couple()): where "home" is · the config sprite · a straight-line walk target
  update(dt) { this.blink -= dt; if (this.blink < -0.13) this.blink = rnd(3, 6); if (this.jumpDelay > 0) { this.jumpDelay -= dt; if (this.jumpDelay <= 0) this.hop = 0.8; } if (this.hop > 0) this.hop -= dt; this.waveT -= dt; if (this.waveT <= 0) { this.wave = 1.6; this.waveT = rnd(8, 16); } if (this.wave > 0) this.wave -= dt; if (this.tgt) this.step(dt); },
  step(dt) {
    const dx = this.tgt.x - this.x, dy = this.tgt.y - this.y, d = Math.hypot(dx, dy);
    if (d < 0.5) { this.x = this.tgt.x; this.y = this.tgt.y; this.tgt = null; return; }
    const s = Math.min(d, this.tgt.speed * dt); this.x += dx / d * s; this.y += dy / d * s;
    this.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
  },
  walkTo(x, y, speed = 24) { this.tgt = { x, y, speed }; },
  home() { this.tgt = { x: this.homeX, y: this.homeY, speed: 24 }; },
  face(dir) { this.facing = dir; this.back = dir === 'up'; },
  frame() { return { f: this.back ? 'back' : this.wave > 0 ? 'wave' : this.blink < 0 ? 'blink' : 'idle', flip: this === couple?.[1] && this.wave > 0 }; },
  hopPx: Villager.prototype.hopPx,
}));

// critters
const critters = [];
function addCritter(kind, area) { critters.push({ kind, area, x: rnd(area[0], area[2]) * TILE, y: rnd(area[1], area[3]) * TILE, tx: 0, ty: 0, t: 0, dir: 1, anim: 0 }); }
[0, 1, 2].forEach(() => addCritter('chicken', [1, 6, 7, 7]));
function updateCritter(c, dt) {
  c.t -= dt; c.anim += dt;
  if (c.t <= 0) { c.tx = rnd(c.area[0], c.area[2]) * TILE; c.ty = rnd(c.area[1], c.area[3]) * TILE; c.t = rnd(2, 5); }
  const dx = c.tx - c.x, dy = c.ty - c.y, d = Math.hypot(dx, dy);
  if (d > 1) { const s = Math.min(d, (c.kind === 'chicken' ? 10 : 16) * dt); c.x += dx / d * s; c.y += dy / d * s; c.dir = dx > 0 ? 1 : -1; }
}

const villagers = new Map();
let guests = [];

// ============================================================
//  PARTICLES & FX
// ============================================================
const particles = [];
function sparkle(x, y, n = 10) { for (let i = 0; i < n; i++) particles.push({ type: 'spark', x, y, vx: rnd(-30, 30), vy: rnd(-40, -5), life: rnd(0.6, 1.2), c: pick(['#ffd75e', '#ffffff', '#ff9ec4', '#9fe3ff']) }); }
function heart(x, y) { particles.push({ type: 'heart', x, y, vx: rnd(-4, 4), vy: -12, life: 2.2 }); }
function note(x, y) { particles.push({ type: 'note', x, y, vx: rnd(-6, 6), vy: -14, life: 1.6, c: pick(['#ffd75e', '#ff9ec4', '#8fd3ff', '#b7f08a']) }); }
function flash(x, y) { particles.push({ type: 'flash', x, y, life: 0.25 }); }
const fireworks = [];
function launchFireworks(n = 6) {
  if (quiet) return;                                                         // ceremony in progress (also covers the level-4 random fireworks and the X key)
  announce('start', { type: 'fireworks', key: 'fireworks', id: '' }); setTimeout(() => announce('end', { type: 'fireworks', key: 'fireworks', id: '' }), n * 600 + 3000);
  for (let i = 0; i < n; i++) setTimeout(() => fireworks.push({ x: rnd(60, W - 60), y: H, ty: rnd(20, 110), vy: -170, burst: false, c: pick(['#ffd75e', '#ff6f9c', '#8fd3ff', '#b7f08a', '#ffffff', '#c9a5ff']), parts: [] }), i * rnd(250, 600));
  fxDark = Math.max(fxDark, 5);
}
let fxDark = 0, flashAll = 0;
const petals = Array.from({ length: 30 }, () => ({ x: rnd(0, W), y: rnd(0, H), vx: rnd(4, 10), vy: rnd(6, 12), ph: rnd(0, 6) }));
const fireflies = Array.from({ length: 24 }, () => ({ x: rnd(0, W), y: rnd(30, H - 20), ph: rnd(0, 6), sp: rnd(0.5, 1.5) }));
const HEART = ['.x.x.', 'xxxxx', 'xxxxx', '.xxx.', '..x..'];
const NOTE = ['.xx', '.x.', '.x.', 'xx.', 'xx.'];

// ============================================================
//  HUD: banners, ticker, level
// ============================================================
// banner(text, ms | { ms, kind, priority }, kind): priority 'high' goes in front of the normal ones; arrival banners ({ arrival, name }) that pile up (3+) become one
// "A님 외 N명이 도착했어요!". Showing starts one microtask later so a burst from one sync() is ordered and merged before the first one appears.
// Quiet mode (live.quiet) holds the queue; it resumes — merged — when quiet ends.
const banners = []; let bannerBusy = false, bannerKick = false;
function banner(text, msOrOpts = 5000, kind = '') {
  const o = msOrOpts && typeof msOrOpts === 'object' ? msOrOpts : { ms: msOrOpts, kind };
  const b = { text, ms: o.ms ?? 5000, kind: o.kind ?? '', high: o.priority === 'high', arrival: o.arrival === true, name: o.name };
  if (b.high) { let i = 0; while (i < banners.length && banners[i].high) i++; banners.splice(i, 0, b); } else banners.push(b);
  kickBanners();
}
const ARRIVAL_GATHER_MS = 800;                                       // a lone arrival waits a moment so the ones right behind it (a check-in burst, "L") can join it and a level-up can go first
function kickBanners() {
  if (bannerBusy || bannerKick) return;
  bannerKick = true;
  const go = () => { bannerKick = false; if (!bannerBusy) nextBanner(); };
  if (banners.length && banners.every(b => b.arrival)) setTimeout(go, ARRIVAL_GATHER_MS); else queueMicrotask(go);
}
function mergeArrivals() {
  let n = 0, first = null; for (const b of banners) if (b.arrival) { n++; first ||= b; }
  if (n < 3) return;
  const merged = { text: t('arrived_many', { name: first.name, n: n - 1 }), ms: 5000, kind: '', high: false, arrival: false };
  const out = []; let put = false;
  for (const b of banners) { if (!b.arrival) out.push(b); else if (!put) { out.push(merged); put = true; } }
  banners.length = 0; banners.push(...out);
}
function nextBanner() {
  if (quiet) { bannerBusy = false; return; }                          // held until the ceremony is over
  mergeArrivals();
  const b = banners.shift(), el = $('#arrival');
  if (!b) { bannerBusy = false; return; }
  bannerBusy = true; el.textContent = b.text; el.className = 'arrival on ' + b.kind;
  setTimeout(() => { el.className = 'arrival ' + b.kind; setTimeout(nextBanner, 500); }, b.ms);
}
let toastBusy = 0;
function toast(text) { if (performance.now() - toastBusy < 20000) return; toastBusy = performance.now(); banner(text, 3500, 'small'); }

let tickClock = 0, tickIdx = 0;
function showTicker(g) {
  const el = $('#ticker'); if (!g) { el.classList.add('empty'); return; }
  el.classList.remove('empty'); el.classList.add('fade');
  setTimeout(() => {
    const c = el.querySelector('canvas'), cx = c.getContext('2d'); cx.imageSmoothingEnabled = false; cx.clearRect(0, 0, c.width, c.height); cx.drawImage(getSprite(g.avatar).idle, 0, 0);
    el.querySelector('.nm').textContent = g.name;
    const tg = el.querySelector('.tag'); tg.className = 'tag ' + g.side; tg.textContent = t('side_' + g.side);
    el.querySelector('.msg').textContent = g.message.replace(/\s+/g, ' ');
    tickerExtras(el, g);                                                       // v4: prefix (same line, small) + second line — empty unless a feature owns them
    el.classList.remove('fade');
  }, 400);
}
function provided(prov, g) {                                                    // ctx.v.setTickerPrefix / setTickerExtra result → short plain text
  if (!prov) return '';
  try { const r = prov.fn(g); return r == null ? '' : String(r).replace(/\s+/g, ' ').trim().slice(0, 300); }
  catch (e) { prov.scope.report(e); return ''; }
}
let tickerG = null;                                                              // who the ticker shows now (a feature's prefix / second line repaints at once)
function tickerExtras(el, g) {
  tickerG = g;
  const m2 = provided(tickerExtraP, g);
  el.querySelector('.pre2').textContent = provided(tickerPrefixP, g).slice(0, 40);
  el.querySelector('.msg2').textContent = m2; el.classList.toggle('two', !!m2);
}
function rotateTicker(dt) {
  tickClock -= dt; if (tickClock > 0 || !guests.length) return;
  tickClock = 9; tickIdx = (tickIdx + 1) % guests.length;
  showTicker(Math.random() < 0.35 ? guests[guests.length - 1 - Math.floor(Math.random() * Math.min(5, guests.length))] : guests[tickIdx]);
}
function renderLevel() {
  const n = guests.length, next = LEVELS[level];
  $('#lv').textContent = level; $('#count-n').textContent = n;
  const prevAt = level ? LEVELS[level - 1].at : 0;
  $('#lv-bar').style.width = next ? Math.min(100, (n - prevAt) / (next.at - prevAt) * 100) + '%' : '100%';
  $('#lv-next').textContent = next ? (lang === 'ko' ? `다음: ${next.ko} (${next.at - n}명 남음)` : `Next: ${next.en} (${next.at - n} to go)`) : (lang === 'ko' ? '최고 레벨 달성!' : 'Max level!');
  if (level !== announcedLevel) { announcedLevel = level; emit('village:level', { level, celebrate: celebrating }); celebrating = false; }
}
let announcedLevel = -1, celebrating = false;                                 // v4: 'village:level' goes out when the level actually changes

// ============================================================
//  EVENTS (bouquet / group photo / fireworks / level up)
// ============================================================
let event = null;
function everyone() { return [...villagers.values()]; }
function formation(list, slots, face = 'down') {
  everyone().forEach(v => { v.bubble = 0; v.icon = null; });
  const inSlots = new Set(slots.map(tk));
  const [sx, sy] = [15, 7];
  const extra = SP.walk.filter(p => !inSlots.has(tk(p)) && p[1] >= 5).sort((a, b) => Math.hypot(a[0] - sx, a[1] - sy) - Math.hypot(b[0] - sx, b[1] - sy));
  const free = [...slots, ...extra].slice(0, Math.max(list.length, 1));
  list.forEach(v => {
    v.release(); v.emote = null;
    free.sort((a, b) => Math.hypot(a[0] * TILE - v.x, a[1] * TILE - v.y) - Math.hypot(b[0] * TILE - v.x, b[1] * TILE - v.y));
    const s = free.shift() || pick(SP.walk);
    v.script = { face }; v.goTo(s);
  });
}
function releaseAll() { everyone().forEach(v => { v.script = null; v.emote = null; v.state = 'idle'; v.timer = rnd(0.5, 3); }); }
// same event → same result on the TV and on every phone (seeded by the event id)
function seeded(seed) { let a = 0; for (const ch of String(seed)) a = (Math.imul(a, 31) + ch.charCodeAt(0)) | 0; return () => { a = (a + 0x6D2B79F5) | 0; let x = Math.imul(a ^ (a >>> 15), 1 | a); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; }
const pendingEvents = [];

function startBouquet(seed = Math.random()) {
  if (event) { pendingEvents.push({ type: 'bouquet', seed }); return; }
  if (!villagers.size) return;
  const rand = seeded(seed);
  const all = everyone().sort((a, b) => (a.g.id < b.g.id ? -1 : 1));
  for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [all[i], all[j]] = [all[j], all[i]]; }
  const crowd = all.slice(0, 14);
  formation(crowd, SP.group, 'up');
  event = { type: 'bouquet', key: 'bouquet', id: String(seed), t: 0, crowd, rand }; camFocus(coupleX, coupleY + 40, 18);
  announce('start');
  banner(lang === 'ko' ? '💐 부케 던지기! 모두 무대 앞으로~' : '💐 Bouquet toss! Gather around~', 4500);
}
function startGroupPhoto() {
  if (event) { pendingEvents.push({ type: 'group' }); return; }
  formation(everyone(), SP.group, 'down');
  event = { type: 'group', key: 'group', id: 'group', t: 0 }; camFocus(coupleX, coupleY + 60, 22);
  announce('start');
  banner(lang === 'ko' ? '📸 단체사진 찍어요! 모두 모여주세요' : '📸 Group photo! Everyone gather', 4500);
}
function updateEvent(dt) {
  if (!event) return;
  event.t += dt;
  const ready = () => (event.crowd || everyone()).filter(v => villagers.has(v.g.id)).every(v => v.state === 'hold') || event.t > 14;
  if (event.type === 'bouquet') {
    const bride = couple[1];
    if (!event.ready && event.t > 5 && ready()) { event.ready = event.t; bride.back = true; }
    if (event.ready) {
      const k = event.t - event.ready;
      event.count = k < 3 ? 3 - Math.floor(k) : null;
      if (k >= 3 && !event.thrown) {
        event.thrown = true;
        const alive = event.crowd.filter(v => villagers.has(v.g.id)), pool = alive.length ? alive : everyone();
        const winner = pool[Math.floor(event.rand() * pool.length)];
        if (!winner) { endEvent(); return; }                     // everyone left (hidden/deleted) mid-event
        event.winner = winner;
        event.bq = { x0: bride.x, y0: bride.y - 26, x1: winner.x, y1: winner.y - 26, t: 0 };
      }
      if (event.bq) {
        event.bq.t += dt / 1.7;
        if (event.bq.t >= 1 && !event.caught) {
          event.caught = true; bride.back = false;
          const w2 = event.winner; w2.hop = 0.8; w2.glow = 6; sparkle(w2.x, w2.y - 30, 30); for (let i = 0; i < 6; i++) setTimeout(() => heart(w2.x + rnd(-6, 6), w2.y - 34), i * 200);
          chime(true); couple.forEach(c => c.jumpDelay = 0.2); everyone().forEach(v => { if (v !== w2) v.jumpDelay = rnd(0.1, 0.8); });
          banner(lang === 'ko' ? `💐 ${w2.g.name}님이 부케를 받았어요!` : `💐 ${w2.g.name} caught the bouquet!`, 6000, 'gold');
        }
        if (event.caught && event.t - event.ready > 9) endEvent();
      }
    }
  } else if (event.type === 'group') {
    if (!event.ready && event.t > 4 && ready()) event.ready = event.t;
    if (event.ready) {
      const k = event.t - event.ready;
      event.count = k < 3 ? 3 - Math.floor(k) : null;
      if (k >= 3 && !event.shot) {
        event.shot = true; flashAll = 1; chime(true);
        everyone().forEach(v => { v.hop = 0.5; });
        if (HOST) wantShot = 'group-photo';    // captured inside drawWorld, before the white flash is painted
        banner(lang === 'ko' ? '📸 찰칵! 단체사진 완성!' : '📸 Click! Group photo taken!', 4500, 'gold');
      }
      if (event.shot && k > 6) endEvent();
    }
  } else if (event.type === 'scene') updateScene(dt);                       // v4 ctx.v.runScene
}
function endEvent() {
  const ev = event; event = null;
  if (ev?.type === 'scene') sceneEnded(ev);                                  // the scene's own end(s) first; releasing everybody stays the core's job
  releaseAll();
  if (ev) announce('end', ev);
  startNext();
}
// v4: 'village:event' { type, key, id, stage } and the hand-over to whatever waits in line (a scene is just one more kind of event)
function announce(stage, ev = event) { if (ev) emit('village:event', { type: ev.type, key: ev.key || ev.type, id: ev.id || '', stage }); }
function startNext() { const next = pendingEvents.shift(); if (next) setTimeout(() => startPending(next), 1500); }
function startPending(next) {
  if (next.type === 'bouquet') startBouquet(next.seed);
  else if (next.type === 'scene') startScene(next);
  else startGroupPhoto();
}
let wantShot = null;

let maxLevel = 0;
function levelUp(nl) {
  const celebrate = nl > maxLevel; celebrating = celebrate;
  level = nl; maxLevel = Math.max(maxLevel, nl); rebuild();
  if (level >= 5 && !critters.some(c => c.kind !== 'chicken')) { addCritter('cat', [8, 9, 15, 14]); addCritter('dog', [10, 5, 22, 13]); }
  if (!celebrate) return;
  const L = LEVELS[level - 1];
  banner(lang === 'ko' ? `🎊 마을 레벨 UP! Lv.${level} · ${L.ko}` : `🎊 Village Level UP! Lv.${level} · ${L.en}`, { ms: 6000, kind: 'gold', priority: 'high' });
  launchFireworks(8); chime(true);
  everyone().forEach(v => v.jumpDelay = rnd(0.1, 1)); couple.forEach(c => c.jumpDelay = 0.3);
}

// ============================================================
//  SOUND
// ============================================================
let audio = null, soundOn = true;
function chime(big) {
  if (quiet || !soundOn || !audio) return;
  const notes = big ? [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5] : [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((f, i) => {
    const o = audio.createOscillator(), gn = audio.createGain(), t0 = audio.currentTime + i * 0.11;
    o.type = 'square'; o.frequency.value = f; gn.gain.setValueAtTime(0.05, t0); gn.gain.exponentialRampToValueAtTime(0.001, t0 + 0.25);
    o.connect(gn).connect(audio.destination); o.start(t0); o.stop(t0 + 0.26);
  });
}

// ============================================================
//  DATA SYNC
// ============================================================
let firstLoad = true;
// presence filter (ctx.v.setPresence, one feature only): a thrown error counts against that feature and shows the guest — never an empty village
function present(g) {
  if (!presenceP) return true;
  let ok = true;
  try { ok = !!presenceP.fn(g); } catch (e) { presenceP.scope.report(e); }
  if (!ok) heldBack.add(g.id);
  return ok;
}
function sync(list) {
  syncing = true;
  try { syncList(list); } finally { syncing = false; }
}
function syncList(list) {
  lastList = list;
  allIds = new Set(list.map(g => g.id));
  guests = list.filter(g => !g.hidden && present(g)).map(g => g.message.trim() ? g : g.priv ? { ...g, message: t('priv_msg') } : g.hasVoice ? { ...g, message: t('voice_msg') } : g);
  const ids = new Set(guests.map(g => g.id));
  for (const [id, v] of [...villagers]) if (!ids.has(id)) { v.release(); villagers.delete(id); }
  for (const g of guests) {
    const v = villagers.get(g.id);
    if (v) { arrivals.delete(g.id); v.g = g; v.sprite = getSprite(g.avatar); if (v.act !== g.activity) { v.act = g.activity; if (!v.script) { v.release(); v.state = 'idle'; v.timer = 0.2; } } continue; }
    const via = arrivals.get(g.id); arrivals.delete(g.id);                   // ctx.v.arrive(): "just arrived" (e.g. checked in) — entrance yes, the core banner no (the feature words its own)
    const fresh = via !== undefined || (!firstLoad && Date.now() - g.createdAt < 5 * 60 * 1000 && !heldBack.has(g.id));
    heldBack.delete(g.id);
    villagers.set(g.id, new Villager(g, fresh));
    if (fresh) {
      if (via === undefined || via === 'new') banner(`🎉 ${g.name}${t('arrived')}`, { arrival: true, name: g.name });
      chime(false); showTicker(g); tickClock = 14; emit('village:arrived', { gid: g.id, via: via ?? 'new' });
      if (!(ME && villagers.get(ME))) camFocus(SP.door[0] * TILE + 8, SP.door[1] * TILE + 40, 6);
      everyone().forEach(o => { if (o.g.id !== g.id && !o.script) o.jumpDelay = rnd(0.1, 0.9); });
      couple.forEach(c => c.jumpDelay = 0.3); for (let i = 0; i < 4; i++) setTimeout(() => heart(coupleX + rnd(-8, 8), coupleY - 30), i * 250);
    }
  }
  const nl = levelFor(guests.length);
  if (firstLoad) { level = maxLevel = nl; rebuild(); if (level >= 5) { addCritter('cat', [8, 9, 15, 14]); addCritter('dog', [10, 5, 22, 13]); } }
  else if (nl > level) levelUp(nl);
  else if (nl < level) { level = nl; rebuild(); }
  renderLevel();
  if (firstLoad && guests.length) showTicker(guests[guests.length - 1]);
  if (!guests.length) showTicker(null);
  if (firstLoad) onFirstSync();
  const first = firstLoad; firstLoad = false;
  emit('village:guests', { list: guests.slice(), allIds: new Set(allIds) });
  if (first) emit('village:ready', { HOST, TOUCH, ME });
  paintActions();                                                            // v4: phone feature buttons ("when()" is judged again after every sync)
  if (pendingSnaps) { const l = pendingSnaps; pendingSnaps = null; onSnaps(l); }
}
let allIds = new Set(), pendingSnaps = null;
const lastN = new Map();
function onEmote(e) {
  if (e.n != null) { if (lastN.get(e.gid) === e.n) return; lastN.set(e.gid, e.n); }   // local echo + server ack = same tap
  const v = villagers.get(e.gid); if (!v || !EMOTES.includes(e.type) || v.script) return;
  // TV: everyone gets the gold "that's me" ring. Phone: only my own character does.
  v.doEmote(e.type, { glow: HOST || e.gid === ME });
  emit('village:emote', { gid: e.gid, type: e.type });
}

// ---------- phones: real reactions from me + nearby friends, plus light local ambience ----------
// The TV (HOST) listens to every guest's reactions. Each phone listens only to itself and ~6 guests
// near its camera, re-picked every few minutes — keeps Firestore reads low while the village stays lively.
// TV = explicit ?host/?tv, or a non-touch screen that hasn't signed the guestbook (a guest's laptop with ?me= is a "phone")
const HOST = FORCE_TV || (!TOUCH && !ME);
const FRIENDS = 6, ROTATE_MS = 8 * 60 * 1000;
const pulseSubs = new Map();   // gid -> unsubscribe
function pickFriends() {
  const me = ME && villagers.get(ME);
  const cx = me ? me.x : (camX + view.w / 2) / S, cy = me ? me.y : (camY + view.h / 2) / S;
  return everyone().filter(v => v.g.id !== ME).sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy)).slice(0, FRIENDS).map(v => v.g.id);
}
async function rotateFriends() {
  const store = await getStore();
  const want = new Set([...(ME && allIds.has(ME) ? [ME] : []), ...pickFriends()]);
  for (const [id, off] of pulseSubs) if (!want.has(id)) { off(); pulseSubs.delete(id); }
  for (const id of want) if (!pulseSubs.has(id)) pulseSubs.set(id, store.subscribePulse([id], onEmote));
}
function onFirstSync() {
  if (!HOST) { rotateFriends(); setInterval(rotateFriends, ROTATE_MS); }
  // a stale ?me= / remembered id (deleted guest, old demo data): offer to sign instead of a remote that can't work
  if (ME && TOUCH && !allIds.has(ME)) showSignBar();
}
let ambientClock = 6;
function ambient(dt) {
  if (HOST || event) return;
  ambientClock -= dt; if (ambientClock > 0) return; ambientClock = rnd(5, 9);
  const x0 = camX / S, y0 = camY / S, x1 = x0 + view.w / S, y1 = y0 + view.h / S;
  const c = everyone().filter(v => v.g.id !== ME && !v.emote && !v.script && v.x > x0 && v.x < x1 && v.y > y0 && v.y < y1);
  if (c.length) pick(c).doEmote(pick(['heart', 'clap', 'jump', 'dance', 'heart']), { glow: false, short: true });
}

// ---------- TV: say so when the live connection drops (listeners re-attach by themselves) ----------
let syncDown = false;
addEventListener('wgb-sync', e => {
  if (!HOST) return;
  if (!e.detail.ok && !syncDown) { syncDown = true; banner(lang === 'ko' ? '⚠️ 인터넷 연결이 불안정해요 · 자동으로 다시 연결하는 중' : '⚠️ Connection lost · reconnecting…', 6000, 'small'); }
  if (e.detail.ok && syncDown) { syncDown = false; banner(lang === 'ko' ? '✅ 다시 연결됐어요' : '✅ Reconnected', 3000, 'small'); }
});

// ---------- guest snaps: polaroid slideshow on the TV + tiny photo on the in-world photo wall ----------
let snaps = [], snapFirst = true, snapQueue = [], snapIdx = 0, snapClock = 20, polBusy = false;
const snapThumbs = new Map();   // id -> { img, thumb canvas }
function loadSnapImg(s) {
  if (snapThumbs.has(s.id) || !s.data) return snapThumbs.get(s.id);
  const rec = { img: new Image(), thumb: null }; snapThumbs.set(s.id, rec);
  rec.img.onload = () => {
    const tw = 30, th = 22, c = document.createElement('canvas'); c.width = tw; c.height = th; const g = c.getContext('2d');
    const k = Math.max(tw / rec.img.width, th / rec.img.height); g.drawImage(rec.img, (tw - rec.img.width * k) / 2, (th - rec.img.height * k) / 2, rec.img.width * k, rec.img.height * k);
    rec.thumb = c; rec.img = null;   // keep only the tiny wall thumbnail in memory (the TV may hold hundreds of snaps)
  };
  rec.img.src = s.data; return rec;
}
function onSnaps(list) {
  if (firstLoad) { pendingSnaps = list; return; }            // need the guest list first (names, hidden guests)
  const byId = new Map(guests.map(g => [g.id, g]));
  const vis = list.filter(s => !s.hidden && byId.has(s.gid)).map(s => ({ ...s, name: byId.get(s.gid).name }));
  const known = new Set(snaps.map(s => s.id)), keep = new Set(vis.map(s => s.id));
  snapQueue = snapQueue.filter(q => keep.has(q.id));
  snaps = vis; vis.forEach(loadSnapImg);
  if (!snapFirst) vis.filter(s => !known.has(s.id)).forEach(s => {
    snapQueue.push(s);
    const v = villagers.get(s.gid); if (v) { v.glow = Math.max(v.glow, 4); flash(v.x + 4, v.y - 26); }
    banner(lang === 'ko' ? `📷 ${s.name}님이 사진을 올렸어요!` : `📷 ${s.name} shared a photo!`, 3500, 'small');
  });
  snapFirst = false;
  emit('village:snaps', { count: snaps.length });
}
function showPolaroid(s) {
  const el = $('#polaroid'); if (!el || !s?.data) return;
  polBusy = true; lastKind = 'pol'; $('#pol-img').src = s.data; $('#pol-name').textContent = s.name; $('#pol-cap').textContent = s.caption || '';
  const g = guests.find(x => x.id === s.gid), cv = el.querySelector('canvas'), cx = cv.getContext('2d'); cx.clearRect(0, 0, cv.width, cv.height);
  if (g) { cx.imageSmoothingEnabled = false; cx.drawImage(getSprite(g.avatar).idle, 0, 0); }
  el.style.setProperty('--rot', (Math.random() * 6 - 3).toFixed(1) + 'deg');
  el.classList.add('on'); chime(false);
  setTimeout(() => { el.classList.remove('on'); setTimeout(() => { polBusy = false; }, 700); }, 7000);
}
// The one centre slot is shared with the features' spotlights (ctx.v.spotlight.show): never together, taking turns when both wait (see "spotlight" at the bottom).
function updateSnaps(dt) {
  if (!HOST || polBusy || event || quiet) return;
  if (!snapQueue.length) snapClock -= dt;
  if (spotQueue.length && (lastKind !== 'spot' || !(snapQueue.length || (snapClock <= 0 && snaps.length)))) { showSpot(); return; }
  if (snapQueue.length) { const s = snapQueue.shift(); if (snaps.some(x => x.id === s.id)) { showPolaroid(s); snapClock = 40; } return; }
  if (snapClock > 0 || !snaps.length) return;                                // (snapClock already ran down above)
  snapClock = 45; snapIdx = (snapIdx + 1) % snaps.length;
  showPolaroid(Math.random() < 0.4 ? snaps[snaps.length - 1 - Math.floor(Math.random() * Math.min(4, snaps.length))] : snaps[snapIdx]);
}
function drawWallSnap(p, time) {
  if (!snaps.length) return;
  const s = snaps[Math.floor(time / 8) % snaps.length], rec = snapThumbs.get(s.id);
  if (!rec?.thumb) return;
  const x = Math.round(p.x + p.img.width / 2 - 16), y = Math.round(p.y + 9);
  wctx.fillStyle = '#fff8ec'; wctx.fillRect(x - 1, y - 1, 34, 26); wctx.fillStyle = '#c99a6b'; wctx.fillRect(x - 1, y + 24, 34, 1);
  wctx.drawImage(rec.thumb, x + 1, y + 1);
}

// ---------- phone controls: fullscreen / fit-fill / follow me / remote ----------
$('#b-fs')?.addEventListener('click', toggleFS);
$('#b-fit')?.addEventListener('click', () => { viewMode = viewMode === 'fill' ? 'fit' : 'fill'; layout(); });
const bMe = $('#b-me');
if (ME && bMe) { bMe.hidden = false; bMe.setAttribute('aria-pressed', 'true'); bMe.addEventListener('click', () => { follow = true; dragUntil = 0; focus = null; bMe.setAttribute('aria-pressed', 'true'); if (viewMode === 'fit') { viewMode = 'fill'; layout(); } }); }
const bar = $('#mremote');
// opened the village without (a valid) guestbook entry: one clear way in
function showSignBar() {
  bar.innerHTML = ''; bar.hidden = false;
  const a = document.createElement('a'); a.className = 'sign'; a.textContent = t('sign_cta');
  a.href = 'index.html' + (DEMO && params.get('demo') === '1' ? '?demo=1' : ''); bar.append(a);
  $('#snap-sheet') && ($('#snap-sheet').hidden = $('#sheet-bg').hidden = true);
}
if (TOUCH && !ME) showSignBar();
if (ME && TOUCH) {
  bar.hidden = false;
  const ICON = { heart: '❤️', clap: '👏', dance: '💃', jump: '⬆️', greet: '👋' };
  const LBL = lang === 'ko' ? { heart: '하트', clap: '박수', dance: '춤', jump: '점프', greet: '인사' } : { heart: 'Heart', clap: 'Clap', dance: 'Dance', jump: 'Jump', greet: 'Hi!' };
  let cool = 0;
  EMOTES.forEach(type => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'em'; b.innerHTML = `${ICON[type]}<small></small>`; b.querySelector('small').textContent = LBL[type];
    b.addEventListener('click', async () => {
      if (Date.now() < cool) return; cool = Date.now() + 3000;
      bar.classList.add('cool'); setTimeout(() => bar.classList.remove('cool'), 3000);
      b.classList.add('sent'); setTimeout(() => b.classList.remove('sent'), 900);
      follow = true; dragUntil = 0; bMe?.setAttribute('aria-pressed', 'true');
      try { navigator.vibrate?.(25); } catch {}
      try { await (await getStore()).sendEmote(ME, type); emit('remote:sent', { gid: ME, type, where: 'village' }); } catch (err) { console.warn(err); }
    });
    bar.append(b);
  });
  const sb = document.createElement('button'); sb.type = 'button'; sb.className = 'snap'; sb.innerHTML = '📷<small></small>'; sb.querySelector('small').textContent = t('snap_btn');
  sb.setAttribute('aria-label', t('snap_title')); sb.addEventListener('click', openSheet); bar.append(sb);
}

// ---------- 📷 photo sheet (phones): upload without leaving the village ----------
const sheet = $('#snap-sheet'), sheetBg = $('#sheet-bg');
let sheetReady = false, pendingPol = null, localSnapN = 0;
const myName = () => { try { const m = JSON.parse(localStorage.getItem('wgb_mine') || '[]').find(x => x.id === ME); if (m) return m.name; } catch {} return villagers.get(ME)?.g.name || ''; };
function addLocalSnap(src) { const s = { id: 'local' + (localSnapN++), gid: ME, data: src, name: myName() }; snaps = [...snaps, s]; loadSnapImg(s); return s; }
function openSheet() {
  closeFSheet();                                                               // v4: one sheet at a time (ctx.v.sheet)
  if (!sheetReady) {
    sheetReady = true;
    mountSnapUploader($('#snap-village'), { gid: ME, name: myName(), onUploaded: ({ data, caption }) => {
      addLocalSnap(data); pendingPol = { id: 'mine', gid: ME, data, caption: caption || t('snap_shared'), name: myName() };
      villagers.get(ME)?.doEmote('heart', { glow: true });
    } });
    $('#snap-village h3').id = 'sheet-title';
  }
  sheet.hidden = sheetBg.hidden = false; follow = true;
}
function closeSheet() {
  sheet.hidden = sheetBg.hidden = true;
  if (pendingPol) { const s = pendingPol; pendingPol = null; setTimeout(() => showPolaroid(s), 250); }
}
sheetBg.addEventListener('click', closeSheet); $('#sheet-x').addEventListener('click', closeSheet);
addEventListener('keydown', e => { if (e.key === 'Escape' && !sheet.hidden) closeSheet(); });
$('#sheet-x').setAttribute('aria-label', t('close'));
// phones don't download everyone's snaps (keeps reads low) — but my own photos show up on the in-village photo wall
if (ME && !HOST) mySnaps(ME).th.forEach(addLocalSnap);

function onEvent(e) {
  if (e.type === 'bouquet') startBouquet(e.id || e.createdAt);
  else if (e.type === 'group') startGroupPhoto();
  else if (e.type === 'fireworks') launchFireworks(10);
}

// ============================================================
//  RENDER
// ============================================================
function drawPixels(rows, x, y, col) { wctx.fillStyle = col; rows.forEach((row, ry) => [...row].forEach((ch, rx) => { if (ch === 'x') wctx.fillRect(Math.round(x) + rx, Math.round(y) + ry, 1, 1); })); }

// critter sprites & light list are built once (they used to allocate new canvases every frame)
const critterCache = new Map();
function critterImg(kind, f) { const k = kind + f; if (!critterCache.has(k)) critterCache.set(k, kind === 'chicken' ? chickenImg(f) : petImg(kind, f)); return critterCache.get(k); }
let lightCache = { level: -1, list: [] };
const lightsFor = lv => (lightCache.level === lv ? lightCache.list : (lightCache = { level: lv, list: lightSources(lv) }).list);
const shimmer = Array.from({ length: 40 }, () => ({ x: 0, y: 0, life: 0, w: 2 }));
function drawWorld(time, dt) {
  HINFO.time = time; HINFO.dt = dt; HINFO.night = night; HINFO.level = level;      // v4: what every draw hook gets (one reused object)
  wctx.globalCompositeOperation = 'source-over';
  wctx.drawImage(ground, 0, 0);
  drawLayer('ground');                                                         // v4 ctx.v.onDraw({ layer: 'ground' })
  // water shimmer
  for (const s of shimmer) {
    s.life -= dt;
    if (s.life <= 0) { for (let i = 0; i < 10; i++) { const x = rnd(300, 478), y = rnd(14, 130); if (isWater(x, y) && isWater(x + 5, y)) { s.x = Math.round(x); s.y = Math.round(y); break; } } s.life = rnd(0.6, 2); s.w = Math.random() < 0.3 ? 4 : 2; }
    wctx.fillStyle = '#d8f1ff'; wctx.fillRect(s.x, s.y, s.w, 1);
  }
  if (level >= 2) { // fountain spray
    const fx = (Z.fountain[0] + 1) * TILE, fy = Z.fountain[1] * TILE - 6;
    for (let i = 0; i < 3; i++) particles.push({ type: 'drop', x: fx + rnd(-1, 1), y: fy + 6, vx: rnd(-14, 14), vy: rnd(-34, -24), life: 0.9 });
  }

  // y-sorted props + entities
  const items = props.map(p => ({ base: p.base, draw: () => { wctx.drawImage(p.img, Math.round(p.x), Math.round(p.y)); if (p.kind === 'photowall') drawWallSnap(p, time); } }));
  for (const p of extraProps) items.push(p.item);                              // v4 ctx.v.addProp (persistent { base, draw } objects — nothing allocated per frame)
  for (const e of [...villagers.values(), ...couple]) items.push({ base: e.y, draw: () => drawEntity(e, time) });
  for (const c of critters) items.push({ base: c.y, draw: () => { const img = critterImg(c.kind, c.kind === 'chicken' ? Math.floor(c.anim * 3) % 2 : Math.floor(c.anim * 4) % 2); wctx.save(); wctx.translate(Math.round(c.x) + (c.dir < 0 ? img.width : 0), Math.round(c.y) - img.height); if (c.dir < 0) wctx.scale(-1, 1); wctx.drawImage(img, 0, 0); wctx.restore(); } });
  items.sort((a, b) => a.base - b.base).forEach(i => i.draw());

  drawOverhead(wctx, time, level, night);
  drawLayer('overhead');                                                       // v4 ctx.v.onDraw({ layer: 'overhead' })

  // rainbow (level 6)
  if (level >= 6) {
    wctx.globalAlpha = 0.28;
    ['#ff6b6b', '#ffb36b', '#ffe66b', '#7ed97e', '#6bb5ff', '#9b7bff'].forEach((col, i) => { wctx.strokeStyle = col; wctx.lineWidth = 2; wctx.beginPath(); wctx.arc(26.5 * TILE, 9 * TILE, 110 - i * 2, Math.PI * 1.05, Math.PI * 1.95); wctx.stroke(); });
    wctx.globalAlpha = 1;
  }

  // particles
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]; p.life -= dt;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    if (p.type === 'flash') { wctx.fillStyle = `rgba(255,255,255,${p.life * 3})`; wctx.beginPath(); wctx.arc(p.x, p.y, 10 * (1 - p.life * 2), 0, Math.PI * 2); wctx.fill(); continue; }
    p.x += (p.vx || 0) * dt; p.y += p.vy * dt;
    if (p.type === 'spark') { p.vy += 60 * dt; wctx.fillStyle = p.c; wctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1); }
    else if (p.type === 'drop') { p.vy += 70 * dt; wctx.fillStyle = '#d8f1ff'; wctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1); }
    else if (p.type === 'fish') { p.vy += 140 * dt; wctx.fillStyle = p.c; wctx.fillRect(Math.round(p.x) - 2, Math.round(p.y), 5, 2); wctx.fillRect(Math.round(p.x) + 3, Math.round(p.y) - 1, 1, 4); }
    else if (p.type === 'note') { wctx.globalAlpha = Math.min(1, p.life); drawPixels(NOTE, p.x, p.y, p.c); wctx.globalAlpha = 1; }
    else if (p.type === 'confetti') { p.vy += 55 * dt; wctx.globalAlpha = Math.min(1, p.life); wctx.fillStyle = p.c; wctx.fillRect(Math.round(p.x), Math.round(p.y), p.w, 2); wctx.globalAlpha = 1; }   // v4 ctx.v.fx.confetti
    else { wctx.globalAlpha = Math.min(1, p.life); drawPixels(HEART, p.x - 2, p.y, '#ff6f9c'); wctx.fillStyle = '#ffd0df'; wctx.fillRect(Math.round(p.x) - 1, Math.round(p.y) + 1, 1, 1); wctx.globalAlpha = 1; }
  }
  // bouquet in flight
  if (event?.bq && event.bq.t < 1) {
    const b = event.bq, k = Math.min(1, b.t), x = b.x0 + (b.x1 - b.x0) * k, y = b.y0 + (b.y1 - b.y0) * k - Math.sin(k * Math.PI) * 70;
    wctx.fillStyle = '#5e9a46'; wctx.fillRect(Math.round(x) - 1, Math.round(y) + 2, 3, 4);
    [['#ffffff', -2, -1], ['#ff9ec4', 1, -2], ['#ffc39a', 0, 0], ['#f27aa6', 2, 1], ['#ffffff', -1, 1]].forEach(([c, dx, dy]) => { wctx.fillStyle = c; wctx.fillRect(Math.round(x + dx), Math.round(y + dy), 2, 2); });
    if (Math.random() < 0.6) particles.push({ type: 'spark', x, y, vx: rnd(-8, 8), vy: rnd(-5, 5), life: 0.5, c: '#ffd75e' });
  }
  // petals
  wctx.fillStyle = night ? '#d6a8c8' : '#ffc0d6';
  for (const p of petals) { p.x += (p.vx + Math.sin(time * 1.3 + p.ph) * 6) * dt; p.y += p.vy * dt; if (p.y > H) { p.y = -2; p.x = rnd(-40, W); } if (p.x > W) p.x = -2; wctx.fillRect(Math.round(p.x), Math.round(p.y), Math.sin(time * 3 + p.ph) > 0 ? 2 : 1, 1); }

  drawLayer('fx');                                                             // v4 ctx.v.onDraw({ layer: 'fx' }) — after particles, before lighting and fireworks

  // lighting
  const dark = night ? 1 : Math.min(1, fxDark / 3) * 0.6;
  if (fxDark > 0) fxDark -= dt;
  if (dark > 0) {
    wctx.globalCompositeOperation = 'multiply';
    wctx.fillStyle = `rgba(${Math.round(255 - 170 * dark)},${Math.round(255 - 160 * dark)},${Math.round(255 - 90 * dark)},1)`; wctx.fillRect(0, 0, W, H);
    wctx.globalCompositeOperation = 'lighter';
    const glow = (x, y, r, a, col) => { const gr = wctx.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, col.replace('A', a)); gr.addColorStop(1, col.replace('A', 0)); wctx.fillStyle = gr; wctx.fillRect(x - r, y - r, r * 2, r * 2); };
    lightsFor(level).forEach((L, i) => glow(L.x, L.y, L.r, (0.32 + 0.05 * Math.sin(time * 3 + i)) * dark, L.c));
    if (night) for (const f of fireflies) { f.x += Math.sin(time * f.sp + f.ph) * 8 * dt; f.y += Math.cos(time * f.sp * 0.7 + f.ph) * 5 * dt; const a = Math.max(0, Math.sin(time * 2 * f.sp + f.ph)); if (a > 0.1) { wctx.fillStyle = `rgba(220,255,140,${a})`; wctx.fillRect(Math.round(f.x), Math.round(f.y), 1, 1); } }
    wctx.globalCompositeOperation = 'source-over';
  }
  // fireworks (drawn on top, additive)
  wctx.globalCompositeOperation = 'lighter';
  for (let i = fireworks.length - 1; i >= 0; i--) {
    const f = fireworks[i];
    if (!f.burst) { f.y += f.vy * dt; wctx.fillStyle = '#fff2c4'; wctx.fillRect(Math.round(f.x), Math.round(f.y), 1, 3); if (f.y <= f.ty) { f.burst = true; for (let k = 0; k < 36; k++) { const a = k / 36 * Math.PI * 2, sp = rnd(30, 60); f.parts.push({ x: f.x, y: f.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rnd(1, 1.6) }); } } }
    else {
      f.parts.forEach(p => { p.life -= dt; p.vy += 25 * dt; p.vx *= 0.985; p.x += p.vx * dt; p.y += p.vy * dt; if (p.life > 0) { wctx.fillStyle = f.c; wctx.globalAlpha = Math.min(1, p.life); wctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1); } });
      wctx.globalAlpha = 1; f.parts = f.parts.filter(p => p.life > 0); if (!f.parts.length) fireworks.splice(i, 1);
    }
  }
  wctx.globalCompositeOperation = 'source-over';
  if (wantShot) { savePNG(wantShot); wantShot = null; }
  if (flashAll > 0) { wctx.fillStyle = `rgba(255,255,255,${flashAll})`; wctx.fillRect(0, 0, W, H); flashAll -= dt * 1.5; }
}

function drawEntity(e, time) {
  const x = Math.round(e.x), y = Math.round(e.y), hop = e.hopPx();
  wctx.fillStyle = 'rgba(30,40,20,0.25)'; wctx.fillRect(x - 6, y - 1, 13, 2); wctx.fillRect(x - 4, y - 2, 9, 1); wctx.fillRect(x - 4, y + 1, 9, 1);
  if (e.glow > 0) { // "that's me!" ring
    const a = 0.5 + 0.5 * Math.sin(time * 8);
    wctx.strokeStyle = `rgba(255,215,94,${a})`; wctx.lineWidth = 1; wctx.beginPath(); wctx.ellipse(x + 0.5, y + 0.5, 10, 4, 0, 0, Math.PI * 2); wctx.stroke();
  }
  const { f, flip } = e.frame();
  const img = e.sprite[f];
  const sx = x - Math.floor(SPRITE_W / 2), sy = y - SPRITE_H + 2 - hop;
  // fishing rod behind/in front
  const fishing = e.state === 'act' && e.act === 'fish';
  if (fishing && e.facing === 'up') drawRod(e, x, sy);
  if (flip) { wctx.save(); wctx.translate(sx + SPRITE_W, sy); wctx.scale(-1, 1); wctx.drawImage(img, 0, 0); wctx.restore(); }
  else wctx.drawImage(img, sx, sy);
  if (fishing && e.facing !== 'up') drawRod(e, x, sy);
  if (e.state === 'act' && e.act === 'photo' && e.facing !== 'up') { const cx2 = e.facing === 'up' ? x - 3 : x + 4, cy2 = sy + (e.facing === 'up' ? 8 : 9); wctx.fillStyle = '#2b2b36'; wctx.fillRect(cx2, cy2, 7, 5); wctx.fillStyle = '#8fd3ff'; wctx.fillRect(cx2 + 2, cy2 + 1, 3, 3); }
  if (decoHooks.length && !e.isCouple) decorate(e, x, y, time);                 // v4 ctx.v.decorate (crowns, badges …)
}
function drawRod(e, x, sy) {
  const hx = e.facing === 'left' ? x - 8 : x + 8, hy = sy + 22;
  const [bx, by] = e.bobber();
  const tipx = e.facing === 'left' ? hx - 10 : e.facing === 'right' ? hx + 10 : hx + 2, tipy = hy - 14;
  wctx.strokeStyle = '#8a5a32'; wctx.lineWidth = 1; wctx.beginPath(); wctx.moveTo(hx, hy); wctx.lineTo(tipx, tipy); wctx.stroke();
  wctx.strokeStyle = 'rgba(255,255,255,0.7)'; wctx.beginPath(); wctx.moveTo(tipx, tipy); wctx.quadraticCurveTo((tipx + bx) / 2, Math.max(tipy, by) + 6, bx, by); wctx.stroke();
  wctx.fillStyle = '#e8463c'; wctx.fillRect(Math.round(bx) - 1, Math.round(by) - 1, 3, 2); wctx.fillStyle = '#ffffff'; wctx.fillRect(Math.round(bx) - 1, Math.round(by) + 1, 3, 1);
}

function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function wrap(g, text, maxW, maxLines) {
  const tokens = text.replace(/\s+/g, ' ').trim().match(/\S+ ?/g) || [];   // break between words (Korean keep-all style); over-long words are split below
  const lines = []; let line = '', cut = false;
  for (let tok of tokens) {
    if (g.measureText(line + tok.trimEnd()).width <= maxW) { line += tok; continue; }
    if (line.trim()) { lines.push(line.trimEnd()); line = ''; if (lines.length === maxLines) { cut = true; break; } }
    while (g.measureText(tok.trimEnd()).width > maxW) { let i = tok.length; while (i > 1 && g.measureText(tok.slice(0, i)).width > maxW) i--; lines.push(tok.slice(0, i)); tok = tok.slice(i); if (lines.length === maxLines) { cut = true; break; } }
    if (cut) break; line = tok.trimStart();
  }
  if (!cut && line.trim()) { if (lines.length < maxLines) lines.push(line.trimEnd()); else cut = true; }
  if (cut) { let l = lines[lines.length - 1] || ''; while (l && g.measureText(l + '…').width > maxW) l = l.slice(0, -1); lines[lines.length - 1] = l.trimEnd() + '…'; }
  return lines;
}

// balanced wrap: same number of lines, but as even as possible (no lonely last word), cached per message
const wrapCache = new Map();
function wrapBalanced(g, text, maxW, maxLines) {
  const key = g.font + '|' + Math.round(maxW) + '|' + text;
  let r = wrapCache.get(key); if (r) return r;
  r = wrap(g, text, maxW, maxLines);
  const clean = l => l.length && !l[l.length - 1].endsWith('…');
  if (r.length > 1 && clean(r)) {
    let lo = maxW * 0.45, hi = maxW;
    for (let i = 0; i < 9; i++) { const mid = (lo + hi) / 2, t2 = wrap(g, text, mid, maxLines); if (t2.length === r.length && clean(t2)) hi = mid; else lo = mid; }
    r = wrap(g, text, hi, maxLines);
  }
  if (wrapCache.size > 400) wrapCache.clear();
  wrapCache.set(key, r); return r;
}

let bubbleClock = 3;
function scheduleBubbles(dt) {
  bubbleClock -= dt; if (bubbleClock > 0) return; bubbleClock = rnd(1.8, 3.2);
  if (event) return;
  const vs = everyone(); if (vs.filter(v => v.bubble > 0).length >= 3) return;
  const now = performance.now() / 1000;
  const c = vs.filter(v => v.bubble <= 0 && v.g.message.trim() && now - v.lastBubble > 25 && v.state !== 'move').sort((a, b) => a.lastBubble - b.lastBubble);
  if (!c.length) return; const v = c[Math.floor(Math.random() * Math.min(4, c.length))]; v.bubble = 6.5; v.lastBubble = now;
}

function drawOverlay() {
  const k = S * dpr;
  const ox = (baseX - camX - view.x) * dpr, oy = (baseY - camY - view.y) * dpr;   // world → overlay pixels
  const X = wx => ox + wx * k, Y = wy => oy + wy * k;
  const onScreen = (x, y, m = 120 * dpr) => x > -m && x < over.width + m && y > -m && y < over.height + m;
  octx.clearRect(0, 0, over.width, over.height);
  const minFs = Math.ceil(10 * dpr / 11) * 11;
  const fs = Math.max(minFs, Math.round(k * 5 / 11) * 11);
  const tiny = k < 2.2 * dpr && TOUCH;           // whole-map view on a phone: keep text minimal
  octx.font = `${fs}px Galmuri11, sans-serif`; octx.textBaseline = 'middle'; octx.textAlign = 'center';
  OINFO.X = X; OINFO.Y = Y; OINFO.k = k; OINFO.fs = fs; OINFO.dpr = dpr; OINFO.time = frameTime; OINFO.w = over.width; OINFO.h = over.height;   // v4: what every overlay hook gets

  // welcome banner text
  {
    const bx = X(BANNER.x + BANNER.w / 2), by = Y(BANNER.y + 13);
    const f2 = Math.max(11, Math.round(k * 6.5 / 11) * 11);
    octx.font = `bold ${f2}px Galmuri11, sans-serif`; octx.fillStyle = '#2b2033';
    const names = `${CONFIG.couple.groom[lang]} ♥ ${CONFIG.couple.bride[lang]}`;
    const mw = (BANNER.w - 12) * k; let sz = f2; while (octx.measureText(names).width > mw && sz > 9) { sz -= 1; octx.font = `bold ${sz}px Galmuri11, sans-serif`; }
    octx.fillText(names, bx, by);
    octx.font = `${fs}px Galmuri11, sans-serif`;
  }
  const ents = [...villagers.values(), ...couple].sort((a, b) => a.y - b.y);
  const crowd = villagers.size > 30, slot = Math.floor(performance.now() / 6000);
  const hash = id => { let h = 0; for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) | 0; return Math.abs(h); };
  // name tags nudge up/down when they would overlap a neighbour's (e.g. guests chatting side by side)
  const placed = [];
  const tag = (x, y, name, bg, fg) => {
    const tw = octx.measureText(name).width + fs * 0.7, th = fs * 1.35;
    const hit = yy => placed.some(r => x - tw / 2 < r[2] && x + tw / 2 > r[0] && yy - th / 2 < r[3] && yy + th / 2 > r[1]);
    for (const dy of [0, th * 1.05, -th * 1.05, th * 2.1]) if (!hit(y + dy)) { y += dy; break; }
    placed.push([x - tw / 2, y - th / 2, x + tw / 2, y + th / 2]);
    octx.fillStyle = bg; roundRect(octx, x - tw / 2, y - th / 2, tw, th, fs * 0.25); octx.fill();
    octx.fillStyle = fg; octx.fillText(name, x, y + fs * 0.05);
  };
  overlayLayer('under-tags');                                                  // v4 ctx.v.onOverlay({ layer: 'under-tags' })
  // the couple share one tag ("Patrick ♥ Sunkyung") so long English names don't collide
  if (couple.length === 2) {
    const cx = X((couple[0].x + couple[1].x) / 2), cy = Y(Math.max(couple[0].y, couple[1].y) + 5);
    if (onScreen(cx, cy)) tag(cx, cy, `${CONFIG.couple.groom[lang]} ♥ ${CONFIG.couple.bride[lang]}`, 'rgba(43,32,51,.92)', '#ffd75e');
  }
  for (const e of ents) {
    if (e.isCouple) continue;
    // big crowds: name tags take turns (always shown for the couple, new arrivals, emotes and speakers)
    if (crowd && !e.isCouple && !(e.glow > 0) && !(e.bubble > 0) && (hash(e.g.id) + slot) % 2 && !(ME && e.g.id === ME)) continue;
    if (tiny && !e.isCouple && !(ME && e.g.id === ME) && !(e.glow > 0)) continue;
    const x = X(e.x), y = Y(e.y + 5);
    if (!onScreen(x, y)) continue;
    const chars = Array.from(e.g.name), name = chars.length > 8 ? chars.slice(0, 8).join('') + '…' : e.g.name;   // never cut an emoji in half
    tag(x, y, name, e.glow > 0 ? 'rgba(255,215,94,.95)' : ({ groom: 'rgba(61,90,158,.86)', bride: 'rgba(196,90,134,.86)', both: 'rgba(106,79,163,.88)' }[e.g.side] || 'rgba(43,32,51,.85)'), e.glow > 0 ? '#2b2033' : '#fff');
  }
  overlayLayer('over-tags');                                                   // v4 ctx.v.onOverlay({ layer: 'over-tags' })
  // small icons (!, 냠, ㅋㅋ ...)
  for (const e of ents) {
    if (!e.icon || e.bubble > 0 || tiny) continue;
    const x = X(e.x), y = Y(e.y - SPRITE_H - 2 - e.hopPx());
    if (!onScreen(x, y)) continue;
    const w2 = octx.measureText(e.icon.ch).width + fs * 0.8;
    octx.fillStyle = '#fff'; roundRect(octx, x - w2 / 2, y - fs * 0.75, w2, fs * 1.5, fs * 0.5); octx.fill();
    octx.strokeStyle = '#2b2033'; octx.lineWidth = Math.max(1, k * 0.6); octx.stroke();
    octx.fillStyle = e.icon.ch === '!' ? '#e8463c' : '#2b2033'; octx.fillText(e.icon.ch, x, y);
  }
  // message bubbles
  for (const e of ents) {
    if (!(e.bubble > 0) || tiny || !onScreen(X(e.x), Y(e.y))) continue;
    const a = Math.min(1, e.bubble * 2, (6.5 - e.bubble) * 3); octx.globalAlpha = a;
    const lines = wrapBalanced(octx, e.g.message, Math.min(88 * k, over.width * 0.8) - fs, 2);
    const bw = Math.max(...lines.map(l => octx.measureText(l).width)) + fs * 1.2, bh = lines.length * fs * 1.4 + fs * 0.7;
    let bx = X(e.x) - bw / 2; bx = Math.max(4, Math.min(over.width - bw - 4, bx));
    const by = Math.max(4, Y(e.y - SPRITE_H - 2 - e.hopPx()) - bh), bt = Math.max(2, Math.round(k * 0.8));
    octx.fillStyle = '#2b2033'; roundRect(octx, bx - bt, by - bt, bw + bt * 2, bh + bt * 2, fs * 0.35); octx.fill();
    octx.fillStyle = '#ffffff'; roundRect(octx, bx, by, bw, bh, fs * 0.3); octx.fill();
    const tx = X(e.x); octx.beginPath(); octx.moveTo(tx - fs * 0.4, by + bh); octx.lineTo(tx + fs * 0.4, by + bh); octx.lineTo(tx, by + bh + fs * 0.6); octx.closePath(); octx.fill();
    octx.fillStyle = '#2b2033'; lines.forEach((l, i) => octx.fillText(l, bx + bw / 2, by + fs * 1.05 + i * fs * 1.4));
    octx.globalAlpha = 1;
  }
  // countdown
  if (event?.count) {
    const f3 = Math.round(Math.min(k * 40, over.width * 0.25)); octx.font = `bold ${f3}px Galmuri11, sans-serif`;
    octx.lineWidth = k * 4; octx.strokeStyle = '#2b2033'; octx.fillStyle = '#ffd75e';
    const txt = event.type === 'group' ? (lang === 'ko' ? ['', '하나', '둘', '셋'][4 - event.count] || '' : String(event.count)) : String(event.count);
    octx.strokeText(txt, over.width / 2, over.height * 0.42); octx.fillText(txt, over.width / 2, over.height * 0.42);
  }
  overlayLayer('top');                                                         // v4 ctx.v.onOverlay({ layer: 'top' }) — after the countdown
}

// ============================================================
//  LOOP
// ============================================================
let last = performance.now();
let loopErrors = 0;
function loop(now) {
  requestAnimationFrame(loop);              // scheduled first: one bad frame must never freeze the village for the night
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  const time = now / 1000;
  try {
    villagers.forEach(v => v.update(dt)); couple.forEach(c => c.update(dt)); critters.forEach(c => updateCritter(c, dt));
    updateEvent(dt); scheduleBubbles(dt); rotateTicker(dt); ambient(dt); updateSnaps(dt);
    frameTime = time; runHooks(updHooks, dt, time);                            // v4 ctx.v.onUpdate (each hook has its own try/catch — a feature error never reaches the catch below)
    if (level >= 4 && Math.random() < dt / 180) launchFireworks(5);
    updateCamera(dt, time);
    drawWorld(time, dt); drawOverlay();
  } catch (err) {
    if (loopErrors++ < 5) console.error('village frame', err);
    if (event) { const ev = event; event = null; try { releaseAll(); } catch {} try { announce('end', ev); } catch {} }
  }
}
// 'auto' time of day: re-check every minute
setInterval(() => { if (nightManual) return; const n = autoNight(); if (n !== night) { night = n; rebuild(); } }, 60000);
requestAnimationFrame(loop);

// ============================================================
//  CONTROLS
// ============================================================
let hintTimer;
function wake() {
  if (!audio) { try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch {} }
  document.body.classList.add('cursor'); clearTimeout(hintTimer); hintTimer = setTimeout(() => document.body.classList.remove('cursor'), 2500);
}
addEventListener('pointerdown', () => { wake(); const h = $('.start-hint'); if (h) h.style.opacity = 0; });
addEventListener('mousemove', wake);
addEventListener('dblclick', e => { if (!TOUCH) toggleFS(); });
function toggleFS() {
  const d = document, el = d.documentElement;
  if (d.fullscreenElement || d.webkitFullscreenElement) { (d.exitFullscreen || d.webkitExitFullscreen)?.call(d); return; }
  const req = el.requestFullscreen || el.webkitRequestFullscreen;
  if (req) { try { const r = req.call(el, { navigationUI: 'hide' }); r?.catch?.(() => iosHint()); } catch { iosHint(); } }
  else iosHint();
}
function iosHint() {
  if (window.navigator.standalone) return;
  banner(lang === 'ko' ? '📱 iPhone은 공유 버튼 → "홈 화면에 추가" 후 열면 전체화면으로 볼 수 있어요' : '📱 On iPhone: Share → "Add to Home Screen" for full screen', 6000, 'small');
}
document.addEventListener('fullscreenchange', () => setTimeout(layout, 100));
document.addEventListener('webkitfullscreenchange', () => setTimeout(layout, 100));
addEventListener('keydown', e => {
  if (e.target.closest?.('input, textarea')) return;   // typing a photo caption must not trigger shortcuts
  wake(); const key = (e.key || '').toLowerCase();
  if (key === 'f') toggleFS();
  if (key === 'h') hud.classList.toggle('hide-ui');
  if (key === 'q') hud.classList.toggle('no-qr');
  if (key === 'm') soundOn = !soundOn;
  if (key === 'n') { night = !night; nightManual = true; rebuild(); }
  if (key === 's') savePNG('village');
  if (key === 'b') startBouquet();
  if (key === 'g') startGroupPhoto();
  if (key === 'x') launchFireworks(10);
  if (DEMO && key === 'd') addSample(1);
  if (DEMO && key === 'l') addSample(5);
  if (DEMO && key === 'e') { const v = pick(everyone()); if (v) v.doEmote(pick(EMOTES)); }
});
setTimeout(() => { const h = $('.start-hint'); if (h) h.style.opacity = 0; }, 8000);

function savePNG(name) {
  const sc = 4, c = document.createElement('canvas'); c.width = W * sc; c.height = H * sc;
  const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
  g.drawImage(world, 0, 0, c.width, c.height);
  if (!maxCamX && !maxCamY) g.drawImage(over, 0, 0, c.width, c.height);
  const a = document.createElement('a'); a.download = `${name}-${Date.now()}.png`; a.href = c.toDataURL('image/png'); a.click();
}

// ---------- demo samples ----------
const SAMPLE = [
  ['민준', '결혼 축하해! 둘이 오래오래 행복하게 살아~'], ['Emily', 'Congratulations! Wishing you a lifetime of love and laughter.'],
  ['서연', '세상에서 제일 예쁜 신부! 너무 축하해'], ['Daniel', 'So happy for you both. Cheers to forever!'],
  ['지호', '신랑 오늘 멋있다! 잘 살아라 ㅎㅎ'], ['하은', '두 분의 앞날에 늘 웃음이 가득하길 바라요'],
  ['Grace', 'Best wishes from all of us!'], ['도윤', '축하합니다! 다음엔 집들이 초대해줘'],
  ['수아', '행복한 가정 이루세요~ 사랑해요'], ['James', 'You two are perfect together.'],
  ['예린', '오늘 정말 아름다운 결혼식이었어요!'], ['Sophia', 'Love you both! Have an amazing honeymoon.'],
];
let sampleIdx = 0;
async function addSample(n) {
  const store = await getStore();
  for (let i = 0; i < n; i++) {
    const [name, message] = SAMPLE[sampleIdx++ % SAMPLE.length];
    await store.addGuest({ name: name + (sampleIdx > SAMPLE.length ? Math.ceil(sampleIdx / SAMPLE.length) : ''), side: pick(['groom', 'bride', 'both']), message, avatar: randomAvatar(), activity: pick(['walk', 'dance', 'fish', 'chat', 'eat', 'photo']) }, null);
  }
}

// ============================================================
//  v4 extension points (WP-00c §5) — the only way features touch this page. docs/v4/02-contracts.md §7
//  With every feature off none of this runs: no hooks, no zones filled, no spotlight, no phone buttons.
// ============================================================
const noop = () => {};
const coded = (code, msg) => Object.assign(new Error(msg), { code });
const NAME_OK = id => new RegExp('^f-' + id + '(-[a-z0-9-]{1,24})?$');
const isNum = (...a) => a.every(Number.isFinite);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const RESERVED_KEYS = new Set(['f', 'h', 'q', 'm', 'n', 's', 'b', 'g', 'x', 'd', 'l', 'e', 'escape', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ']);
const DIRS = ['up', 'down', 'left', 'right'], KINDS = ['', 'gold', 'small'], ZONES = ['tl', 'tr', 'rm', 'tc'];
const LAYERS = ['ground', 'overhead', 'fx'], OVERLAYS = ['under-tags', 'over-tags', 'top'];
const CONFETTI = ['#ffd75e', '#ff6f9c', '#8fd3ff', '#b7f08a', '#ffffff', '#c9a5ff'];
const room = () => particles.length < 800;                              // a feature can never flood the particle list
const FROZEN_Z = Object.freeze(Object.fromEntries(Object.entries(Z).map(([k, v]) => [k, Object.freeze([...v])])));
const coreScope = { id: 'core', alive: () => true, report: e => console.error('[village]', e) };   // owner of the core "⋯" sheet

// ---- quiet mode (live.quiet — the admin's 🤫): the core holds back banners, chime, fireworks, polaroids and spotlights; phones show a chip ----
function setQuiet(on) {
  on = on === true; if (on === quiet) return;
  quiet = on; document.body.classList.toggle('quiet', quiet);
  const chip = $('#quiet-chip'); if (chip) { chip.hidden = !quiet; chip.querySelector('span').textContent = t('quiet_chip'); }
  if (quiet) {
    $('#arrival').className = 'arrival';                                  // whatever is on screen goes away now; the queue waits
    $('#polaroid')?.classList.remove('on');
    if (spotCur) endSpot(spotCur);
  } else kickBanners();                                                   // merged on the way out (mergeArrivals)
}

// the page's own text (the loader calls this after ctx.texts changes — it must not emit 'lang')
function refreshTexts() {
  try { applyI18n(); } catch {}
  const chip = $('#quiet-chip span'); if (chip) chip.textContent = t('quiet_chip');
  renderLevel(); paintActions();
}

// ---- villager / couple handles (what ctx.v hands out — never the real objects) ----
const internalOf = new WeakMap();                                         // handle → the real Villager (formation() takes handles)
function villagerApi(e) {
  if (e.api) return e.api;
  const needScene = what => { if (event?.type !== 'scene') throw coded('not-in-scene', `Villager.${what}() only works inside ctx.v.runScene()`); };
  const dir = f => (DIRS.includes(f) ? f : 'down');
  const h = Object.freeze({
    get gid() { return e.g.id; }, get g() { return e.g; }, get x() { return e.x; }, get y() { return e.y; },
    get facing() { return e.facing; }, get state() { return e.state; }, get act() { return e.act; },
    emote(type, o = {}) {
      if (!EMOTES.includes(type)) throw coded('bad-arg', `Villager.emote: unknown type "${type}"`);
      if (e.script || villagers.get(e.g.id) !== e) return false;
      e.doEmote(type, { glow: o?.glow, short: o?.short === true }); return true;
    },
    glow(sec) { if (Number.isFinite(sec) && sec > 0) e.glow = Math.max(e.glow, Math.min(60, sec)); },
    hop() { e.hop = 0.8; },
    icon(ch, sec = 1.6) { e.icon = { ch: String(ch ?? '').slice(0, 4), t: clamp(Number(sec) || 1.6, 0.2, 10) }; },
    walkTo(tile, face) {
      needScene('walkTo');
      if (!Array.isArray(tile) || !isNum(tile[0], tile[1])) throw coded('bad-arg', 'Villager.walkTo([tx, ty], face?) takes a tile');
      e.release(); e.emote = null; e.script = { face: dir(face) }; e.goTo([tile[0], tile[1]]);
    },
    hold(face) { needScene('hold'); e.release(); e.emote = null; e.path = []; e.script = { face: dir(face) }; e.state = 'hold'; e.facing = dir(face); },
    free() { needScene('free'); e.script = null; e.state = 'idle'; e.timer = rnd(0.5, 3); },
  });
  e.api = h; internalOf.set(h, e); return h;
}
const coupleApis = Object.freeze(couple.map(c => Object.freeze({
  get x() { return c.x; }, get y() { return c.y; },
  wave() { c.wave = 1.6; }, hop() { c.hop = 0.8; },
  face(d) { if (!DIRS.includes(d)) throw coded('bad-arg', 'Couple.face(dir): up | down | left | right'); c.face(d); },
  walkTo(x, y, speed = 24) { if (!isNum(x, y) || !(speed > 0)) throw coded('bad-arg', 'Couple.walkTo(x, y, speed?) takes numbers'); c.walkTo(x, y, Math.min(speed, 80)); },
  home() { c.home(); },
})));
let coupleSpritesOwner = null;
function resetCoupleSprites() { couple.forEach(c => { c.sprite = c.baseSprite; }); coupleSpritesOwner = null; }

// ---- ticker: a feature's prefix / second line repaint at once when it appears or goes away ----
function repaintTicker() { const el = $('#ticker'); if (el && tickerG) tickerExtras(el, tickerG); }

// ---- sync again from the last list (presence / arrive changes); a call from inside a sync handler waits one tick ----
let resyncQueued = false;
function resync() {
  if (firstLoad || !lastList) return;                                     // the first sync is not here yet — it will use the new rules anyway
  if (syncing) { if (!resyncQueued) { resyncQueued = true; setTimeout(() => { resyncQueued = false; if (!syncing) sync(lastList); }, 0); } return; }
  sync(lastList);
}

// ---- spotlight: the centre slot shared with the polaroids (TV only). Each waits for "no polaroid, no event, not quiet"; the two kinds take turns ----
const spotQueue = []; let spotCur = null, lastKind = '';
function showSpot() {
  const sp = spotQueue.shift(); if (!sp) return;
  const box = $('#spot'); polBusy = true; lastKind = 'spot'; spotCur = sp;
  box.replaceChildren(); box.dataset.owner = sp.scope.id; box.dataset.key = sp.key;
  try { const c = sp.render(box); sp.cleanup = typeof c === 'function' ? c : null; }
  catch (e) { sp.scope.report(e); endSpot(sp, true); return; }
  box.classList.add('on'); sp.timer = setTimeout(() => endSpot(sp), sp.ms);
}
function endSpot(sp, instant = false) {
  if (spotCur !== sp) return;
  spotCur = null; clearTimeout(sp.timer);
  const box = $('#spot'); box.classList.remove('on');
  try { sp.cleanup?.(); } catch (e) { sp.scope.report(e); }
  const clear = () => { box.replaceChildren(); delete box.dataset.owner; delete box.dataset.key; polBusy = false; };
  if (instant) clear(); else setTimeout(() => { if (!spotCur) clear(); }, 700);   // fade-out time, like the polaroid
  sp.resolve();
}

// ---- generic bottom sheet (#fsheet): one at a time, shares #sheet-bg with the photo sheet ----
const fsheet = $('#fsheet'), fsheetBody = $('#fsheet-body'), fsheetTitle = $('#fsheet-title');
let fsheetCur = null;
function openFSheet(spec) {
  if (!sheet.hidden) closeSheet();                                         // the photo sheet gives way
  closeFSheet();                                                           // the previous feature sheet gets its onClose
  fsheetTitle.textContent = spec.title; fsheetBody.replaceChildren();
  const cur = fsheetCur = { key: spec.key, scope: spec.scope, onClose: spec.onClose, cleanup: null };
  try { const c = spec.render(fsheetBody); cur.cleanup = typeof c === 'function' ? c : null; } catch (e) { spec.scope.report(e); }
  fsheet.dataset.owner = spec.scope.id; fsheet.hidden = sheetBg.hidden = false;
  $('#fsheet-x')?.focus?.({ preventScroll: true });
}
function closeFSheet(silent = false) {
  const cur = fsheetCur; if (!cur) return; fsheetCur = null;
  fsheet.hidden = true; if (sheet.hidden) sheetBg.hidden = true;
  try { cur.cleanup?.(); } catch (e) { cur.scope.report(e); }
  fsheetBody.replaceChildren(); delete fsheet.dataset.owner;
  if (!silent && typeof cur.onClose === 'function') { try { cur.onClose(); } catch (e) { cur.scope.report(e); } }
}
sheetBg.addEventListener('click', () => closeFSheet());
$('#fsheet-x')?.addEventListener('click', () => closeFSheet());
$('#fsheet-x')?.setAttribute('aria-label', t('close'));
addEventListener('keydown', e => { if (e.key === 'Escape' && fsheetCur) closeFSheet(); });

// ---- phone buttons (ctx.v.actions): one slot after 📷 (or after the sign-in link) — one action as it is, 2+ → the first one + "⋯" ----
const actionItems = []; let paintedSig = '';
const actionLabel = a => { let l = a.label; try { if (typeof l === 'function') l = l(); } catch (e) { a.scope.report(e); l = ''; } return String(l ?? '').slice(0, 12); };
function actionVisible(a) { if (!a.when) return true; try { return a.when() !== false; } catch (e) { a.scope.report(e); return false; } }
function paintActions() {
  const have = bar.querySelectorAll('.fa');
  if (bar.hidden || !TOUCH || HOST) { if (have.length) { have.forEach(n => n.remove()); paintedSig = ''; } return; }   // the TV has no bar: registrations are only remembered
  const vis = actionItems.filter(a => a.scope.alive() && actionVisible(a)).sort((x, y) => x.order - y.order);
  const sig = vis.map(a => a.key + '|' + a.icon + '|' + actionLabel(a)).join('\n');
  if (sig === paintedSig && have.length === Math.min(vis.length, 2)) return;   // nothing changed: leave the buttons alone (a tap in progress must not vanish)
  have.forEach(n => n.remove()); paintedSig = sig;
  if (!vis.length) return;
  const btn = a => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'fa'; b.dataset.f = a.scope.id; b.dataset.fa = a.key;
    b.append(document.createTextNode(a.icon)); const sm = document.createElement('small'); sm.textContent = actionLabel(a); b.append(sm);
    b.setAttribute('aria-label', actionLabel(a) || a.key);
    b.addEventListener('click', () => { try { a.onClick(); } catch (e) { a.scope.report(e); } });
    return b;
  };
  bar.append(btn(vis[0]));
  if (vis.length > 1) {
    const rest = vis.slice(1), more = document.createElement('button'); more.type = 'button'; more.className = 'fa more'; more.dataset.fa = 'more';
    more.append(document.createTextNode('⋯')); const sm = document.createElement('small'); sm.textContent = t('fa_more'); more.append(sm); more.setAttribute('aria-label', t('fa_more'));
    more.addEventListener('click', () => openFSheet({ key: 'f-more', title: t('fa_more'), scope: coreScope, render: body => {
      for (const a of rest) {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'px-btn fa-item'; b.dataset.f = a.scope.id; b.dataset.fa = a.key; b.textContent = `${a.icon} ${actionLabel(a)}`;
        b.addEventListener('click', () => { closeFSheet(true); try { a.onClick(); } catch (e) { a.scope.report(e); } });
        body.append(b);
      }
    } }));
    bar.append(more);
  }
}

// ---- taps, keys and gestures (own listeners — the core's handlers stay untouched) ----
const TAP_SKIP = 'button, a, input, label, select, textarea, .sheet, .sheet-bg, .mctl, .mremote, .hud [data-f], .wanchor.live';
let tapDown = null;
addEventListener('pointerdown', e => { tapDown = e.isPrimary && !e.target.closest?.(TAP_SKIP) ? { x: e.clientX, y: e.clientY, id: e.pointerId } : null; }, true);
addEventListener('pointerup', e => {
  const d = tapDown; tapDown = null;
  if (!d || d.id !== e.pointerId || e.target.closest?.(TAP_SKIP)) return;
  if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) return;           // a pan, not a tap (same limit as the camera drag)
  const wx = (e.clientX - baseX + camX) / S, wy = (e.clientY - baseY + camY) / S;
  if (wx < 0 || wy < 0 || wx > W || wy > H) return;                       // the letterbox around the map
  worldTap(wx, wy);
}, true);
function worldTap(wx, wy) {
  let hit = null;                                                          // a villager whose sprite box holds the tap; of several, the one in front (lowest on screen)
  for (const v of villagers.values()) if (Math.abs(wx - v.x) <= SPRITE_W / 2 + 1 && wy >= v.y - SPRITE_H && wy <= v.y + 3 && (!hit || v.y > hit.y)) hit = v;
  let prop = null;
  for (const p of extraProps) if (p.w > 0 && p.h > 0 && wx >= p.x && wx <= p.x + p.w && wy >= p.y && wy <= p.y + p.h && p.kind) prop = p.kind;
  const info = { wx, wy, gid: hit ? hit.g.id : null };
  emit('village:tap', prop ? { ...info, prop } : info);
  for (const h of tapHooks) { if (!h.scope.alive()) continue; try { h.fn(prop ? { ...info, prop } : { ...info }); } catch (er) { h.scope.report(er); } }
}
addEventListener('keydown', e => {
  if (!keyHooks.size || e.ctrlKey || e.metaKey || e.altKey || e.target.closest?.('input, textarea')) return;
  const h = keyHooks.get((e.key || '').toLowerCase()); if (!h || !h.scope.alive()) return;
  try { h.fn(e); } catch (er) { h.scope.report(er); }
}, true);
// user-activation moments (audio unlock, Translator.create …): pointerdown, click and keydown — hooks must be cheap and safe to repeat
const gesture = e => { if (!gestureHooks.length) return; for (const h of gestureHooks) { if (!h.scope.alive()) continue; try { h.fn(e); } catch (er) { h.scope.report(er); } } };
addEventListener('pointerdown', gesture, true); addEventListener('click', gesture, true); addEventListener('keydown', gesture, true);

// ---- scenes (ctx.v.runScene): one more kind of event — same queue, same countdown overlay, same "everybody gathers" machinery as the bouquet ----
function startScene(sc) {
  if (!sc.scope.alive()) { startNext(); return; }                          // switched off while it waited in line
  if (event) { pendingEvents.push(sc); return; }
  const rand = seeded(sc.seed);
  const s = {
    key: sc.key, t: 0, count: null, rand,
    crowd(n) {                                                             // same seed + same guests → the same n villagers on the TV and on every phone
      const all = everyone().sort((a, b) => (a.g.id < b.g.id ? -1 : 1));
      for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [all[i], all[j]] = [all[j], all[i]]; }
      return all.slice(0, clamp(Number(n) | 0, 0, 60)).map(villagerApi);
    },
    formation(list, slots, face = 'down') { formation((list || []).map(h => internalOf.get(h)).filter(Boolean), slots, DIRS.includes(face) ? face : 'down'); },
    done() { ev.finished = true; },
  };
  const ev = event = { type: 'scene', key: sc.key, id: sc.id, t: 0, count: null, s, def: sc.def, scope: sc.scope, maxSec: sc.maxSec, finished: false, killed: false };
  announce('start');
  try { sc.def.start(s); } catch (e) { sc.scope.report(e); endEvent(); }
}
function updateScene(dt) {
  const ev = event;
  if (!ev.scope.alive()) { endEvent(); return; }
  ev.s.t = ev.t;
  try { ev.def.update(ev.s, dt); } catch (e) { ev.scope.report(e); endEvent(); return; }
  ev.count = ev.s.count ?? null;                                           // the countdown overlay reads event.count
  if (ev.finished || ev.t > ev.maxSec) endEvent();
}
function sceneEnded(ev) {
  if (ev.killed || !ev.scope.alive() || typeof ev.def.end !== 'function') return;
  try { ev.def.end(ev.s); } catch (e) { ev.scope.report(e); }
}

// ---- the layer for ctx.v.anchor (core-owned: data-owner, never data-f — the loader sweeps a switched-off feature's [data-f] nodes) ----
let wdom = null;
function worldDom() {
  if (!wdom) { wdom = document.createElement('div'); wdom.id = 'wdom'; wdom.dataset.owner = 'core'; stage.append(wdom); }
  return wdom;
}

// ---- the ctx.v object handed to each feature (all registrations are undone by scope.add on dispose) ----
function makeVillageApi(scope) {
  const alive = scope.alive, own = NAME_OK(scope.id);
  const checkName = (name, what) => { if (typeof name !== 'string' || !own.test(name)) throw coded('bad-name', `${what}: "${name}" must be "f-${scope.id}" or "f-${scope.id}-<x>"`); };
  const needFn = (fn, what) => { if (typeof fn !== 'function') throw coded('bad-arg', `${what}: a function is required`); };
  const addTo = (get, set, entry) => { set([...get(), entry]); const remove = () => set(get().filter(h => h !== entry)); scope.add(remove); return remove; };
  const held = new Set();                                                  // one-feature-only slots this feature holds (their cleanup is registered once)
  const take = (slot, onDispose) => {
    const release = scope.claim(slot);                                     // another feature holds it → owner-conflict (counted against this one)
    if (!held.has(slot)) { held.add(slot); scope.add(() => { onDispose(); release(); }); }
  };
  let refreshLog = [], spritesCleanup = false, sheetCleanup = false;

  const hudApi = Object.freeze({
    add(el, { zone, order = 50, phone = false } = {}) {
      if (!(el instanceof HTMLElement)) throw coded('bad-arg', 'ctx.v.hud.add: el must be an HTMLElement');
      if (!ZONES.includes(zone)) throw coded('bad-arg', 'ctx.v.hud.add: zone must be tl | tr | rm | tc');
      if (!Number.isFinite(order)) throw coded('bad-arg', 'ctx.v.hud.add: order must be a number');
      if (phone !== false && phone !== 'tl' && phone !== 'tc') throw coded('bad-arg', "ctx.v.hud.add: phone must be false | 'tl' | 'tc'");
      if (!alive()) return noop;
      const host = $('.hz-' + (TOUCH && phone ? phone : zone));
      el.dataset.f = scope.id; el.dataset.order = String(order); el.dataset.phone = phone || 'off'; el.classList.add('hz-item');
      host.insertBefore(el, [...host.children].find(c => c !== el && Number(c.dataset.order) > order) || null);
      const remove = () => el.remove(); scope.add(remove); return remove;
    },
  });

  const spotlight = Object.freeze({
    show(spec = {}) {
      if (!spec || typeof spec.key !== 'string' || !spec.key) throw coded('bad-arg', 'ctx.v.spotlight.show: key is required');
      needFn(spec.render, 'ctx.v.spotlight.show: render');
      if (!alive() || !HOST) return Promise.resolve();                      // phones have no spotlight
      const ms = clamp(Number(spec.ms) || 7000, 1500, 20000);
      return new Promise(resolve => {
        const sp = { key: spec.key, render: spec.render, ms, high: spec.priority === 'high', scope, resolve, cleanup: null, timer: 0 };
        if (sp.high) { let i = 0; while (i < spotQueue.length && spotQueue[i].high) i++; spotQueue.splice(i, 0, sp); } else spotQueue.push(sp);
        scope.add(() => { const i = spotQueue.indexOf(sp); if (i >= 0) { spotQueue.splice(i, 1); resolve(); } if (spotCur === sp) endSpot(sp, true); });   // switched off: gone at once
      });
    },
  });

  const actions = Object.freeze({
    add(spec = {}) {
      checkName(spec.key, 'ctx.v.actions.add key');
      if (typeof spec.icon !== 'string' || !spec.icon || spec.icon.length > 4) throw coded('bad-arg', 'ctx.v.actions.add: icon is a short emoji string');
      if (typeof spec.label !== 'string' && typeof spec.label !== 'function') throw coded('bad-arg', 'ctx.v.actions.add: label is a string (or a function returning one)');
      if (!Number.isFinite(spec.order)) throw coded('bad-arg', 'ctx.v.actions.add: order must be a number');
      needFn(spec.onClick, 'ctx.v.actions.add: onClick');
      if (spec.when != null) needFn(spec.when, 'ctx.v.actions.add: when');
      if (!alive()) return noop;
      if (actionItems.some(a => a.key === spec.key)) throw coded('duplicate', `action "${spec.key}" already exists`);
      const a = { key: spec.key, icon: spec.icon, label: spec.label, order: spec.order, when: spec.when || null, onClick: spec.onClick, scope };
      actionItems.push(a);
      const remove = () => { const i = actionItems.indexOf(a); if (i >= 0) actionItems.splice(i, 1); if (fsheetCur?.key === 'f-more') closeFSheet(true); paintActions(); };
      scope.add(remove); paintActions(); return remove;
    },
    refresh: () => { if (alive()) paintActions(); },
  });

  const sheetApi = Object.freeze({
    open(spec = {}) {
      checkName(spec.key, 'ctx.v.sheet.open key');
      if (typeof spec.title !== 'string') throw coded('bad-arg', 'ctx.v.sheet.open: title is required');
      needFn(spec.render, 'ctx.v.sheet.open: render');
      if (!alive()) return;
      if (!sheetCleanup) { sheetCleanup = true; scope.add(() => { if (fsheetCur?.scope === scope) closeFSheet(true); }); }
      openFSheet({ key: spec.key, title: spec.title.slice(0, 60), render: spec.render, onClose: spec.onClose, scope });
    },
    close: () => { if (fsheetCur?.scope === scope) closeFSheet(); },
  });

  const keysApi = Object.freeze({
    add(key, fn, label) {
      const k = typeof key === 'string' ? key.toLowerCase() : '';
      if (RESERVED_KEYS.has(k)) throw coded('reserved-key', `ctx.v.keys.add: "${key}" belongs to the core`);
      if (!/^[a-z0-9]$/.test(k)) throw coded('bad-arg', 'ctx.v.keys.add: key is one letter or digit');
      needFn(fn, 'ctx.v.keys.add');
      if (!label || typeof label.ko !== 'string' || typeof label.en !== 'string') throw coded('bad-arg', 'ctx.v.keys.add: label is { ko, en }');
      if (!alive()) return noop;
      if (keyHooks.has(k)) throw coded('duplicate', `key "${k}" is already taken`);
      const hook = { fn, scope }; keyHooks.set(k, hook);
      const hint = $('.start-hint'), sp = hint ? document.createElement('span') : null;   // the TV hint line lists the key
      if (sp) { sp.dataset.f = scope.id; sp.textContent = ` · ${k.toUpperCase()} ${lang === 'ko' ? label.ko : label.en}`; hint.append(sp); }
      const remove = () => { if (keyHooks.get(k) === hook) keyHooks.delete(k); sp?.remove(); };
      scope.add(remove); return remove;
    },
  });

  const fx = Object.freeze({
    heart: (x, y) => { if (alive() && isNum(x, y) && room()) heart(x, y); },
    note: (x, y) => { if (alive() && isNum(x, y) && room()) note(x, y); },
    flash: (x, y) => { if (alive() && isNum(x, y) && room()) flash(x, y); },
    sparkle: (x, y, n = 10, colors) => {
      if (!alive() || !isNum(x, y) || !room()) return;
      const m = clamp(Number.isFinite(n) ? n | 0 : 10, 1, 60);
      const cs = Array.isArray(colors) && colors.length ? colors.slice(0, 8).map(c => String(c).slice(0, 24)) : null;
      if (!cs) { sparkle(x, y, m); return; }
      for (let i = 0; i < m; i++) particles.push({ type: 'spark', x, y, vx: rnd(-30, 30), vy: rnd(-40, -5), life: rnd(0.6, 1.2), c: pick(cs) });
    },
    confetti: (x, y, n = 24) => {
      if (!alive() || !isNum(x, y) || !room()) return;
      const m = clamp(Number.isFinite(n) ? n | 0 : 24, 1, 80);
      for (let i = 0; i < m; i++) particles.push({ type: 'confetti', x: x + rnd(-6, 6), y, vx: rnd(-40, 40), vy: rnd(-90, -30), life: rnd(1.4, 2.4), c: pick(CONFETTI), w: Math.random() < 0.5 ? 2 : 1 });
    },
    fireworks: n => { if (alive()) launchFireworks(clamp(Number.isFinite(n) ? n | 0 : 6, 1, 20)); },   // ignored in quiet mode (launchFireworks)
  });

  const setCoupleSprites = (groom, bride) => {
    if (!alive()) return;
    const norm = f => {
      if (f == null) return null;
      if (typeof f !== 'object' || !f.idle) throw coded('bad-arg', 'ctx.v.setCoupleSprites: frames must look like getSprite() output (needs .idle)');
      return { ...f, blink: f.blink || f.idle, wave: f.wave || f.idle, back: f.back || f.idle };   // the bouquet toss turns the bride around: 'back' must exist
    };
    const gs = norm(groom), bs = norm(bride);
    if (gs || bs) {
      const release = scope.claim('coupleSprites');
      if (!spritesCleanup) { spritesCleanup = true; scope.add(() => { if (coupleSpritesOwner === scope.id) resetCoupleSprites(); release(); }); }
      coupleSpritesOwner = scope.id; couple[0].sprite = gs || couple[0].baseSprite; couple[1].sprite = bs || couple[1].baseSprite;
    } else if (coupleSpritesOwner === scope.id) resetCoupleSprites();
  };

  const api = {
    HOST, TOUCH, ME, W, H, TILE, Z: FROZEN_Z,
    SP: () => SP,
    state: () => ({ night, level, quiet, phase: currentPhase(), event: event ? { type: event.type, key: event.key || event.type } : null, cam: { x: camX, y: camY, w: view.w, h: view.h, S } }),
    guests: () => guests,
    allIds: () => allIds,
    villager: gid => { const v = villagers.get(String(gid)); return v ? villagerApi(v) : null; },
    villagers: () => [...villagers.values()].map(villagerApi),
    couple: () => coupleApis,
    setCoupleSprites,

    addProp(spec = {}) {
      if (!spec || !isNum(spec.x, spec.y, spec.base)) throw coded('bad-arg', 'ctx.v.addProp: x, y and base are numbers');
      if (!spec.img && typeof spec.draw !== 'function') throw coded('bad-arg', 'ctx.v.addProp: img or draw is required');
      if (!alive()) return { set: noop, remove: noop };
      const p = { x: spec.x, y: spec.y, base: spec.base, img: spec.img || null, draw: typeof spec.draw === 'function' ? spec.draw : null, kind: String(spec.kind ?? '').slice(0, 24), w: Number(spec.w) || spec.img?.width || 0, h: Number(spec.h) || spec.img?.height || 0, item: null };
      p.item = { base: p.base, draw: () => {
        wctx.save();
        try { if (p.img) wctx.drawImage(p.img, Math.round(p.x), Math.round(p.y)); else p.draw(wctx, frameTime); } catch (e) { scope.report(e); }
        wctx.restore();
      } };
      extraProps = [...extraProps, p];
      const remove = () => { extraProps = extraProps.filter(q => q !== p); };
      scope.add(remove);
      return { remove, set(patch = {}) { for (const k of ['x', 'y', 'base', 'w', 'h']) if (Number.isFinite(patch[k])) p[k] = patch[k]; p.item.base = p.base; if (patch.img) p.img = patch.img; } };
    },
    // ★ (2026-10, WP-20) a feature's DOM element pinned over a world rectangle: it lives in #wdom inside #stage, so it pans with
    // the camera and scales with the view by itself (CSS percentages — nothing runs per frame). Above the world canvas, below
    // name tags / bubbles (overlay canvas) and the HUD. interactive: taps and drags on it are not world taps / camera drags.
    anchor(el, spec = {}) {
      if (!(el instanceof HTMLElement) || el.dataset.f !== scope.id) throw coded('bad-arg', 'ctx.v.anchor: an element made with ctx.el');
      if (!spec || !isNum(spec.x, spec.y, spec.w, spec.h) || !(spec.w > 0 && spec.h > 0)) throw coded('bad-arg', 'ctx.v.anchor: x, y, w, h are world pixels (w, h > 0)');
      if (!alive()) return { set: noop, remove: noop };
      const box = { x: spec.x, y: spec.y, w: spec.w, h: spec.h };
      const place = () => Object.assign(el.style, { left: box.x / W * 100 + '%', top: box.y / H * 100 + '%', width: box.w / W * 100 + '%', height: box.h / H * 100 + '%' });
      el.classList.add('wanchor'); el.classList.toggle('live', !!spec.interactive);
      worldDom().append(el); place();
      const remove = () => el.remove();
      scope.add(remove);
      return { remove, set(patch = {}) { for (const k of ['x', 'y', 'w', 'h']) if (Number.isFinite(patch[k]) && (k === 'x' || k === 'y' || patch[k] > 0)) box[k] = patch[k]; if ('interactive' in patch) el.classList.toggle('live', !!patch.interactive); place(); } };
    },
    onUpdate(fn) { needFn(fn, 'ctx.v.onUpdate'); return alive() ? addTo(() => updHooks, a => { updHooks = a; }, { fn, scope }) : noop; },
    onDraw(fn, { layer } = {}) {
      needFn(fn, 'ctx.v.onDraw'); if (!LAYERS.includes(layer)) throw coded('bad-arg', 'ctx.v.onDraw: layer must be ground | overhead | fx');
      return alive() ? addTo(() => layerHooks[layer], a => { layerHooks[layer] = a; }, { fn, scope }) : noop;
    },
    decorate(fn) { needFn(fn, 'ctx.v.decorate'); return alive() ? addTo(() => decoHooks, a => { decoHooks = a; }, { fn, scope }) : noop; },
    onOverlay(fn, { layer } = {}) {
      needFn(fn, 'ctx.v.onOverlay'); if (!OVERLAYS.includes(layer)) throw coded('bad-arg', 'ctx.v.onOverlay: layer must be under-tags | over-tags | top');
      return alive() ? addTo(() => overlayHooks[layer], a => { overlayHooks[layer] = a; }, { fn, scope }) : noop;
    },
    onTap(fn) { needFn(fn, 'ctx.v.onTap'); return alive() ? addTo(() => tapHooks, a => { tapHooks = a; }, { fn, scope }) : noop; },
    onGesture(fn) { needFn(fn, 'ctx.v.onGesture'); return alive() ? addTo(() => gestureHooks, a => { gestureHooks = a; }, { fn, scope }) : noop; },

    fx,
    banner(text, o = {}) {
      if (typeof text !== 'string' || !text) throw coded('bad-arg', 'ctx.v.banner: text is required');
      const kind = o?.kind ?? ''; if (!KINDS.includes(kind)) throw coded('bad-arg', "ctx.v.banner: kind is '' | 'gold' | 'small'");
      if (alive()) banner(text.slice(0, 120), { ms: clamp(Number(o?.ms) || 5000, 1500, 15000), kind, priority: o?.priority === 'high' ? 'high' : '' });
    },
    toast: text => { if (alive()) toast(String(text ?? '').slice(0, 120)); },
    chime: big => { if (alive()) chime(!!big); },
    camFocus: (x, y, sec = 5) => { if (alive() && isNum(x, y)) camFocus(x, y, clamp(Number(sec) || 5, 0.5, 60)); },

    hud: hudApi, spotlight, actions, sheet: sheetApi, keys: keysApi,

    runScene(spec = {}) {
      if (!spec || typeof spec !== 'object') throw coded('bad-arg', 'ctx.v.runScene: a spec object is required');
      checkName(spec.key, 'ctx.v.runScene key');
      needFn(spec.start, 'ctx.v.runScene: start'); needFn(spec.update, 'ctx.v.runScene: update');
      if (typeof spec.seed !== 'string' && !Number.isFinite(spec.seed)) throw coded('bad-arg', 'ctx.v.runScene: seed is a string or number (same seed → same result everywhere)');
      if (spec.end != null) needFn(spec.end, 'ctx.v.runScene: end');
      if (!alive()) return;
      const sc = { type: 'scene', key: spec.key, seed: spec.seed, id: String(spec.seed), def: spec, scope, maxSec: clamp(Number(spec.maxSec) || 40, 3, 180) };
      scope.add(() => {                                                   // switched off: out of the line, and a running scene ends at once (its end() is not called — the feature is gone)
        const i = pendingEvents.indexOf(sc); if (i >= 0) pendingEvents.splice(i, 1);
        if (event?.scope === scope) { event.killed = true; endEvent(); }
      });
      if (event) pendingEvents.push(sc); else startScene(sc);
    },
    formation: (list, slots, face = 'down') => { if (alive()) formation((list || []).map(h => internalOf.get(h)).filter(Boolean), slots, DIRS.includes(face) ? face : 'down'); },
    releaseAll: () => { if (alive() && event?.type === 'scene') releaseAll(); },

    setPresence(fn) {
      needFn(fn, 'ctx.v.setPresence'); if (!alive()) return;
      take('presence', () => { if (presenceP?.scope === scope) { presenceP = null; resync(); } });
      presenceP = { fn, scope }; resync();
    },
    clearPresence() { if (alive() && presenceP?.scope === scope) { presenceP = null; resync(); } },       // the guests it held back walk in quietly (heldBack stays: they are not "new" arrivals)
    arrive(gid, { via = 'checkin' } = {}) {
      if (typeof gid !== 'string' || !gid) throw coded('bad-arg', 'ctx.v.arrive: gid is required');
      if (typeof via !== 'string' || !/^[a-z][a-z0-9-]{0,15}$/.test(via)) throw coded('bad-arg', 'ctx.v.arrive: via is a short lowercase word');
      if (alive()) arrivals.set(gid, via);
    },
    refresh() {
      if (!alive()) return;
      const now = performance.now(); refreshLog = refreshLog.filter(t0 => now - t0 < 1000);
      if (refreshLog.length >= 20) throw coded('refresh-storm', 'ctx.v.refresh() was called more than 20 times in a second');
      refreshLog.push(now); resync();
    },
    setTickerExtra(fn) { needFn(fn, 'ctx.v.setTickerExtra'); if (!alive()) return; take('tickerExtra', () => { if (tickerExtraP?.scope === scope) { tickerExtraP = null; repaintTicker(); } }); tickerExtraP = { fn, scope }; repaintTicker(); },
    setTickerPrefix(fn) { needFn(fn, 'ctx.v.setTickerPrefix'); if (!alive()) return; take('tickerPrefix', () => { if (tickerPrefixP?.scope === scope) { tickerPrefixP = null; repaintTicker(); } }); tickerPrefixP = { fn, scope }; repaintTicker(); },

    audio: () => audio,
    soundOn: () => soundOn,
  };
  return { v: Object.freeze(api) };
}

// the core's own bus subscriptions (last, so everything above is initialised before a replayed value arrives)
busOn('live', l => { setQuiet(l?.quiet === true); paintActions(); }, { replay: true });
busOn('settings', () => paintActions());

// boot — if the Firebase SDK can't be fetched (venue Wi-Fi), keep retrying instead of staying empty all night
async function connect() {
  for (let i = 0; ; i++) {
    try { return await getStore(); }
    catch (e) { console.error('store', e); if (i === 0) banner(lang === 'ko' ? '⚠️ 인터넷에 연결하는 중…' : '⚠️ Connecting…', 4000, 'small'); await new Promise(r => setTimeout(r, Math.min(30000, 3000 * (i + 1)))); }
  }
}
(async () => {
  const store = await connect();
  if (DEMO) {
    const n = parseInt(params.get('seed') || '0', 10);
    if (n > 0) { const cur = JSON.parse(localStorage.getItem('wgb_demo_guests') || '[]'); if (cur.length < n) { sampleIdx = cur.length; await addSample(n - cur.length); } }
    $('#demo-flag').hidden = false;
  }
  // v4: start the feature loader (never awaited, never throws), then wait — at most 8 s — for the settings' real first value and for gate features
  // (prereg's presence filter) so the first guest list is drawn already filtered. Non-gate features follow later without holding the village back.
  emit('lang', { lang });
  try { bootFeatures('village', { forFeature: makeVillageApi, refreshTexts }).catch(e => console.error('[features] boot failed', e)); }
  catch (e) { console.error('[features] boot failed', e); }
  await whenGateReady(8000);
  store.subscribeGuests(sync);
  if (HOST) { store.subscribeEmotes(onEmote); store.subscribeSnaps?.(onSnaps); }
  // phones start their friend subscriptions after the first guest list arrives (see onFirstSync)
  store.subscribeEvents?.(onEvent);
})();

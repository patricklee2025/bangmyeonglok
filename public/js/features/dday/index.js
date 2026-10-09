// ============================================================
//  WP-03 · ⏳ D-day 마을 (dday) — docs/v4/wp/WP-03-dday.md
//  결혼식 전(pre) 마을: 남은 날짜만큼 공사가 진행되는 소품 · 제단 앞 D-day 표지판 · TV 패널 / 폰 칩 · 하객 환영 칩.
//  데이터 없음 (마을이 이미 가진 하객 목록만). live 가 되면 페이즈 게이트가 기능을 끔 → 소품·HUD 사라짐.
// ============================================================
import D from './i18n.js';
import { CONFIG } from '../../config.js';
import { liveWindow } from '../../core/phase.js';

export const i18n = D;
export const css = true;

const DAY = 86400e3;
const RECHECK_MS = 10 * 60e3;                            // the stage may change at midnight

/** days left (ceil) and the construction stage (§3) — n ≤ 0 (a forced pre after the day) counts as "tomorrow" */
export function countdown(now = Date.now()) {
  const n = Math.ceil((liveWindow(CONFIG.schedule).start - now) / DAY);
  const stage = n > 60 ? 0 : n > 30 ? 1 : n > 7 ? 2 : n > 1 ? 3 : 4;
  return { n: Math.max(n, 1), stage, tomorrow: n <= 1 };
}

export async function setup(ctx) {
  if (ctx.page === 'village') return setupVillage(ctx);
  return setupGuest(ctx);
}

// ---------------------------------------------------------------- guest page: a small chip in the welcome slot (order 1)
function setupGuest(ctx) {
  const g = ctx.guest;
  if (!g?.welcome) return;
  const chip = ctx.el('div', { cls: 'f-dday-welcome' });
  const paint = () => { const c = countdown(); chip.textContent = c.tomorrow ? ctx.t('dday_welcome_tomorrow') : ctx.t('dday_welcome', { n: c.n }); };
  paint();
  g.welcome.add(chip, { order: 1 });
  ctx.every(RECHECK_MS, paint);
  ctx.bus.on('lang', paint, { replay: true });           // sticky: also repaints right away through a guarded callback
}

// ---------------------------------------------------------------- village
const DOW = { ko: ['일', '월', '화', '수', '목', '금', '토'], en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] };
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function weddingDate(lang) {
  const [y, m, d] = CONFIG.schedule.weddingDate.split('-').map(Number), dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return lang === 'en' ? `${DOW.en[dow]}, ${MON[m - 1]} ${d}, ${y}` : `${y}.${String(m).padStart(2, '0')}.${String(d).padStart(2, '0')} (${DOW.ko[dow]})`;
}

// prop spots in world pixels — on the edges of paths and lawns, never on a walking tile (scene.js PATH) — 05 §5 colors
const SPOT = {
  sign: { x: 178, y: 64, w: 34, h: 24 },                 // D-day board, left in front of the altar (clear of the vase and the pine)
  wip: { x: 100, y: 64, w: 38, h: 22 },                  // "under construction" board in the yard, east of the hanok door step
  scafL: { x: 192, y: 18, w: 16, h: 40 }, scafR: { x: 290, y: 18, w: 16, h: 40 },
  crates: [{ x: 22, y: 68 }, { x: 36, y: 72 }, { x: 142, y: 68 }],   // yard corners, above the lantern posts
  ladder: { x: 280, y: 30, w: 10, h: 32 },
  pots: [{ x: 212, y: 74 }, { x: 212, y: 100 }, { x: 274, y: 74 }, { x: 274, y: 100 }],   // just outside the carpet (x 224–272)
  ready: { x: 122, y: 118, w: 60, h: 18 },               // "see you tomorrow" banner on the plaza's west edge
};
const WOOD = '#b98a5c', WOOD_D = '#8c6236', INK = '#2b2033', STEEL = '#8a8f9c', STEEL_D = '#5a5f6c';

const drawBoard = (x, y, w, h) => g => {             // a plank board on a post
  g.fillStyle = WOOD_D; g.fillRect(x + w / 2 - 1, y + h - 8, 3, 8);
  g.fillStyle = INK; g.fillRect(x, y, w, h - 7);
  g.fillStyle = WOOD; g.fillRect(x + 1, y + 1, w - 2, h - 9);
  g.fillStyle = '#d2a879'; g.fillRect(x + 1, y + 1, w - 2, 2);
};
const drawScaffold = (x, y, w, h) => g => {
  g.fillStyle = STEEL_D; g.fillRect(x, y, 2, h); g.fillRect(x + w - 2, y, 2, h);
  g.fillStyle = STEEL; for (let yy = y + 4; yy < y + h; yy += 12) g.fillRect(x, yy, w, 2);
  g.fillStyle = WOOD; g.fillRect(x - 2, y + 10, w + 4, 3); g.fillRect(x - 2, y + 28, w + 4, 3);
  g.fillStyle = STEEL_D; for (let yy = y + 6; yy < y + h - 6; yy += 12) { g.fillRect(x + 3, yy + 2, 2, 2); g.fillRect(x + 6, yy + 5, 2, 2); g.fillRect(x + 9, yy + 8, 2, 2); }
};
const drawCrate = (x, y) => g => {
  g.fillStyle = INK; g.fillRect(x, y, 12, 10);
  g.fillStyle = '#c9a36a'; g.fillRect(x + 1, y + 1, 10, 8);
  g.fillStyle = WOOD_D; g.fillRect(x + 1, y + 4, 10, 1); g.fillRect(x + 5, y + 1, 1, 8);
};
const drawLadder = (x, y, w, h) => g => {
  g.fillStyle = WOOD_D; g.fillRect(x, y, 2, h); g.fillRect(x + w - 2, y, 2, h);
  g.fillStyle = WOOD; for (let yy = y + 3; yy < y + h; yy += 5) g.fillRect(x + 2, yy, w - 4, 2);
};
const drawPot = (x, y) => g => {
  g.fillStyle = '#5e9a46'; g.fillRect(x + 1, y - 6, 8, 6); g.fillStyle = '#e66b8f'; g.fillRect(x + 2, y - 8, 2, 2); g.fillRect(x + 6, y - 7, 2, 2);
  g.fillStyle = INK; g.fillRect(x, y, 10, 8); g.fillStyle = '#c4614a'; g.fillRect(x + 1, y + 1, 8, 6);
};
const drawBanner = (x, y, w, h) => g => {
  g.fillStyle = WOOD_D; g.fillRect(x, y, 2, h + 6); g.fillRect(x + w - 2, y, 2, h + 6);
  g.fillStyle = INK; g.fillRect(x + 2, y + 1, w - 4, h - 2);
  g.fillStyle = '#ffd6e4'; g.fillRect(x + 3, y + 2, w - 6, h - 4);
};
const PENNANT = ['#e66b8f', '#4f6fd1', '#f2c94c', '#5e9a46'];

function setupVillage(ctx) {
  const v = ctx.v;
  if (!v?.addProp || !v?.hud) return;                    // a page without the world (the loader's test page)
  let cur = countdown(), props = [], residents = v.guests().length;

  // ---- HUD: TV panel (tl) · phone chip (tc) ----
  const big = ctx.el('b', { cls: 'f-dday-big' }), date = ctx.el('span', { cls: 'f-dday-date' }), res = ctx.el('span', { cls: 'f-dday-res' });
  const title = ctx.el('span', { cls: 'f-dday-title' });
  const panel = ctx.el('div', { cls: 'f-dday-panel', kids: [title, big, date, res] });
  const chip = ctx.el('div', { cls: 'f-dday-chip', attrs: { role: 'status' } });
  if (v.TOUCH) v.hud.add(chip, { zone: 'tc', order: 10, phone: 'tc' });   // phone: one line between the level panel and ⛶
  else v.hud.add(panel, { zone: 'tl', order: 10, phone: false });           // TV · laptop: the panel under the level panel
  const hudEl = v.TOUCH ? chip : panel;
  const paintHud = () => {
    const lang = ctx.lang();
    title.textContent = ctx.t('dday_hud_title');
    big.textContent = cur.tomorrow ? ctx.t('dday_tomorrow') : ctx.t('dday_count', { n: cur.n });
    big.classList.toggle('f-dday-small', cur.tomorrow);
    date.textContent = weddingDate(lang);
    res.textContent = ctx.t('dday_residents', { n: residents });
    chip.textContent = cur.tomorrow ? ctx.t('dday_chip_tomorrow', { r: residents }) : ctx.t('dday_chip', { n: cur.n, r: residents });
    hudEl.dataset.stage = String(cur.stage); hudEl.dataset.n = String(cur.n);   // what QA (and tests) can read: the stage on screen
  };

  // ---- the construction set for this stage ----
  let kinds = [];
  const add = (kind, spec, draw) => { kinds.push(kind); props.push(v.addProp({ ...spec, base: spec.y + spec.h, kind: 'dday-' + kind, draw })); };
  function build() {
    for (const p of props) p.remove();
    props = []; kinds = [];
    const s = cur.stage, S = SPOT;
    add('sign', S.sign, drawBoard(S.sign.x, S.sign.y, S.sign.w, S.sign.h));
    if (s <= 1) add('wip', S.wip, drawBoard(S.wip.x, S.wip.y, S.wip.w, S.wip.h));
    if (s === 0) add('scaffold', S.scafL, drawScaffold(S.scafL.x, S.scafL.y, S.scafL.w, S.scafL.h));
    if (s <= 1) add('scaffold', S.scafR, drawScaffold(S.scafR.x, S.scafR.y, S.scafR.w, S.scafR.h));
    const crates = s === 0 ? 3 : s === 1 ? 2 : s === 2 ? 1 : 0;
    S.crates.slice(0, crates).forEach(c => add('crate', { x: c.x, y: c.y, w: 12, h: 10 }, drawCrate(c.x, c.y)));
    if (s === 1) add('ladder', S.ladder, drawLadder(S.ladder.x, S.ladder.y, S.ladder.w, S.ladder.h));
    if (s >= 3) S.pots.forEach(p => add('pot', { x: p.x, y: p.y - 8, w: 10, h: 16 }, drawPot(p.x, p.y)));
    if (s >= 4) add('banner', S.ready, drawBanner(S.ready.x, S.ready.y, S.ready.w, S.ready.h));
    if (s >= 2) kinds.push('pennants');
    hudEl.dataset.props = kinds.join(' ');
    labels.sign = cur.tomorrow ? ctx.t('dday_banner_ready') : ctx.t('dday_count', { n: cur.n });
    labels.wip = ctx.t('dday_sign_wip');
    labels.ready = ctx.t('dday_banner_ready');
  }

  // ---- words on the boards: overlay canvas (no text on the world canvas — 05 §5). Strings are made on stage change, not per frame ----
  const labels = { sign: '', wip: '', ready: '' };
  let font = '', fontFs = 0, small = '', smallFs = 0;
  v.onOverlay((o, t) => {
    if (fontFs !== t.fs) { fontFs = t.fs; font = `bold ${t.fs}px Galmuri11, sans-serif`; }
    const sfs = Math.max(11, Math.round(t.fs * 0.8 / 11) * 11) || 11;
    if (smallFs !== sfs) { smallFs = sfs; small = `bold ${sfs}px Galmuri11, sans-serif`; }
    o.textAlign = 'center'; o.textBaseline = 'middle';
    const S = SPOT;
    o.font = labels.sign.length > 5 ? small : font; o.fillStyle = INK;   // "내일 만나요" on the small board: the smaller size
    o.fillText(labels.sign, t.X(S.sign.x + S.sign.w / 2), t.Y(S.sign.y + (S.sign.h - 7) / 2));
    if (cur.stage <= 1) { o.font = small; o.fillText(labels.wip, t.X(S.wip.x + S.wip.w / 2), t.Y(S.wip.y + (S.wip.h - 7) / 2)); }
    if (cur.stage >= 4) { o.font = font; o.fillStyle = '#c45a86'; o.fillText(labels.ready, t.X(S.ready.x + S.ready.w / 2), t.Y(S.ready.y + S.ready.h / 2)); }
  }, { layer: 'under-tags' });

  // ---- pennant string over the plaza (stage ≥ 2) — overhead layer, nothing allocated per frame ----
  v.onDraw((g, info) => {
    if (cur.stage < 2) return;
    const x0 = 112, x1 = 240, y0 = 146;
    g.fillStyle = '#5a4d63';
    for (let x = x0; x <= x1; x += 2) { const sag = Math.round(6 * Math.sin(Math.PI * (x - x0) / (x1 - x0))); g.fillRect(x, y0 + sag, 2, 1); }
    for (let i = 0, x = x0 + 4; x < x1 - 4; x += 9, i++) {
      const sag = Math.round(6 * Math.sin(Math.PI * (x - x0) / (x1 - x0))), wave = Math.sin(info.time * 3 + i) > 0.6 ? 1 : 0;
      g.fillStyle = PENNANT[i % 4]; g.fillRect(x, y0 + sag + 1, 5, 2); g.fillRect(x + 1, y0 + sag + 3, 3, 2 + wave); g.fillRect(x + 2, y0 + sag + 5 + wave, 1, 1);
    }
  }, { layer: 'overhead' });

  const recompute = () => {
    const next = countdown();
    const changed = next.stage !== cur.stage || next.n !== cur.n || next.tomorrow !== cur.tomorrow;
    cur = next;
    if (changed) build();
    paintHud();
  };
  build(); paintHud();
  ctx.every(RECHECK_MS, recompute);
  ctx.bus.on('village:guests', p => { residents = p?.list?.length ?? v.guests().length; paintHud(); }, { replay: true });
  ctx.bus.on('lang', () => { build(); paintHud(); });
}

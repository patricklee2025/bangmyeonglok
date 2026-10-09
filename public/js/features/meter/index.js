// ============================================================
//  WP-08 · 🌡 마음 온도계 (meter) — docs/v4/wp/WP-08-meter.md
//  하객들의 축하가 모일수록 TV 온도계가 36.5℃ → 100℃. 이정표 50·70·85·100℃ 에서 배너 · 하트 · (100℃) 불꽃.
//  TV(HOST)만 셉니다: 하객 수 · 스냅 수 · 리모컨 반응(부팅 1회 합계 + 이후 이모트) · bingo 줄 합 · votes 문서 수. 폰은 아무것도 안 함.
//  관리자: ⚙️ 설정 섹션만 (예상 하객 수 · 목표 점수).
// ============================================================
import D from './i18n.js';
import { MILESTONES, targetOf, scoreOf, tempOf, fmt } from './shared.js';

export const i18n = D;
export const css = true;

export async function setup(ctx) {
  if (ctx.page === 'admin') return setupAdmin(ctx);
  if (ctx.page === 'village') return setupTv(ctx);
}

// ---------------------------------------------------------------- TV
const CW = 24, CH = 112;                                   // canvas pixels = the 12 × 56 world-pixel thermometer at 2×
const SETTLE_MS = 10000;                                   // boot = until the four counts arrived (or 10 s): what is true by then is not "news"

function setupTv(ctx) {
  const v = ctx.v;
  if (!v?.HOST || !v.hud) return;                          // phones never count (they follow only some guests) — nothing subscribed
  const n = { guests: 0, snaps: 0, emotes: 0, lines: 0, votes: 0 };
  let target = targetOf(ctx.cfg()), shown = 36.5, goal = 36.5, pct = 0, blink = false, settled = false, anim = null;
  const reached = new Set();                               // milestones already crossed (this session) — never celebrated twice
  const ready = { guests: false, pulse: false, bingo: false, votes: false };   // guests too: with the prereg attendance gate the village's first list comes late

  const title = ctx.el('b', { cls: 'f-meter-title' });
  const canvas = ctx.el('canvas', { cls: 'f-meter-glass', attrs: { width: String(CW), height: String(CH), role: 'img' } });
  const value = ctx.el('b', { cls: 'f-meter-value', attrs: { 'aria-live': 'polite' } });
  const panel = ctx.el('div', { cls: 'f-meter-panel', kids: [title, canvas, value] });
  v.hud.add(panel, { zone: 'tr', order: 10 });
  const g = canvas.getContext('2d');

  function draw() {                                        // only when the value changes (and the 100 % blink) — never per frame
    const p = Math.min(1, Math.max(0, (shown - 36.5) / 63.5));
    g.clearRect(0, 0, CW, CH);
    g.fillStyle = '#2b2033'; g.fillRect(6, 0, 12, 92); g.fillRect(2, 86, 20, 24); g.fillRect(4, 84, 16, 28);          // glass outline (tube + bulb)
    g.fillStyle = '#f4f1ea'; g.fillRect(8, 2, 8, 88); g.fillRect(4, 88, 16, 20); g.fillRect(6, 86, 12, 24);           // glass
    const merc = p >= 1 && blink ? '#ff8f6b' : '#e8463c';
    const top = Math.round(88 - p * 84);
    g.fillStyle = merc; g.fillRect(10, top, 4, 90 - top); g.fillRect(6, 90, 12, 16); g.fillRect(8, 88, 8, 20);            // mercury
    g.fillStyle = '#2b2033'; for (const m of MILESTONES) { const y = Math.round(88 - ((m - 36.5) / 63.5) * 84); g.fillRect(18, y, 4, 2); }   // ticks
    g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect(9, 4, 1, 80);                                                    // shine
    value.textContent = ctx.t('meter_value', { t: fmt(shown) });
    canvas.setAttribute('aria-label', `${ctx.t('meter_title')} ${value.textContent}`);
    panel.dataset.temp = fmt(goal); panel.dataset.score = String(scoreOf(n)); panel.dataset.target = String(target);
  }

  // 0.6 s steps toward the new value (6 steps) — the number follows
  function animateTo(t) {
    goal = t;
    if (anim) { anim(); anim = null; }
    const from = shown, steps = 6;
    let k = 0;
    anim = ctx.every(100, () => {
      k++; shown = k >= steps ? goal : from + (goal - from) * (k / steps); draw();
      if (k >= steps && anim) { anim(); anim = null; }
    });
  }

  function recompute() {
    const r = tempOf(scoreOf(n), target);
    pct = r.pct;
    if (Math.abs(r.temp - goal) > 1e-9) animateTo(r.temp); else draw();
    for (const m of MILESTONES) {
      if (r.temp + 1e-9 < m || reached.has(m)) continue;
      reached.add(m);
      if (settled) celebrate(m);
    }
  }
  function celebrate(m) {
    v.banner(m >= 100 ? ctx.t('meter_boil') : ctx.t('meter_milestone', { t: m }), { kind: 'gold', priority: 'high' });
    for (let i = 0; i < 8; i++) v.fx.heart(430 + (i % 4) * 8 - 12, 60 + Math.floor(i / 4) * 10 + (i % 2) * 4);
    if (m >= 100) v.fx.fireworks(8);
    ctx.bus.emit('meter:milestone', { temp: m, pct });
  }
  const settle = () => { if (!settled && (Object.values(ready).every(Boolean))) settled = true; };
  ctx.after(SETTLE_MS, () => { settled = true; });

  // ---- the five counts
  ctx.bus.on('village:guests', p => { n.guests = p?.list?.length ?? 0; ready.guests = true; recompute(); settle(); }, { replay: true });
  ctx.bus.on('village:snaps', p => { n.snaps = Number(p?.count) || 0; recompute(); }, { replay: true });
  ctx.bus.on('village:emote', () => { n.emotes++; recompute(); });
  ctx.store().then(s => s.getPulseCounts()).then(ctx.guard(counts => {
    n.emotes += Object.values(counts || {}).reduce((a, b) => a + (Number(b) || 0), 0);
    ready.pulse = true; recompute(); settle();
  }), ctx.guard(e => { ctx.log('pulse', e?.code || e); ready.pulse = true; settle(); }));
  ctx.db.col('bingo').watch(docs => {
    n.lines = docs.reduce((a, d) => a + (Number.isInteger(d.lines) ? d.lines : 0), 0);
    ready.bingo = true; recompute(); settle();
  }, e => { ctx.log('bingo', e?.code || e); ready.bingo = true; settle(); });
  ctx.db.col('votes').watch(docs => { n.votes = docs.length; ready.votes = true; recompute(); settle(); }, e => { ctx.log('votes', e?.code || e); ready.votes = true; settle(); });

  ctx.onSettings(() => { const t = targetOf(ctx.cfg()); if (t !== target) { target = t; recompute(); } });
  ctx.every(1000, () => { if (pct >= 1) { blink = !blink; draw(); } else if (blink) { blink = false; draw(); } });
  const relabel = () => { title.textContent = ctx.t('meter_title'); draw(); };
  ctx.bus.on('lang', relabel);
  relabel();
}

// ---------------------------------------------------------------- admin: ⚙️ settings section only
function setupAdmin(ctx) {
  const A = ctx.admin;
  if (!A?.settings) return;
  A.settings.add({ render(box) {
    const c = ctx.cfg();
    const exp = ctx.el('input', { cls: 'input f-meter-exp', attrs: { type: 'number', min: '1', max: '500', step: '1', inputmode: 'numeric' } });
    const tgt = ctx.el('input', { cls: 'input f-meter-tgt', attrs: { type: 'number', min: '1', step: '1', inputmode: 'numeric' } });
    exp.value = Number(c.expected) > 0 ? String(c.expected) : '50';
    tgt.value = Number(c.target) > 0 ? String(c.target) : '';
    const now = ctx.el('p', { cls: 'f-meter-now', attrs: { role: 'status' } });
    const out = ctx.el('span', { cls: 'tip f-meter-msg', attrs: { role: 'status' } });
    const read = () => ({ expected: Math.max(1, Math.round(Number(exp.value) || 50)), target: Number(tgt.value) > 0 ? Math.round(Number(tgt.value)) : null });
    const paint = () => { now.textContent = ctx.t('meter_cfg_now', { n: targetOf(read()) }); };
    ctx.listen(exp, 'input', paint); ctx.listen(tgt, 'input', paint);
    const save = ctx.el('button', { cls: 'px-btn small f-meter-save', text: ctx.t('meter_cfg_save'), attrs: { type: 'button' }, on: { click: () => {
      save.disabled = true; out.textContent = '';
      A.saveCfg(read()).then(ctx.guard(() => { out.textContent = ctx.t('meter_cfg_saved'); }), ctx.guard(e => { out.textContent = ctx.t('meter_cfg_fail', { e: e?.code || '?' }); }))
        .finally(() => { save.disabled = false; });
    } } });
    box.append(
      ctx.el('label', { cls: 'f-meter-field', kids: [ctx.el('span', { text: ctx.t('meter_cfg_expected') }), exp] }),
      ctx.el('label', { cls: 'f-meter-field', kids: [ctx.el('span', { text: ctx.t('meter_cfg_target') }), tgt] }),
      now, ctx.el('p', { cls: 'tip f-meter-formula', text: ctx.t('meter_cfg_formula') }),
      ctx.el('div', { cls: 'f-meter-row', kids: [save, out] }),
    );
    paint();
  } });
}

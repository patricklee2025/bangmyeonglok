// ============================================================
//  WP-06 · 🌐 덕담 자동 번역 (translate) — docs/v4/wp/WP-06-translate.md
//  TV 티커 둘째 줄에 한국어 덕담 → 영어 / 영어 덕담 → 한국어. 외부 API 없이 브라우저 내장 번역 + 관리자 저장본(translations/{gid}).
//  TV: 저장본(원문이 지금 메시지와 같을 때) → 없으면 TV 엔진으로 즉석 번역(메모리, 쓰기 없음) → 엔진 없으면 줄 없음.
//  관리자 탭 "🌐 번역"(order 65): 표 · 모두 채우기 · 직접 수정 · 자동 번역 · ⚙️ TV 줄 끄기 · 백업.
// ============================================================
import D from './i18n.js';
import { makeEngine } from './engine.js';
import { sourceOf, clip, savedFor, statusOf } from './shared.js';

export const i18n = D;
export const css = true;

export async function setup(ctx) {
  if (ctx.page === 'admin') return setupAdmin(ctx);
  if (ctx.page === 'village') return setupTv(ctx);
}

// ---------------------------------------------------------------- TV
function setupTv(ctx) {
  const v = ctx.v;
  if (!v?.HOST || !v.setTickerExtra) return;              // the ticker's second line is a TV thing
  const docs = new Map(), memo = new Map(), pending = new Set();
  let hinted = false;
  const engine = makeEngine({ onState: s => { if (s === 'ready') repaint(); } });
  const on = () => ctx.cfg().tv !== false;
  const line = t => (t ? ctx.t('translate_line', { text: clip(t) }) : null);

  function provider(g) {
    if (!on()) return null;
    const s = sourceOf(g);
    if (!s) return null;
    const saved = savedFor(docs.get(g.id), s);
    if (saved) return saved === s.text ? null : line(saved);
    const key = s.src + '|' + s.text;
    if (memo.has(key)) { const t = memo.get(key); return t && t !== s.text ? line(t) : null; }
    if (engine.can(s.src, s.dst) && !pending.has(key)) {
      pending.add(key);
      engine.translate(s.text, s.src, s.dst).then(t => {        // errors / timeouts stay quiet (no breaker trips) — 02 §7 of the WP
        pending.delete(key); memo.set(key, t ? clip(t) : null);
        if (t) repaint();
      });
    }
    return null;
  }
  const repaint = () => { if (ctx.cfg().tv !== false) v.setTickerExtra(ctx.guard(provider)); };
  v.setTickerExtra(ctx.guard(provider));

  ctx.db.col('translations').watch(list => {
    docs.clear(); for (const d of list) docs.set(String(d.id), d);
    repaint();
  }, e => ctx.log('translations', e?.code || e));
  engine.check().then(ctx.guard(st => {
    if (st === 'need-click' && !hinted) { hinted = true; v.banner(ctx.t('translate_tv_hint'), { kind: 'small' }); }
  }));
  v.onGesture(() => { if (engine.state() === 'need-click') engine.start(); });
  ctx.onSettings(() => repaint());
}

// ---------------------------------------------------------------- admin
function setupAdmin(ctx) {
  const A = ctx.admin;
  if (!A?.tabs) return;
  const docs = new Map();
  let filter = false, auto = false, busy = false, seen = null;
  const engine = makeEngine({ onState: () => paintEngine() });

  const engineLine = ctx.el('p', { cls: 'f-translate-engine', attrs: { role: 'status' } });
  const startBtn = ctx.el('button', { cls: 'px-btn small f-translate-start', attrs: { type: 'button', hidden: '' }, on: { click: () => engine.start() } });
  const fill = ctx.el('button', { cls: 'px-btn small f-translate-fill', attrs: { type: 'button' }, on: { click: () => fillAll() } });
  const progress = ctx.el('span', { cls: 'tip f-translate-progress', attrs: { role: 'status' } });
  const filt = ctx.el('input', { cls: 'f-translate-filter', attrs: { type: 'checkbox' } });
  const autoBox = ctx.el('input', { cls: 'f-translate-autobox', attrs: { type: 'checkbox' } });
  const filtLabel = ctx.el('span'), autoLabel = ctx.el('span');
  const list = ctx.el('div', { cls: 'f-translate-list' });
  ctx.listen(filt, 'change', () => { filter = filt.checked; paint(); });
  ctx.listen(autoBox, 'change', () => { auto = autoBox.checked; if (auto) autoNew(); });

  A.tabs.add({
    key: 'f-translate', label: () => ctx.t('translate_tab'), order: 65,
    render: s => s.append(
      ctx.el('div', { cls: 'f-translate-top', kids: [engineLine, startBtn] }),
      ctx.el('div', { cls: 'f-translate-bar', kids: [fill, progress] }),
      ctx.el('label', { cls: 'f-translate-check', kids: [filt, filtLabel] }),
      ctx.el('label', { cls: 'f-translate-check', kids: [autoBox, autoLabel] }),
      list,
    ),
    onShow: () => paint(),
  });

  function paintEngine() {
    const st = engine.state();
    engineLine.textContent = st === 'none' ? ctx.t('translate_unsupported') : st === 'need-click' ? ctx.t('translate_need_click') : st === 'downloading' ? ctx.t('translate_downloading', { p: engine.pct() }) : st === 'ready' ? ctx.t('translate_ready') : '…';
    engineLine.dataset.state = st;
    startBtn.hidden = st !== 'need-click'; startBtn.textContent = ctx.t('translate_start');
    fill.disabled = busy || st !== 'ready';
  }

  const rowsOf = () => A.guests().filter(g => !g.hidden).map(g => ({ g, s: sourceOf(g) })).filter(r => r.s);
  function paint() {
    paintEngine();
    fill.textContent = ctx.t('translate_fill'); filtLabel.textContent = ctx.t('translate_filter'); autoLabel.textContent = ctx.t('translate_auto');
    const rows = rowsOf().filter(r => !filter || ['none', 'stale'].includes(statusOf(docs.get(r.g.id), r.s)));
    list.replaceChildren(...rows.map(({ g, s }) => row(g, s)));
  }
  const ST_KEY = { none: 'translate_st_none', stale: 'translate_st_stale', chrome: 'translate_st_chrome', manual: 'translate_st_manual' };
  function row(g, s) {
    const d = docs.get(g.id), st = statusOf(d, s);
    const ta = ctx.el('textarea', { cls: 'input f-translate-ta', attrs: { rows: '2', maxlength: '600', 'aria-label': `${g.name} → ${s.dst.toUpperCase()}` } });
    ta.value = st === 'none' ? '' : String(d?.[s.dst] ?? '');
    const out = ctx.el('span', { cls: 'tip f-translate-out' });
    const save = ctx.el('button', { cls: 'px-btn small f-translate-save', text: ctx.t('translate_save'), attrs: { type: 'button', 'data-gid': g.id }, on: { click: () => {
      const t = ta.value.trim();
      if (!t) return;
      write(g.id, s, t, 'manual').then(ctx.guard(() => { out.textContent = ctx.t('translate_st_saved'); }), ctx.guard(e => { out.textContent = ctx.t('translate_fail', { e: e?.code || '?' }); }));
    } } });
    return ctx.el('div', { cls: 'px-box f-translate-row', attrs: { 'data-gid': g.id, 'data-st': st }, kids: [
      ctx.el('div', { cls: 'f-translate-head', kids: [ctx.el('b', { text: g.name }), ctx.el('span', { cls: 'f-translate-lang', text: `${s.src.toUpperCase()} → ${s.dst.toUpperCase()}` }), ctx.el('span', { cls: 'f-translate-st f-translate-st-' + st, text: ctx.t(ST_KEY[st]) })] }),
      ctx.el('p', { cls: 'f-translate-src', text: s.text }),
      ta, ctx.el('div', { cls: 'f-translate-actions', kids: [save, out] }),
    ] });
  }
  const write = (gid, s, translation, engineName) => ctx.db.doc('translations/' + gid).set({ src: s.src, [s.src]: clip(s.text), [s.dst]: clip(translation), engine: engineName, updatedAt: ctx.db.ts() });

  // "🤖 fill in all missing": no saved translation, or a stale automatic one (a manual one is never overwritten)
  async function fillAll(only) {
    if (busy || engine.state() !== 'ready') return;
    const todo = (only || rowsOf()).filter(({ g, s }) => { const st = statusOf(docs.get(g.id), s); return st === 'none' || (st === 'stale' && docs.get(g.id)?.engine !== 'manual'); });
    if (!todo.length) return;
    busy = true; paintEngine();
    let done = 0;
    for (const { g, s } of todo) {
      progress.textContent = ctx.t('translate_progress', { done, total: todo.length });
      const t = await engine.translate(s.text, s.src, s.dst);
      if (t && t.trim() && t.trim() !== s.text) { try { await write(g.id, s, t, 'chrome'); } catch (e) { ctx.log('save', e?.code || e); } }
      done++;
    }
    progress.textContent = ctx.t('translate_progress', { done, total: todo.length });
    busy = false; paintEngine();
  }
  // auto: new guests while this page is open → translated and saved right away
  function autoNew() {
    const ids = new Set(A.guests().map(g => g.id));
    if (!seen) { seen = ids; return; }
    const fresh = rowsOf().filter(r => !seen.has(r.g.id));
    seen = ids;
    if (auto && fresh.length) fillAll(fresh);
  }

  ctx.db.col('translations').watch(l => { docs.clear(); for (const d of l) docs.set(String(d.id), d); paint(); }, e => ctx.log('translations', e?.code || e));
  ctx.bus.on('admin:guests', () => { autoNew(); paint(); }, { replay: true });
  ctx.bus.on('lang', paint);
  engine.check();

  // ⚙️ settings: the TV line on/off
  A.settings.add({ render(box) {
    const cb = ctx.el('input', { attrs: { type: 'checkbox' } }); cb.checked = ctx.cfg().tv !== false;
    const out = ctx.el('span', { cls: 'tip' });
    ctx.listen(cb, 'change', () => { A.saveCfg({ tv: cb.checked }).then(ctx.guard(() => { out.textContent = ctx.t('translate_st_saved'); }), ctx.guard(e => { out.textContent = ctx.t('translate_fail', { e: e?.code || '?' }); })); });
    box.append(ctx.el('label', { cls: 'f-translate-check f-translate-cfgtv', kids: [cb, ctx.el('span', { text: ctx.t('translate_cfg_tv') })] }), out);
  } });

  A.backup.add('f-translate/translations.json', async zip => {
    zip.file('f-translate/translations.json', JSON.stringify(await ctx.db.col('translations').get(), null, 2));
  });
}

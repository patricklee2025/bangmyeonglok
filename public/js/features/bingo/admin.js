// ============================================================
//  WP-09 S9 — 관리자 탭 "🎯 빙고"(order 60): 순위 전체 · 미션별 완료 수 · 미션 끄기(cfg.bingo.off — 행사 전에만) · 기록 삭제 · 백업
// ============================================================
import { MISSIONS, FULL, MIN_ON } from './missions.js';
import { offList, SIDES } from './shared.js';

export function setupAdmin(ctx) {
  const A = ctx.admin;
  if (!A?.tabs) return;
  let docs = [], armed = new Map();
  const guests = () => A.guests();
  const nameOf = gid => guests().find(g => g.id === gid)?.name || gid;

  const rank = ctx.el('div', { cls: 'f-bingo-arank' });
  const missions = ctx.el('div', { cls: 'f-bingo-amissions' });
  const warn = ctx.el('p', { cls: 'notice f-bingo-awarn' });
  const msg = ctx.el('p', { cls: 'tip f-bingo-amsg', attrs: { role: 'status' } });
  const save = ctx.el('button', { cls: 'px-btn small f-bingo-asave', attrs: { type: 'button' }, on: { click: () => saveOff() } });
  const h1 = ctx.el('h3'), h2 = ctx.el('h3');
  const checks = new Map();                               // mission id → checkbox (off)

  A.tabs.add({
    key: 'f-bingo', label: () => ctx.t('bingo_tab'), order: 60,
    render: s => s.append(h1, rank, h2, warn, missions, ctx.el('div', { cls: 'f-bingo-arow', kids: [save, msg] })),
    onShow: () => paint(),
  });

  function paintMissions() {
    const off = new Set(offList(ctx.cfg()));
    const done = new Map(MISSIONS.map(m => [m.id, 0]));
    for (const d of docs) for (const id of (Array.isArray(d.done) ? d.done : [])) if (done.has(id)) done.set(id, done.get(id) + 1);
    const gs = guests().filter(g => !g.hidden), sides = new Set(gs.map(g => (SIDES.includes(g.side) ? g.side : 'both')));
    const impossible = id => (id === 'm0' && !sides.has('groom')) || (id === 'm1' && !sides.has('bride')) || (['m2', 'm3', 'm4'].includes(id) && gs.length < 2);
    missions.replaceChildren(...MISSIONS.map(m => {
      let cb = checks.get(m.id);
      if (!cb) { cb = ctx.el('input', { attrs: { type: 'checkbox', 'data-m': m.id } }); cb.checked = off.has(m.id); checks.set(m.id, cb); ctx.listen(cb, 'change', () => paintCount()); }
      const kids = [cb, ctx.el('span', { cls: 'f-bingo-aico', text: m.icon }), ctx.el('span', { cls: 'f-bingo-aname', text: ctx.t(FULL[m.id]) }), ctx.el('b', { cls: 'f-bingo-an', text: ctx.t('bingo_a_done_n', { n: done.get(m.id) }) })];
      if (impossible(m.id)) kids.push(ctx.el('span', { cls: 'f-bingo-azero', text: ctx.t('bingo_a_zero') }));
      return ctx.el('label', { cls: 'f-bingo-am', attrs: { 'data-m': m.id, title: ctx.t('bingo_a_off') }, kids });
    }));
    paintCount();
  }
  function paintCount() {
    const offN = [...checks.values()].filter(c => c.checked).length;
    save.disabled = MISSIONS.length - offN < MIN_ON;
    warn.textContent = save.disabled ? ctx.t('bingo_a_min') : ctx.t('bingo_off_warn');
  }
  function saveOff() {
    const off = [...checks.entries()].filter(([, c]) => c.checked).map(([id]) => id);
    if (MISSIONS.length - off.length < MIN_ON) return;
    msg.textContent = '';
    A.saveCfg({ off }).then(ctx.guard(() => { msg.textContent = ctx.t('bingo_a_saved'); }), ctx.guard(e => { msg.textContent = ctx.t('bingo_a_fail', { e: e?.code || '?' }); }));
  }

  function paintRank() {
    const rows = [...docs].sort((a, b) => (b.lines || 0) - (a.lines || 0) || (b.done?.length || 0) - (a.done?.length || 0));
    rank.replaceChildren(...(rows.length ? rows.map((d, i) => ctx.el('div', { cls: 'f-bingo-arr', attrs: { 'data-gid': d.id }, kids: [
      ctx.el('span', { cls: 'f-bingo-apos', text: String(i + 1) }),
      ctx.el('b', { cls: 'f-bingo-aname', text: nameOf(d.id) }),
      ctx.el('span', { cls: 'f-bingo-an', text: `${ctx.t('bingo_lines_n', { n: d.lines || 0 })} · ${(d.done || []).length}/16` }),
      ctx.el('button', { cls: 'px-btn small secondary f-bingo-areset', text: armed.has(d.id) ? ctx.t('bingo_a_reset_confirm') : ctx.t('bingo_a_reset'), attrs: { type: 'button', 'data-gid': d.id }, on: { click: () => reset(d.id) } }),
    ] })) : [ctx.el('p', { cls: 'tip', text: ctx.t('bingo_rank_empty') })]));
  }
  function reset(gid) {
    if (!armed.has(gid)) { armed.set(gid, ctx.after(5000, () => { armed.delete(gid); paintRank(); })); paintRank(); return; }
    armed.get(gid)(); armed.delete(gid);
    ctx.db.doc('bingo/' + gid).delete().catch(ctx.guard(e => { msg.textContent = ctx.t('bingo_a_fail', { e: e?.code || '?' }); }));
  }

  function paint() {
    h1.textContent = ctx.t('bingo_a_rank'); h2.textContent = ctx.t('bingo_a_missions'); save.textContent = ctx.t('bingo_a_save');
    paintRank(); paintMissions();
  }
  ctx.bus.on('lang', paint);
  ctx.bus.on('admin:guests', paint);
  ctx.onSettings(() => { const off = new Set(offList(ctx.cfg())); for (const [id, c] of checks) c.checked = off.has(id); paintCount(); });
  paint();
  ctx.db.col('bingo').watch(d => { docs = d; paint(); }, e => { msg.textContent = ctx.t('bingo_a_fail', { e: e?.code || '?' }); });

  A.backup.add('f-bingo/bingo.json', async zip => {
    const all = await ctx.db.col('bingo').get();
    zip.file('f-bingo/bingo.json', JSON.stringify(all.map(d => ({ gid: d.id, name: nameOf(d.id), done: d.done, lines: d.lines, updatedAt: d.updatedAt })), null, 2));
  });
}

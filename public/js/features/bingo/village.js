// ============================================================
//  WP-09 — 마을
//  TV(HOST): bingo 컬렉션 구독 1개 · 하객별 lines 기억 → 늘어난 하객마다 emit('bingo:line') (첫 스냅샷은 기억만)
//            첫 빙고 / 올빙고 high 배너 · 빙고한 주민 머리에 픽셀 왕관(decorate) · rm 존 순위(투표가 TV에 없을 때만)
//  폰(ME): 하단 바 액션 order 20 "🎯" → 시트에 같은 격자 · auto 미션 이벤트 · 줄 완성 → 배너 + bingo:line
// ============================================================
import { spriteCanvas } from '../../core/ui.js';
import { normalizeAvatar } from '../../avatar.js';
import { cardFor, offList, bingoState, guestBook } from './shared.js';
import { boardView } from './board.js';

export function setupVillage(ctx) {
  const v = ctx.v;
  if (!v?.hud) return;
  if (v.HOST) return setupTv(ctx);
  if (v.TOUCH && v.ME && v.actions) return setupPhone(ctx);
}

// ---------------------------------------------------------------- TV
// a crown: 9 × 6 world px above the head (gold with a darker rim and three points) — drawn with fillRect only, nothing allocated per frame
const CROWN = [[0, 2, 9, 4, '#8c6a12'], [1, 3, 7, 2, '#ffd75e'], [0, 0, 1, 2, '#ffd75e'], [4, 0, 1, 2, '#ffd75e'], [8, 0, 1, 2, '#ffd75e'], [4, 3, 1, 1, '#e66b8f']];

function setupTv(ctx) {
  const v = ctx.v;
  let first = true, pollOnTv = false, removeHud = null;
  const lines = new Map(), cells = new Map();            // gid → lines / done count (last seen)
  const crowned = new Set();
  const nameOf = gid => v.guests().find(g => g.id === gid)?.name || '';

  const title = ctx.el('b', { cls: 'f-bingo-rtitle' });
  const list = ctx.el('div', { cls: 'f-bingo-rlist' });
  const panel = ctx.el('div', { cls: 'f-bingo-rank', kids: [title, list] });

  function paintRank() {
    const top = [...lines.entries()].filter(([gid, n]) => n > 0 && nameOf(gid)).sort((a, b) => b[1] - a[1] || (cells.get(b[0]) || 0) - (cells.get(a[0]) || 0) || (a[0] < b[0] ? -1 : 1)).slice(0, 3);
    const show = top.length > 0 && !pollOnTv;
    if (!show) { if (removeHud) { removeHud(); removeHud = null; } return; }
    if (!removeHud) removeHud = v.hud.add(panel, { zone: 'rm', order: 20 });
    title.textContent = '🎯 ' + ctx.t('bingo_rank');
    list.replaceChildren(...top.map(([gid, n], i) => {
      const g = v.guests().find(x => x.id === gid);
      const face = spriteCanvas(normalizeAvatar(g?.avatar || {}), 'idle', 2); face.className = 'f-bingo-rface'; face.setAttribute('aria-hidden', 'true');
      return ctx.el('div', { cls: 'f-bingo-rrow', attrs: { 'data-gid': gid }, kids: [ctx.el('span', { cls: 'f-bingo-rpos', text: String(i + 1) }), face, ctx.el('span', { cls: 'f-bingo-rname', text: nameOf(gid) }), ctx.el('b', { cls: 'f-bingo-rn', text: ctx.t('bingo_lines_n', { n }) })] });
    }));
  }

  ctx.db.col('bingo').watch(docs => {
    for (const d of docs) {
      const gid = String(d.id), n = Number.isInteger(d.lines) ? d.lines : 0, prev = lines.get(gid) ?? 0;
      const all = Array.isArray(d.done) && d.done.length >= 16 && n >= 10;
      if (!first && n > prev) {
        ctx.bus.emit('bingo:line', { gid, lines: n, all });
        const name = nameOf(gid);
        if (name && all && (cells.get(gid) || 0) < 16) v.banner(ctx.t('bingo_tv_all', { name }), { kind: 'gold', priority: 'high' });
        else if (name && prev === 0) v.banner(ctx.t('bingo_tv_line', { name }), { kind: 'gold', priority: 'high' });
        v.villager(gid)?.hop();
      }
      lines.set(gid, n); cells.set(gid, Array.isArray(d.done) ? d.done.length : 0);
      if (n > 0) crowned.add(gid); else crowned.delete(gid);
    }
    const ids = new Set(docs.map(d => String(d.id)));      // a record deleted by the couple (test clean-up)
    for (const gid of [...lines.keys()]) if (!ids.has(gid)) { lines.delete(gid); cells.delete(gid); crowned.delete(gid); }
    first = false;
    paintRank();
  }, e => ctx.log('bingo watch', e?.code || e));

  v.decorate((g, vil, i) => {
    if (!crowned.has(vil.gid)) return;
    const x0 = Math.round(i.x) - 4, y0 = Math.round(i.y) - 41;
    for (let k = 0; k < CROWN.length; k++) { const c = CROWN[k]; g.fillStyle = c[4]; g.fillRect(x0 + c[0], y0 + c[1], c[2], c[3]); }
  });
  ctx.onLive(l => { pollOnTv = !!l?.poll; paintRank(); });   // the poll panel takes the rm zone while a poll is on the TV
  ctx.bus.on('village:guests', () => paintRank());
  ctx.bus.on('lang', () => paintRank());
}

// ---------------------------------------------------------------- phone
function setupPhone(ctx) {
  const v = ctx.v, gid = v.ME, book = guestBook(ctx);
  let off = offList(ctx.cfg()), view = null;
  const st = bingoState(ctx, gid, {
    cardOf: () => cardFor(gid, off),
    onChange: s => view?.paint(s),
    onLine: s => {
      const all = s.cells >= 16;
      v.banner(all ? ctx.t('bingo_all') : ctx.t('bingo_line'), { kind: 'gold', priority: 'high', ms: 2500 });
      ctx.bus.emit('bingo:line', { gid, lines: s.lines, all });
    },
  });
  v.actions.add({
    key: 'f-bingo', icon: '🎯', label: () => ctx.t('bingo_action').replace(/^🎯\s*/u, ''), order: 20,
    onClick: () => v.sheet.open({
      key: 'f-bingo', title: ctx.t('bingo_title'),
      render: body => {
        view = boardView(ctx, { gid, st, book });
        body.append(view.node);
        view.paint(st.state());
        return () => { view = null; };
      },
    }),
  });
  ctx.bus.on('snap:uploaded', p => { if (p?.gid === gid) st.addSnap(); });
  ctx.bus.on('remote:sent', p => { if (p?.gid === gid) st.mark('m6'); });
  ctx.bus.on('vote:cast', p => { if (p?.gid === gid) st.mark('m7'); });
  ctx.bus.on('lang', () => view?.relabel());
  ctx.onSettings(() => { const next = offList(ctx.cfg()); if (next.join() !== off.join()) { off = next; st.recheck(); } });
}

// ============================================================
//  WP-09 S1–S6 — 하객 폰: 허브 행(order 40) "🎯 빙고 · n줄 · d/16" → 화면 f-bingo (격자 · 미션 상세)
//  auto 미션: snap:uploaded · remote:sent · vote:cast (내 gid) → 저절로 도장 · 줄 완성 → 1.5초 축하 + bingo:line
// ============================================================
import { cardFor, offList, bingoState, guestBook } from './shared.js';
import { boardView } from './board.js';

export function setupGuest(ctx) {
  const g = ctx.guest;
  if (!g?.screens || !g?.hub) return;
  const book = guestBook(ctx);
  const states = new Map();                              // gid → bingoState (this phone may hold more than one guest)
  let off = offList(ctx.cfg()), who = null, view = null, viewGid = null;
  const cardOf = gid => () => cardFor(gid, off);

  const known = new Set();                               // guests of this phone: remembered (guest:mine) or shown on the hub
  function stateFor(gid) {
    if (!gid || !known.has(gid)) return null;
    let s = states.get(gid);
    if (!s) {
      s = bingoState(ctx, gid, {
        cardOf: cardOf(gid),
        onChange: st => { if (view && viewGid === gid) view.paint(st); g.hub.refresh(); },
        onLine: st => cheer(st),
      });
      states.set(gid, s);
    }
    return s;
  }

  // ---- the line overlay (1.5 s) + the event
  const cheerEl = ctx.el('div', { cls: 'f-bingo-cheer', attrs: { role: 'status', hidden: '' } });
  document.body.append(cheerEl);
  function cheer(st) {
    const all = st.cells >= 16;
    cheerEl.textContent = all ? ctx.t('bingo_all') : ctx.t('bingo_line');
    cheerEl.hidden = false; cheerEl.classList.remove('f-bingo-pop'); void cheerEl.offsetWidth; cheerEl.classList.add('f-bingo-pop');
    ctx.after(1500, () => { cheerEl.hidden = true; });
    ctx.bus.emit('bingo:line', { gid: st.gid, lines: st.lines, all });
  }

  // ---- the screen
  const title = ctx.el('h2'), back = ctx.el('button', { cls: 'px-btn secondary f-bingo-leave', attrs: { type: 'button' }, on: { click: () => g.back() } });
  const holder = ctx.el('div', { cls: 'f-bingo-holder' });
  const relabel = () => { title.textContent = ctx.t('bingo_title'); back.textContent = ctx.t('bingo_back'); view?.relabel(); };
  relabel();
  ctx.bus.on('lang', relabel);
  g.screens.add('f-bingo', {
    render: s => s.append(ctx.el('div', { cls: 'px-box f-bingo-top', kids: [title] }), holder, ctx.el('div', { cls: 'sticky-foot', kids: [back] })),
    onEnter: () => {
      const gid = who?.gid || g.me()?.id;
      if (!gid) { g.back(); return; }
      known.add(gid);
      const st = stateFor(gid);
      if (!view || viewGid !== gid) {
        viewGid = gid;
        view = boardView(ctx, { gid, st, book, go: { snap: () => g.openMine(), remote: () => g.openMine(), poll: () => g.back() } });
        holder.replaceChildren(view.node);
      }
      view.reset(); view.paint(st.state());
    },
  });

  // ---- the hub row: only for a remembered guest, never in simple mode (simple ✗ — the core hides it)
  g.hub.add({
    key: 'f-bingo', order: 40, size: 'row', icon: '🎯',
    title: () => { const gid = who?.gid || g.me()?.id, s = gid && states.get(gid)?.state(); return ctx.t('bingo_row', { lines: s?.lines ?? 0, done: s?.cells ?? 0 }); },
    when: w => { if (!w?.gid) return false; known.add(w.gid); stateFor(w.gid); return true; },
    onClick: w => { who = w; g.go('f-bingo'); },
  });

  // ---- auto missions (this page's events, for the guest they name)
  ctx.bus.on('snap:uploaded', p => stateFor(p?.gid)?.addSnap());
  ctx.bus.on('remote:sent', p => stateFor(p?.gid)?.mark('m6'));
  ctx.bus.on('vote:cast', p => stateFor(p?.gid)?.mark('m7'));
  ctx.bus.on('guest:mine', m => { if (m?.id) { known.add(m.id); stateFor(m.id); } }, { replay: true });

  // the couple switched missions off: cards are dealt again (done cells stay)
  ctx.onSettings(() => {
    const next = offList(ctx.cfg());
    if (next.join() === off.join()) return;
    off = next;
    for (const s of states.values()) s.recheck();
  });
}

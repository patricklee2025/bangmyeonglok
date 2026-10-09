// ============================================================
//  WP-10 S4 — 하객 폰: 완료·내 사진 화면의 허브 카드(order 50). 열린 투표 또는 발표된 결과가 있을 때만.
// ============================================================
import { followLivePoll } from './shared.js';
import { voteView, guestBook } from './vote.js';

export function setupGuest(ctx) {
  const g = ctx.guest;
  if (!g?.hub) return;                                   // kiosk / the loader's test page: no hub
  const book = guestBook(ctx);
  let poll = null;
  const views = new Map();                               // gid → view (done screen and my space may show the same guest)
  const shown = () => !!poll && (poll.open || !!poll.result);

  g.hub.add({
    key: 'f-poll', order: 50, size: 'card',
    title: () => ctx.t('poll_card_title'),
    when: () => shown(),
    render: (box, who) => {
      if (!who?.gid) return;
      let v = views.get(who.gid);
      if (!v) { v = voteView(ctx, { gid: who.gid, book, big: g.simple() }); views.set(who.gid, v); }
      box.classList.add('f-poll-card');
      box.append(v.node);                                // a node lives in one place: the newest card takes it
      v.set(shown() ? poll : null);
    },
  });

  followLivePoll(ctx, next => {
    poll = next;
    for (const v of views.values()) v.set(shown() ? poll : null);
    g.hub.refresh();
  });
  ctx.bus.on('lang', () => { for (const v of views.values()) v.relabel(); });
  ctx.bus.on('guest:reset', () => views.clear());
}

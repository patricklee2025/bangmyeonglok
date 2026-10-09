// ============================================================
//  WP-10 — 마을
//  TV(HOST): rm 존 패널 — 질문 + 막대(보기) / 상위 5명(하객 뽑기) · 총 표 수 · 새 표가 오면 막대가 자람
//            발표(open → false + result) 순간: high 배너 "🗳 결과: {1위}!" · 1위 하객 캐릭터 반짝·점프 · emit('poll:result')
//  폰(ME): 하단 바 액션 order 10 "🗳" (열린 투표가 있을 때만) → 시트에 하객 페이지와 같은 투표 화면
// ============================================================
import { spriteCanvas } from '../../core/ui.js';
import { normalizeAvatar } from '../../avatar.js';
import { followLivePoll, qText, tally, choiceRows, guestRows, topText } from './shared.js';
import { voteView, guestBook } from './vote.js';

export function setupVillage(ctx) {
  const v = ctx.v;
  if (!v?.hud) return;                                   // the loader's test page
  if (v.HOST) return setupTv(ctx);
  if (v.TOUCH && v.ME && v.actions) return setupPhone(ctx);
}

// ---------------------------------------------------------------- TV
function setupTv(ctx) {
  const v = ctx.v;
  const book = guestBook(ctx);
  let poll = null, votes = [], offVotes = null, votesFor = null, removeHud = null, revealed = new Set(), firstSeen = new Map();
  const head = ctx.el('b', { cls: 'f-poll-thead' });
  const q = ctx.el('p', { cls: 'f-poll-tq' });
  const rows = ctx.el('div', { cls: 'f-poll-trows' });
  const total = ctx.el('p', { cls: 'f-poll-ttotal' });
  const panel = ctx.el('div', { cls: 'f-poll-panel', attrs: { 'aria-live': 'polite' }, kids: [head, q, rows, total] });

  const nameOf = gid => v.guests().find(g => g.id === gid)?.name || book.nameOf(gid) || '';
  const avatarOf = gid => v.guests().find(g => g.id === gid)?.avatar || book.avatarOf(gid);

  function paint() {
    if (!poll || !(poll.open || poll.result)) { if (removeHud) { removeHud(); removeHud = null; } return; }
    if (!removeHud) removeHud = v.hud.add(panel, { zone: 'rm', order: 10 });
    const lang = ctx.lang(), res = poll.open ? tally(poll, votes) : poll.result;
    panel.classList.toggle('f-poll-isresult', !poll.open);
    panel.dataset.pid = poll.id; panel.dataset.total = String(Number(res?.total) || 0);
    head.textContent = poll.open ? ctx.t('poll_card_title') : poll.result ? ctx.t('poll_result') : ctx.t('poll_closed');
    q.textContent = qText(poll, lang);
    const kids = [];
    if (poll.kind === 'choice') {
      for (const r of choiceRows(poll, res, lang)) kids.push(row(r.label, r.n, r.pct, !poll.open && r.top, null, 'i' + r.i));
    } else {
      const list = guestRows(res, 5), max = Math.max(1, ...list.map(x => x.n));
      for (const r of list) kids.push(row(nameOf(r.gid) || '…', r.n, Math.round(100 * r.n / max), !poll.open && r.top, avatarOf(r.gid), r.gid));
      if (list.some(r => !nameOf(r.gid))) needNames();
    }
    rows.replaceChildren(...kids);
    total.textContent = ctx.t('poll_total', { n: Number(res?.total) || 0 });
  }
  function row(label, n, pct, top, avatar, key) {
    const fill = ctx.el('i', { cls: 'f-poll-fill' }); fill.style.width = pct + '%';
    const kids = [];
    if (avatar) { const f = spriteCanvas(normalizeAvatar(avatar), 'idle', 2); f.className = 'f-poll-face'; f.setAttribute('aria-hidden', 'true'); kids.push(f); }
    kids.push(ctx.el('span', { cls: 'f-poll-blabel', text: (top ? '🏆 ' : '') + label }), ctx.el('b', { cls: 'f-poll-bn', text: String(n) }), ctx.el('span', { cls: 'f-poll-track', kids: [fill] }));
    return ctx.el('div', { cls: 'f-poll-row' + (top ? ' f-poll-top' : ''), attrs: { 'data-k': key }, kids });
  }
  let namesAsked = false;
  function needNames() { if (namesAsked) return; namesAsked = true; book.get().then(ctx.guard(paint), ctx.guard(e => ctx.log('names', e?.code || e))); }

  // the votes of the poll on screen: one query listener (only while it is open — a revealed result is in the poll document)
  function followVotes() {
    const want = poll?.open ? poll.id : null;
    if (want === votesFor) return;
    if (offVotes) { offVotes(); offVotes = null; }
    votesFor = want; votes = [];
    if (!want) return;
    offVotes = ctx.db.col('votes').where('pid', '==', want).watch(docs => { if (votesFor === want) { votes = docs; paint(); } }, e => ctx.log('votes', e?.code || e));
  }

  function reveal(p) {
    const top = p.result?.top || [];
    const words = topText(p, p.result, ctx.lang(), nameOf);
    if (words) v.banner(ctx.t('poll_result_banner', { top: words }), { kind: 'gold', priority: 'high', ms: 7000 });
    if (p.kind === 'guest') for (const gid of top) { const who = v.villager(gid); if (who) { who.glow(6); who.hop(); } }
    ctx.bus.emit('poll:result', { pid: p.id, top });
  }

  followLivePoll(ctx, next => {
    const prev = poll;
    poll = next;
    // "the reveal" = this TV saw the poll without a result and now it has one (a TV opened after the reveal does not replay it)
    if (poll && !firstSeen.has(poll.id)) firstSeen.set(poll.id, !!poll.result);
    if (poll?.result && !poll.open && !revealed.has(poll.id) && firstSeen.get(poll.id) === false) {
      revealed.add(poll.id);
      if (poll.kind === 'guest' && poll.result.top?.some(g => !nameOf(g))) book.get().then(ctx.guard(() => reveal(poll)), ctx.guard(() => reveal(poll)));
      else reveal(poll);
    }
    if (prev?.id !== poll?.id) namesAsked = false;
    followVotes(); paint();
  });
  ctx.bus.on('lang', paint);
  ctx.bus.on('village:guests', () => { if (poll?.kind === 'guest') paint(); });
}

// ---------------------------------------------------------------- phone (a guest who wrote the guestbook)
function setupPhone(ctx) {
  const v = ctx.v;
  const book = guestBook(ctx);
  let poll = null, view = null;
  v.actions.add({
    key: 'f-poll', icon: '🗳', label: () => ctx.t('poll_action').replace(/^🗳\s*/u, ''), order: 10,
    when: () => !!poll?.open,
    onClick: () => v.sheet.open({
      key: 'f-poll', title: ctx.t('poll_card_title'),
      render: body => {
        view = voteView(ctx, { gid: v.ME, book });
        body.append(view.node);
        view.set(poll);
        return () => { view = null; };
      },
    }),
  });
  followLivePoll(ctx, next => {
    poll = next;
    view?.set(poll);
    v.actions.refresh();
  });
  ctx.bus.on('lang', () => view?.relabel());
}

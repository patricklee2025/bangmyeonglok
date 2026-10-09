// ============================================================
//  WP-10 투표 — 하객이 누르는 화면 (하객 페이지 허브 카드 · 폰 마을 시트가 같이 씀)
//  열린 투표: 큰 보기 버튼(보기 선택) / 이름 검색 + 아바타 목록(하객 뽑기) → 저장 → "투표 완료!" · 2초 뒤 바꾸기
//  닫힌 투표: 결과 발표 전 "투표가 끝났어요" · 발표 뒤 결과 막대 / 1위 하객
// ============================================================
import { spriteCanvas } from '../../core/ui.js';
import { normalizeAvatar } from '../../avatar.js';
import { qText, optText, norm, choiceRows, guestRows } from './shared.js';

const LOCK_MS = 2000;
const GUESTS_TTL = 5 * 60e3;
const SHOW_MAX = 30;                                    // guest poll: names listed at once (search narrows it)

/** the guest list for "pick a guest" polls — one read per 5 minutes per page (03 §7), shared by every view on the page */
export function guestBook(ctx) {
  let at = 0, list = null, pending = null;
  return {
    get() {
      if (list && Date.now() - at < GUESTS_TTL) return Promise.resolve(list);
      if (pending) return pending;
      pending = ctx.db.col('guests').get().then(docs => {
        list = docs.filter(d => !d.hidden).map(d => ({ id: String(d.id), name: String(d.name || '?').slice(0, 30), avatar: d.avatar || {} }));
        at = Date.now(); return list;
      }).finally(() => { pending = null; });
      return pending;
    },
    nameOf: gid => list?.find(g => g.id === gid)?.name || '',
    avatarOf: gid => list?.find(g => g.id === gid)?.avatar || null,
  };
}

/**
 * One voting view for guest `gid`. set(poll) whenever the shown poll changes (null = nothing to show).
 * Returns { node, set, relabel }. Everything it registers goes through ctx (released when the feature goes off).
 */
export function voteView(ctx, { gid, book, big = false }) {
  let poll = null, mine = null, mineFor = null, lockUntil = 0, sending = false, changing = false, err = '', query = '', guests = null, guestErr = false;
  const head = ctx.el('b', { cls: 'f-poll-head' });
  const q = ctx.el('p', { cls: 'f-poll-q' });
  const body = ctx.el('div', { cls: 'f-poll-body' });
  const note = ctx.el('p', { cls: 'tip f-poll-note', attrs: { role: 'status' } });
  const node = ctx.el('div', { cls: 'f-poll-view' + (big ? ' f-poll-big' : ''), kids: [head, q, body, note] });
  const search = ctx.el('input', { cls: 'input f-poll-search', attrs: { type: 'search', autocomplete: 'off' } });
  const list = ctx.el('div', { cls: 'f-poll-glist' });
  ctx.listen(search, 'input', () => { query = norm(search.value); paintGuests(); });

  const lang = () => ctx.lang();
  const locked = () => Date.now() < lockUntil;

  // my vote on this poll (one read when the poll first shows on this device)
  function loadMine() {
    if (!poll || mineFor === poll.id) return;
    const pid = mineFor = poll.id;
    ctx.db.doc(`votes/${pid}_${gid}`).get().then(ctx.guard(d => {
      if (!poll || poll.id !== pid || !d) return;
      mine = d.choice ?? null; lockUntil = (Number(d.updatedAt) || 0) + LOCK_MS; paint();
    }), ctx.guard(e => ctx.log('my vote', e?.code || e)));
  }

  function cast(choice) {
    if (!poll?.open || sending || locked()) return;
    const pid = poll.id;
    sending = true; err = ''; paint();
    ctx.db.doc(`votes/${pid}_${gid}`).set({ pid, gid, choice, updatedAt: ctx.db.ts() }).then(ctx.guard(() => {
      if (poll?.id !== pid) return;
      mine = choice; changing = false; lockUntil = Date.now() + LOCK_MS;
      ctx.bus.emit('vote:cast', { pid, gid, choice });
      ctx.after(LOCK_MS + 50, paint);
    }), ctx.guard(e => {
      ctx.log('vote failed', e?.code || e);
      err = poll && !poll.open ? ctx.t('poll_closed') : ctx.t('poll_fail');
    })).finally(ctx.guard(() => { sending = false; paint(); }));
  }

  const choiceLabel = c => (poll.kind === 'guest' ? (book.nameOf(c) || '…') : optText(poll.options[c], lang()));

  function optionButtons() {
    return poll.options.map((o, i) => ctx.el('button', {
      cls: 'px-btn f-poll-opt' + (mine === i ? ' f-poll-mine' : ''), text: optText(o, lang()),
      attrs: { type: 'button', 'data-i': String(i), 'aria-pressed': String(mine === i) },
      on: { click: () => cast(i) },
    }));
  }

  function paintGuests() {
    if (!poll || poll.kind !== 'guest' || !(poll.open && (mine === null || changing))) return;
    if (!guests) {
      list.replaceChildren(ctx.el('p', { cls: 'tip', text: guestErr ? ctx.t('poll_fail') : ctx.t('poll_loading') }));
      return;
    }
    const shown = guests.filter(g => g.id !== gid && (!query || norm(g.name).includes(query))).slice(0, SHOW_MAX);
    list.replaceChildren(...(shown.length ? shown.map(g => {
      const face = spriteCanvas(normalizeAvatar(g.avatar), 'idle', 2); face.className = 'f-poll-face'; face.setAttribute('aria-hidden', 'true');
      return ctx.el('button', {
        cls: 'f-poll-gbtn' + (mine === g.id ? ' f-poll-mine' : ''), attrs: { type: 'button', 'data-gid': g.id, 'aria-pressed': String(mine === g.id) },
        kids: [face, ctx.el('span', { text: g.name })], on: { click: () => cast(g.id) },
      });
    }) : [ctx.el('p', { cls: 'tip', text: ctx.t('poll_none_found') })]));
  }

  function resultView() {
    const r = poll.result || {};
    const kids = [];
    if (poll.kind === 'choice') {
      for (const row of choiceRows(poll, r, lang())) kids.push(bar(row.label, row.n, row.pct, row.top, null));
    } else {
      const rows = guestRows(r, 5), max = Math.max(1, ...rows.map(x => x.n));
      for (const row of rows) kids.push(bar(book.nameOf(row.gid) || '…', row.n, Math.round(100 * row.n / max), row.top, book.avatarOf(row.gid)));
      if (!rows.length) kids.push(ctx.el('p', { cls: 'tip', text: ctx.t('poll_no_votes') }));
    }
    kids.push(ctx.el('p', { cls: 'f-poll-total', text: ctx.t('poll_total', { n: Number(r.total) || 0 }) }));
    return kids;
  }
  function bar(label, n, pct, top, avatar) {
    const fill = ctx.el('i', { cls: 'f-poll-fill' }); fill.style.width = pct + '%';
    const kids = [];
    if (avatar) { const f = spriteCanvas(normalizeAvatar(avatar), 'idle', 2); f.className = 'f-poll-face'; f.setAttribute('aria-hidden', 'true'); kids.push(f); }
    kids.push(ctx.el('span', { cls: 'f-poll-blabel', text: (top ? '🏆 ' : '') + label }), ctx.el('b', { cls: 'f-poll-bn', text: String(n) }), ctx.el('span', { cls: 'f-poll-track', kids: [fill] }));
    return ctx.el('div', { cls: 'f-poll-row' + (top ? ' f-poll-top' : ''), kids });
  }

  function paint() {
    if (!poll) { body.replaceChildren(); note.textContent = ''; return; }
    loadMine();
    q.textContent = qText(poll, lang());
    if (!poll.open) {
      head.textContent = poll.result ? ctx.t('poll_result') : ctx.t('poll_card_title');
      body.replaceChildren(...(poll.result ? resultView() : [ctx.el('p', { cls: 'f-poll-closed', text: ctx.t('poll_closed') })]));
      if (poll.result && poll.kind === 'guest' && !guests) needGuests();
      note.textContent = poll.result && mine !== null ? ctx.t('poll_my', { c: choiceLabel(mine) }) : '';
      return;
    }
    head.textContent = ctx.t('poll_card_title');
    if (mine !== null && !changing) {
      const wait = Math.max(0, Math.ceil((lockUntil - Date.now()) / 1000));
      const again = ctx.el('button', { cls: 'px-btn secondary f-poll-change', text: ctx.t('poll_change'), attrs: { type: 'button' }, on: { click: () => { if (locked()) return; changing = true; paint(); } } });
      again.disabled = wait > 0 || sending;
      body.replaceChildren(
        ctx.el('p', { cls: 'f-poll-done', text: ctx.t('poll_voted') }),
        ctx.el('p', { cls: 'f-poll-mypick', text: ctx.t('poll_my', { c: choiceLabel(mine) }) }),
        again,
      );
      note.textContent = sending ? ctx.t('poll_wait') : err || (wait > 0 ? ctx.t('poll_lock', { s: wait }) : '');
      return;
    }
    if (poll.kind === 'choice') {
      body.replaceChildren(ctx.el('div', { cls: 'f-poll-opts', kids: optionButtons() }));
    } else {
      search.placeholder = ctx.t('poll_search'); search.setAttribute('aria-label', ctx.t('poll_search'));
      body.replaceChildren(ctx.el('p', { cls: 'tip', text: ctx.t('poll_guest_hint') }), search, list);
      needGuests(); paintGuests();
    }
    body.querySelectorAll('button').forEach(b => { b.disabled = sending; });
    note.textContent = sending ? ctx.t('poll_wait') : err;
  }

  function needGuests() {
    if (guests) return;
    book.get().then(ctx.guard(l => { guests = l; guestErr = false; paint(); }), ctx.guard(e => { guestErr = true; ctx.log('guests', e?.code || e); paint(); }));
  }

  return {
    node,
    set(next) {
      if (next?.id !== poll?.id) { mine = null; mineFor = null; lockUntil = 0; changing = false; err = ''; query = ''; search.value = ''; }
      poll = next; paint();
    },
    relabel: paint,
  };
}

// ============================================================
//  WP-19 · 💌 방명록 모아보기 (wall) — docs/v4/wp/WP-19-wall.md
//  하객 폰: 완료·내 공간 화면의 허브 줄 → 다른 하객들의 방명록 목록 (이름 · 캐릭터 · 구분 · 메시지)
//  폰 마을: 주민을 탭하면 그 사람의 방명록 · 하단 바 "💌 방명록" → 목록
//  "신랑·신부에게만" 글(priv)은 본문 없이 표시, 숨김 글은 빠짐. 사진·음성은 어디에도 없음.
// ============================================================
import D from './i18n.js';
import { spriteCanvas, fmtDate } from '../../core/ui.js';
import { normalizeAvatar } from '../../avatar.js';

export const i18n = D;
export const css = true;

const SIDES = ['groom', 'bride', 'both'];
const LABEL = { all: 'wall_f_all', groom: 'wall_f_groom', bride: 'wall_f_bride', both: 'wall_f_both' };

export async function setup(ctx) {
  if (ctx.page === 'village') return setupVillage(ctx);
  return setupGuest(ctx);
}

/** a guest document (docdb or the village list) → what a card needs */
function entry(d) {
  return {
    id: String(d.id), name: String(d.name || '?').slice(0, 30), side: SIDES.includes(d.side) ? d.side : 'both',
    message: String(d.message ?? '').trim().slice(0, 300), priv: d.priv === true, hidden: !!d.hidden, hasVoice: !!d.hasVoice,
    avatar: d.avatar || {}, createdAt: Number(d.createdAt) || 0,
  };
}

/** one guestbook card. me = this phone's own entry */
function card(ctx, g, me) {
  const text = g.priv ? ctx.t('wall_priv') : g.message || (g.hasVoice ? ctx.t('wall_voice') : '');
  const face = spriteCanvas(normalizeAvatar(g.avatar), 'idle', 2);
  face.className = 'f-wall-av'; face.setAttribute('aria-hidden', 'true');
  const head = [ctx.el('b', { cls: 'f-wall-name', text: g.name }), ctx.el('span', { cls: 'f-wall-side f-wall-' + g.side, text: ctx.t(LABEL[g.side]) })];
  if (me) head.push(ctx.el('span', { cls: 'f-wall-mine', text: ctx.t('wall_me') }));
  return ctx.el('article', {
    cls: 'f-wall-card' + (me ? ' f-wall-me' : '') + (g.priv ? ' f-wall-priv' : ''), attrs: { 'data-gid': g.id },
    kids: [face, ctx.el('div', { cls: 'f-wall-body', kids: [
      ctx.el('div', { cls: 'f-wall-head', kids: head }),
      ctx.el('p', { cls: 'f-wall-msg', text }),
      ctx.el('span', { cls: 'f-wall-time', text: g.createdAt ? fmtDate(g.createdAt, ctx.lang(), 'datetime') : '' }),
    ] })],
  });
}

/** filter buttons + list, shared by the guest screen and the village sheet. Returns { node, set(list, meId) } */
function wallView(ctx) {
  let list = [], meId = null, filter = 'all';
  const count = ctx.el('p', { cls: 'f-wall-count' });
  const seg = ctx.el('div', { cls: 'f-wall-seg', attrs: { role: 'group' } });
  const btns = ['all', ...SIDES].map(k => ctx.el('button', {
    cls: 'f-wall-segbtn', text: ctx.t(LABEL[k]), attrs: { type: 'button', 'data-k': k, 'aria-pressed': String(k === 'all') },
    on: { click: () => { filter = k; paint(); } },
  }));
  seg.append(...btns);
  const box = ctx.el('div', { cls: 'f-wall-list' });
  const empty = ctx.el('p', { cls: 'tip f-wall-empty', text: ctx.t('wall_empty') });
  function paint() {
    btns.forEach(b => { b.setAttribute('aria-pressed', String(b.dataset.k === filter)); b.textContent = ctx.t(LABEL[b.dataset.k]); });
    empty.textContent = ctx.t('wall_empty');
    const shown = list.filter(g => filter === 'all' || g.side === filter);
    count.textContent = ctx.t('wall_count', { n: list.length });
    box.replaceChildren(...shown.map(g => card(ctx, g, g.id === meId)));
    empty.hidden = shown.length > 0;
  }
  return {
    node: ctx.el('div', { cls: 'f-wall-view', kids: [count, seg, box, empty] }),
    set(next, me) { list = next.filter(g => !g.hidden).sort((a, b) => b.createdAt - a.createdAt); meId = me || null; paint(); },
    relabel: paint,                                       // the language changed: every text again (cards included)
  };
}

// ---------------------------------------------------------------- guest page (done screen · my space)
function setupGuest(ctx) {
  const g = ctx.guest;
  if (!g?.screens || !g?.hub) return;          // a page that offers no screens / hub (the core loader's test page) — nothing to add
  let who = null, seq = 0;
  const view = wallView(ctx);
  const status = ctx.el('p', { cls: 'tip f-wall-status', attrs: { role: 'status' } });
  const retry = ctx.el('button', { cls: 'px-btn small secondary f-wall-retry', text: ctx.t('wall_retry'), attrs: { type: 'button', hidden: '' }, on: { click: () => load() } });

  // one read of the guest list per visit (≈ one read per guest — 03 §7), newest first
  function load() {
    const my = ++seq;
    status.textContent = ctx.t('wall_loading'); retry.hidden = true;
    ctx.db.col('guests').get().then(ctx.guard(docs => {
      if (my !== seq) return;
      status.textContent = ''; view.set(docs.map(entry), who?.gid || g.me()?.id);
    }), ctx.guard(e => {
      if (my !== seq) return;
      ctx.log('load failed', e?.code || e);
      status.textContent = ctx.t('wall_error'); retry.hidden = false;
    }));
  }

  // the screen is built once (when the feature turns on) — its fixed texts follow the language through relabel()
  const title = ctx.el('h2'), tip = ctx.el('p', { cls: 'tip' });
  const back = ctx.el('button', { cls: 'px-btn secondary f-wall-back', attrs: { type: 'button' }, on: { click: () => g.back() } });
  const relabel = () => {
    title.textContent = ctx.t('wall_title'); tip.textContent = ctx.t('wall_privacy'); back.textContent = ctx.t('wall_back'); retry.textContent = ctx.t('wall_retry');
    view.relabel();
  };
  relabel();
  ctx.bus.on('lang', relabel);
  g.screens.add('f-wall', {
    render: s => s.append(
      ctx.el('div', { cls: 'px-box f-wall-top', kids: [title, tip] }),
      view.node, status, retry,
      ctx.el('div', { cls: 'sticky-foot', kids: [back] }),
    ),
    onEnter: load,
  });

  // only guests who wrote reach the done / my-space screens — that is where the row lives (05-ux §3.1, order 65)
  g.hub.add({ key: 'f-wall', order: 65, size: 'row', icon: '💌', title: () => ctx.t('wall_hub'), onClick: w => { who = w; g.go('f-wall'); } });
}

// ---------------------------------------------------------------- village on a phone that wrote the guestbook
function setupVillage(ctx) {
  const v = ctx.v;
  if (!v?.actions || v.HOST || !v.ME) return;                 // the TV already shows the messages · a phone without an entry signs first
  const fromVillage = g => entry({ ...g, message: g.priv ? '' : g.message });   // the village puts a placeholder in priv / voice-only messages
  // tap a villager → that guest's card
  v.onTap(({ gid }) => {
    if (!gid) return;
    const g = v.guests().find(x => x.id === gid);
    if (!g) return;
    v.sheet.open({ key: 'f-wall', title: ctx.t('wall_sheet_one'), render: body => { body.append(card(ctx, fromVillage(g), gid === v.ME)); } });
  });
  // bottom bar → everybody in the village (no extra reads: the village already has the list)
  v.actions.add({
    key: 'f-wall', icon: '💌', label: ctx.t('wall_action'), order: 25,
    onClick: () => v.sheet.open({ key: 'f-wall-all', title: ctx.t('wall_title'), render: body => {
      const view = wallView(ctx);
      view.set(v.guests().map(fromVillage), v.ME);
      body.append(ctx.el('p', { cls: 'tip', text: ctx.t('wall_privacy') }), view.node);
    } }),
  });
}

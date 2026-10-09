// ============================================================
//  WP-11 · 🃏 내 픽셀 카드 (card) — docs/v4/wp/WP-11-card.md
//  내 캐릭터 + 내 덕담 + 픽셀 마을 배경 카드(1080×1350 PNG)를 저장·공유.
//  하객 페이지: 완료·내 공간 허브 줄(order 60) → 화면 f-card · 폰 마을: 하단 바 액션(order 30) → 시트
//  데이터: guests/{gid} 읽기 1번(하객 페이지 — 마을은 이미 가진 목록 사용) · 쓰기 없음
// ============================================================
import D from './i18n.js';
import { CONFIG } from '../../config.js';
import { normalizeAvatar } from '../../avatar.js';
import { ensureFonts, guestCode, shareImage } from '../../core/ui.js';
import { CW, CH, makeWorld, drawCard } from './render.js';

export const i18n = D;
export const css = true;

const SIDES = ['groom', 'bride', 'both'];
const THEMES = ['day', 'sunset', 'night'];
const SIDE_KEY = { groom: 'card_side_groom', bride: 'card_side_bride', both: 'card_side_both' };
const THEME_KEY = { day: 'card_theme_day', sunset: 'card_theme_sunset', night: 'card_theme_night' };
const noEmoji = s => String(s).replace(/^🃏\s*/u, '');      // the hub row / action bar draw the 🃏 icon themselves

export async function setup(ctx) {
  if (ctx.page === 'village') return setupVillage(ctx);
  return setupGuest(ctx);
}

/**
 * The card preview + theme buttons + save button, shared by the guest screen and the village sheet.
 * show(guest) draws it; release() lets the big canvas and the world picture go (05: one 1080×1350 canvas + one world at most).
 */
function cardView(ctx) {
  let theme = 'day', world = null, guest = null, seq = 0, ready = false, couple = {};
  const out = ctx.el('canvas', { cls: 'f-card-canvas', attrs: { width: String(CW), height: String(CH), role: 'img' } });
  const frame = ctx.el('div', { cls: 'f-card-frame', kids: [out] });
  const status = ctx.el('p', { cls: 'tip f-card-status', attrs: { role: 'status' } });
  const label = ctx.el('span', { cls: 'f-card-label' });
  const btns = THEMES.map(k => ctx.el('button', {
    cls: 'f-card-theme', attrs: { type: 'button', 'data-theme': k, 'aria-pressed': String(k === theme) },
    on: { click: () => { if (theme === k) return; theme = k; paint(); } },
  }));
  const themes = ctx.el('div', { cls: 'f-card-themes', attrs: { role: 'group' }, kids: [label, ...btns] });
  const save = ctx.el('button', { cls: 'px-btn f-card-save', attrs: { type: 'button', disabled: '' }, on: { click: () => doSave() } });

  const lineKey = () => { const p = ctx.phase(); return p === 'pre' ? 'card_line_pre' : p === 'live' ? 'card_line_live' : 'card_line_after'; };
  const names = () => { const C = CONFIG.couple || {}, L = ctx.lang(); return { groom: C.groom?.[L] || C.groom?.ko || '', bride: C.bride?.[L] || C.bride?.ko || '' }; };
  const villageUrl = gid => { const u = new URL('village.html', location.href); u.search = ''; u.hash = ''; u.searchParams.set('me', gid); if (ctx.demo) u.searchParams.set('demo', '1'); return u.href; };

  function input(d) {
    const side = SIDES.includes(d.side) ? d.side : 'both', n = names(), date = CONFIG.couple?.date || '';
    const message = d.priv ? ctx.t('card_priv') : String(d.message ?? '').trim() || (d.hasVoice ? ctx.t('card_voice') : '');
    return {
      world, theme, avatar: normalizeAvatar(d.avatar || {}),
      groom: couple.groom || CONFIG.groomAvatar, bride: couple.bride || CONFIG.brideAvatar,
      name: ctx.t('card_name', { name: String(d.name || '?').slice(0, 30) }), side, sideLabel: ctx.t(SIDE_KEY[side]),
      message: message.slice(0, 300), line: ctx.t(lineKey()),
      couple: `${n.groom} ♥ ${n.bride}${date ? ' · ' + date : ''}`,
      footer: ctx.t('card_footer', { code: guestCode(d.id) }), url: villageUrl(d.id),
    };
  }

  function relabel() {
    label.textContent = ctx.t('card_theme_label');
    btns.forEach(b => { b.textContent = ctx.t(THEME_KEY[b.dataset.theme]); b.setAttribute('aria-pressed', String(b.dataset.theme === theme)); });
    save.textContent = ctx.t('card_save');
    out.setAttribute('aria-label', ctx.t('card_title'));
  }

  function paint() {
    relabel();
    if (!guest) return;
    const my = ++seq;
    ready = false; save.disabled = true; status.textContent = ctx.t('card_making');
    ensureFonts().then(ctx.guard(() => {
      if (my !== seq || !guest) return;
      try {
        const night = theme === 'night';
        if (!world || world.night !== night) world = makeWorld(night);      // one world at a time: rebuilt only between day-ish and night
        const st = drawCard(out, input(guest));
        if (ctx.demo) out.dataset.st = JSON.stringify(st);                 // test hook (demo only): what the renderer was given
        out.dataset.theme = theme;
        ready = true; save.disabled = false; status.textContent = '';
      } catch (e) {
        ctx.log('draw failed', e);
        status.textContent = ctx.t('card_fail');
        throw e;                                                           // counted by the breaker
      }
    }));
  }

  function doSave() {
    if (!ready || !guest) return;
    const n = names();
    // synchronous up to navigator.share: the share sheet only opens right after the tap
    shareImage({ dataURL: out.toDataURL('image/png'), filename: `pixel-card-${guestCode(guest.id)}.png`, title: noEmoji(ctx.t('card_title')), text: ctx.t('card_share_text', n) })
      .then(ctx.guard(r => { status.textContent = r === 'shared' ? ctx.t('card_shared') : r === 'downloaded' ? ctx.t('card_saved') : ''; }),
        ctx.guard(e => { ctx.log('share failed', e); status.textContent = ctx.t('card_fail'); }));
  }

  relabel();
  const offs = [
    ctx.bus.on('lang', () => paint()),
    ctx.bus.on('couple:sprites', p => { couple = { groom: p?.groom || null, bride: p?.bride || null }; if (guest) paint(); }, { replay: true }),
  ];
  const release = () => { ++seq; guest = null; world = null; ready = false; save.disabled = true; out.width = 1; out.height = 1; delete out.dataset.st; };
  return {
    frame, themes, save, status,
    show(d) { guest = d; theme = THEMES.includes(theme) ? theme : 'day'; paint(); },
    loading() { guest = null; ++seq; ready = false; save.disabled = true; status.textContent = ctx.t('card_making'); },
    release,
    dispose() { release(); offs.forEach(off => off()); },        // a view that goes away for good (the village sheet)
    relabel,
  };
}

// ---------------------------------------------------------------- guest page (done screen · my space)
function setupGuest(ctx) {
  const g = ctx.guest;
  if (!g?.screens || !g?.hub) return;                  // a page that offers no screens / hub (the core loader's test page)
  const view = cardView(ctx);
  let who = null, seq = 0;
  const docs = new Map();                              // gid → guest doc (one read per guest per page)

  const title = ctx.el('h2'), tip = ctx.el('p', { cls: 'tip' });
  const back = ctx.el('button', { cls: 'px-btn secondary f-card-back', attrs: { type: 'button' }, on: { click: () => g.back() } });
  const relabel = () => { title.textContent = ctx.t('card_title'); tip.textContent = ctx.t('card_tip'); back.textContent = ctx.t('card_back'); };
  relabel();
  ctx.bus.on('lang', relabel);

  function load() {
    const gid = who?.gid || g.me()?.id;
    if (!gid) { g.back(); return; }
    const my = ++seq;
    const known = docs.get(gid);
    if (known) { view.show(known); return; }
    view.loading();
    ctx.db.doc('guests/' + gid).get().then(ctx.guard(d => {
      if (my !== seq) return;
      // offline / missing: a card without the message rather than no card (WP-11 §5)
      const doc = d ? { ...d, id: gid } : { id: gid, name: who?.name || g.me()?.name || '?', side: 'both', avatar: {} };
      if (d) docs.set(gid, doc);
      view.show(doc);
    }), ctx.guard(e => {
      if (my !== seq) return;
      ctx.log('read failed', e?.code || e);
      view.show({ id: gid, name: who?.name || g.me()?.name || '?', side: 'both', avatar: {} });
    }));
  }

  g.screens.add('f-card', {
    render: s => s.append(
      ctx.el('div', { cls: 'px-box f-card-top', kids: [title, tip] }),
      view.frame, view.themes, view.status,
      ctx.el('div', { cls: 'sticky-foot f-card-foot', kids: [view.save, back] }),
    ),
    onEnter: load,
    onLeave: () => { ++seq; view.release(); },
  });
  ctx.onCleanup(() => view.release());

  g.hub.add({
    key: 'f-card', order: 60, size: 'row', icon: '🃏', title: () => noEmoji(ctx.t('card_row')),
    when: w => !!(w?.gid || g.me()),
    onClick: w => { who = w || null; g.go('f-card'); },
  });
}

// ---------------------------------------------------------------- village on a phone that wrote the guestbook (S2)
function setupVillage(ctx) {
  const v = ctx.v;
  if (!v?.actions || v.HOST || !v.ME) return;          // the TV has no "me" · a phone without an entry has nothing to put on a card (S5)
  const mine = () => v.guests().find(x => x.id === v.ME) || v.villager(v.ME)?.g || null;
  v.actions.add({
    key: 'f-card', icon: '🃏', label: noEmoji(ctx.t('card_action')), order: 30,
    when: () => !!mine(),
    onClick: () => {
      const g = mine(); if (!g) return;
      v.sheet.open({
        key: 'f-card', title: ctx.t('card_title'),
        render: body => {
          const view = cardView(ctx);
          view.frame.classList.add('f-card-small');
          body.append(view.frame, view.themes, view.status, ctx.el('div', { cls: 'f-card-sheetfoot', kids: [view.save] }));
          // the village puts a placeholder into private / voice-only messages — the card says it in its own words
          view.show({ ...g, id: v.ME, message: g.priv ? '' : g.message });
          return () => view.dispose();
        },
      });
    },
  });
}

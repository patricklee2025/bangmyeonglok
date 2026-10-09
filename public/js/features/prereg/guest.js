// ============================================================
//  WP-01 — 하객 폰 · 키오스크 (ctx.guest)
//  pre : 환영 문구 덮어쓰기 · 완료/내 공간 허브의 입장권 카드 · 환영 슬롯 "🎟 내 입장권 보기"
//  live: 기억된 사전 입주자 → 환영 슬롯 체크인 카드 · 입구 포스터 #checkin · 키오스크 이름 찾기 · 허브 "🎟 내 입장권" 행
// ============================================================
import { spriteCanvas, fmtDate, icsEvent, downloadBlob, shareImage, qrCanvas, guestCode } from '../../core/ui.js';
import { CONFIG } from '../../config.js';
import { normalizeAvatar } from '../../avatar.js';
import { OVERRIDE } from './texts.js';
import { drawTicket } from './ticket.js';
import { isPre, sideOf, writeCheckin, meUrl, ceremonyStart, venueLine, coupleNames, norm, liveStart } from './shared.js';

const RESET_SEC = 20;                                    // 키오스크 체크인 완료 화면 → 처음 화면

export function setupGuest(ctx) {
  const g = ctx.guest;
  if (!g?.screens || !g?.hub || !g?.welcome) return;     // a page without the guest API (the loader's test page)
  const K = g.kiosk;
  const isLive = () => ctx.phase() === 'live';

  // ---------------------------------------------------------------- guest data (few reads: one doc per guest, the list once a minute)
  const known = new Map();                               // gid → { id, name, side, avatar, createdAt, hidden } (from guest:submitted or a doc read)
  ctx.bus.on('guest:submitted', p => known.set(p.gid, { id: p.gid, name: p.name, side: p.side, avatar: p.avatar, createdAt: Date.now(), hidden: false }));
  const guestDoc = gid => (known.has(gid) ? Promise.resolve(known.get(gid))
    : ctx.db.doc('guests/' + gid).get().then(d => { if (d) known.set(gid, d); return d; }));
  let listAt = 0, listP = null;
  const guestList = () => {
    if (!listP || Date.now() - listAt > 60e3) { listAt = Date.now(); listP = ctx.db.col('guests').get().catch(e => { listP = null; throw e; }); }
    return listP;
  };
  const checkedIn = new Set();                           // gids this device saw checked in (or checked in itself)
  const isCheckedIn = gid => (checkedIn.has(gid) ? Promise.resolve(true) : ctx.db.doc('checkins/' + gid).get().then(d => { if (d) checkedIn.add(gid); return !!d; }, () => false));

  // ---------------------------------------------------------------- pre: core texts
  const applyTexts = () => ctx.texts(ctx.phase() === 'pre' ? OVERRIDE : {});
  applyTexts();

  // ---------------------------------------------------------------- shared bits
  const back = () => ctx.el('div', { cls: 'sticky-foot', kids: [ctx.el('button', { cls: 'px-btn secondary f-prereg-back', text: ctx.t('prereg_back'), attrs: { 'data-l': 'prereg_back', type: 'button' }, on: { click: () => g.back() } })] });
  const face = (avatar, scale = 4) => { const c = spriteCanvas(normalizeAvatar(avatar || {}), 'idle', scale); c.className = 'f-prereg-face'; c.setAttribute('aria-hidden', 'true'); return c; };

  // ---------------------------------------------------------------- ticket (screen + hub card share one renderer)
  let ticketWho = null, ticketCanvas = null;
  const ticketView = ctx.el('div', { cls: 'f-prereg-ticketbox' });
  const ticketMsg = ctx.el('p', { cls: 'tip f-prereg-msg', attrs: { role: 'status' } });
  const saveBtn = ctx.el('button', { cls: 'px-btn f-prereg-save', text: ctx.t('prereg_ticket_save'), attrs: { 'data-l': 'prereg_ticket_save', type: 'button', disabled: '' }, on: { click: () => saveTicket(ticketCanvas, ticketWho, ticketMsg) } });
  const calBtn = ctx.el('button', { cls: 'px-btn secondary f-prereg-cal', text: ctx.t('prereg_ticket_cal'), attrs: { 'data-l': 'prereg_ticket_cal', type: 'button' }, on: { click: () => saveCalendar() } });

  function saveTicket(canvas, who, msg) {
    if (!canvas || !who) return;
    // straight from the click (no await before it — iOS needs the gesture for the share sheet)
    shareImage({ dataURL: canvas.toDataURL('image/png'), filename: `wedding-ticket-${guestCode(who.id)}.png`, title: ctx.t('prereg_ticket_title') })
      .then(ctx.guard(r => { if (r !== 'cancelled') msg.textContent = ctx.t('prereg_ticket_saved'); }), ctx.guard(e => ctx.log('save failed', e)));
  }
  function saveCalendar() {
    const n = coupleNames(ctx.lang()), title = ctx.t('prereg_ics_title', n), start = ceremonyStart(ctx);
    let text;
    if (start) text = icsEvent({ title, start, end: start + 3 * 3600e3, location: venueLine(), description: ctx.t('prereg_ticket_note') });
    else text = allDayIcs(title, venueLine());
    downloadBlob('wedding.ics', new Blob([text], { type: 'text/calendar' }));
  }
  async function showTicket(gid, into) {
    const d = await guestDoc(gid);
    if (!d) throw Object.assign(new Error('guest not found'), { code: 'not-found' });
    const who = { id: gid, gid, name: d.name, side: sideOf(d), avatar: d.avatar };
    const c = await drawTicket(ctx, who, ctx.lang());
    c.classList.add('f-prereg-ticket');
    c.setAttribute('role', 'img'); c.setAttribute('aria-label', `${ctx.t('prereg_ticket_title')} · ${d.name}`);
    c.dataset.gid = gid;
    into.replaceChildren(c);
    return { who, c };
  }
  const paintTicketScreen = ctx.guard(gid => {
    ticketMsg.textContent = ctx.t('prereg_loading'); saveBtn.disabled = true; ticketView.replaceChildren();
    showTicket(gid, ticketView).then(ctx.guard(({ who, c }) => { ticketWho = who; ticketCanvas = c; saveBtn.disabled = false; ticketMsg.textContent = ''; }),
      ctx.guard(e => { ticketMsg.textContent = ctx.t('prereg_load_fail'); ctx.log('ticket', e); }));
  });
  g.screens.add('f-prereg-ticket', {
    render: s => s.append(
      ctx.el('div', { cls: 'px-box f-prereg-top', kids: [ctx.el('h2', { text: ctx.t('prereg_ticket_title'), attrs: { 'data-l': 'prereg_ticket_title' } }), ctx.el('p', { cls: 'tip', text: ctx.t('prereg_ticket_hint'), attrs: { 'data-l': 'prereg_ticket_hint' } })] }),
      ticketView, ticketMsg,
      ctx.el('div', { cls: 'f-prereg-row', kids: [saveBtn, calBtn] }),
      back(),
    ),
  });
  const openTicket = gid => { g.go('f-prereg-ticket'); paintTicketScreen(gid); };

  // hub: pre = the ticket as a card (preview + save + calendar) · live = a row to the ticket screen
  g.hub.add({
    key: 'f-prereg', order: 10, size: 'card', title: () => ctx.t('prereg_ticket_title'), when: () => ctx.phase() === 'pre',
    render: (box, who) => {
      const view = ctx.el('div', { cls: 'f-prereg-mini', attrs: { role: 'button', tabindex: '0', 'aria-label': ctx.t('prereg_view_ticket') }, on: { click: () => openTicket(who.gid) } }), msg = ctx.el('p', { cls: 'tip f-prereg-msg', attrs: { role: 'status' } });
      let canvas = null, w = null;
      const save = ctx.el('button', { cls: 'px-btn small f-prereg-save', text: ctx.t('prereg_ticket_save'), attrs: { 'data-l': 'prereg_ticket_save', type: 'button', disabled: '' }, on: { click: () => saveTicket(canvas, w, msg) } });
      box.append(ctx.el('b', { cls: 'f-prereg-cardtitle', text: ctx.t('prereg_ticket_title'), attrs: { 'data-l': 'prereg_ticket_title' } }), view,
        ctx.el('div', { cls: 'f-prereg-row', kids: [save, ctx.el('button', { cls: 'px-btn small secondary f-prereg-cal', text: ctx.t('prereg_ticket_cal'), attrs: { 'data-l': 'prereg_ticket_cal', type: 'button' }, on: { click: () => saveCalendar() } })] }), msg);
      showTicket(who.gid, view).then(ctx.guard(r => { canvas = r.c; w = r.who; save.disabled = false; }), ctx.guard(() => { msg.textContent = ctx.t('prereg_load_fail'); }));
    },
  });
  g.hub.add({ key: 'f-prereg-row', order: 10, size: 'row', icon: '🎟', title: () => ctx.t('prereg_ticket_title').replace(/^🎟\s*/, ''), when: () => isLive(), onClick: who => openTicket(who.gid) });   // the row draws 🎟 itself

  // ---------------------------------------------------------------- check-in: confirm → write → done
  let target = null;                                     // { gid, name, avatar, side, via }
  const confirmFace = ctx.el('div', { cls: 'f-prereg-facebox' });
  const confirmQ = ctx.el('h2', { cls: 'f-prereg-q' });
  const confirmMsg = ctx.el('p', { cls: 'tip f-prereg-msg', attrs: { role: 'status' } });
  const yesBtn = ctx.el('button', { cls: 'px-btn big f-prereg-yes', text: ctx.t('prereg_yes'), attrs: { 'data-l': 'prereg_yes', type: 'button' }, on: { click: () => doCheckin() } });
  const notMe = ctx.el('button', { cls: 'px-btn secondary f-prereg-notme', text: ctx.t('prereg_not_me'), attrs: { 'data-l': 'prereg_not_me', type: 'button' }, on: { click: () => { target = null; openFind(lastVia === 'kiosk' ? 'kiosk' : 'entrance'); } } });
  g.screens.add('f-prereg-confirm', {
    render: s => s.append(ctx.el('div', { cls: 'px-box card f-prereg-confirmbox', kids: [confirmFace, confirmQ, confirmMsg, yesBtn, notMe] }), back()),
  });
  let lastVia = 'phone';
  function openConfirm(t) {
    target = t; lastVia = t.via;
    confirmFace.replaceChildren(face(t.avatar, 4));
    confirmQ.textContent = ctx.t('prereg_confirm', { name: t.name });
    confirmMsg.textContent = ''; yesBtn.disabled = false;
    g.go('f-prereg-confirm');
  }
  let busy = false;
  async function doCheckin() {
    if (!target || busy) return;
    busy = true; yesBtn.disabled = true; confirmMsg.textContent = ctx.t('prereg_loading');
    const t = target;
    try {
      const r = await writeCheckin(ctx, t.gid, t.via);
      checkedIn.add(t.gid);
      if (r !== 'already') ctx.bus.emit('checkin:done', { gid: t.gid, via: t.via });
      if (!K && t.via !== 'kiosk') g.remember({ id: t.gid, name: t.name });       // the entrance poster on a new phone: this phone is now that guest
      openDone(t, r);
    } catch (e) {
      ctx.log('check-in failed', e?.code || e);
      confirmMsg.textContent = ctx.t('prereg_fail'); yesBtn.disabled = false;
    } finally { busy = false; }
  }

  // done screen
  const doneFace = ctx.el('div', { cls: 'f-prereg-facebox' });
  const doneTitle = ctx.el('h2', { text: ctx.t('prereg_in_title'), attrs: { 'data-l': 'prereg_in_title' } });
  const doneSub = ctx.el('p', { cls: 'f-prereg-sub' });
  const doneNote = ctx.el('p', { cls: 'notice f-prereg-note', attrs: { hidden: '' } });
  const handoff = ctx.el('div', { cls: 'handoff px-box f-prereg-handoff', attrs: { hidden: '' } });
  const countdown = ctx.el('p', { cls: 'tip f-prereg-count' });
  const mineBtn = ctx.el('button', { cls: 'px-btn blue f-prereg-mine', text: ctx.t('prereg_in_mine'), attrs: { 'data-l': 'prereg_in_mine', type: 'button' }, on: { click: () => { if (!g.openMine()) g.go('welcome'); } } });
  const villageLink = ctx.el('a', { cls: 'px-btn secondary f-prereg-village', text: ctx.t('prereg_in_village'), attrs: { 'data-l': 'prereg_in_village', href: 'village.html' } });
  const doneFoot = ctx.el('div', { cls: 'sticky-foot', kids: [ctx.el('div', { cls: 'foot-row f-prereg-foot', kids: K ? [] : [mineBtn, villageLink] })] });
  g.screens.add('f-prereg-in', {
    render: s => s.append(ctx.el('div', { cls: 'px-box done-head f-prereg-donebox', kids: [doneFace, doneTitle, doneSub] }), doneNote, handoff, countdown, doneFoot),
    onLeave: () => { stopCount(); },
  });
  let stopCount = () => {};
  function openDone(t, result) {
    doneFace.replaceChildren(face(t.avatar, 5));
    doneTitle.textContent = ctx.t('prereg_in_title');
    doneSub.textContent = ctx.t('prereg_in_sub', { name: t.name });
    doneNote.hidden = result === 'ok';
    doneNote.textContent = result === 'already' ? ctx.t('prereg_already') : result === 'queued' ? ctx.t('prereg_offline') : '';
    villageLink.setAttribute('href', g.villageUrl(t.gid));
    if (K) {
      const qr = qrCanvas(meUrl(ctx, t.gid, t.name), { ecc: 'M', scale: 4, pad: 2 });
      qr.className = 'f-prereg-qr'; qr.dataset.url = meUrl(ctx, t.gid, t.name);
      handoff.replaceChildren(qr, ctx.el('div', { kids: [ctx.el('b', { text: t.name }), ctx.el('p', { cls: 'tip', text: ctx.t('prereg_in_handoff'), attrs: { 'data-l': 'prereg_in_handoff' } })] }));
      handoff.hidden = false;
    } else handoff.hidden = true;
    g.go('f-prereg-in');
    if (K) {                                              // kiosk: back to the start after 20 s (the core reset clears the core inputs too)
      let left = RESET_SEC;
      const paint = () => { countdown.textContent = ctx.t('prereg_in_reset', { n: left }); };
      paint();
      const offTick = ctx.every(1000, () => { left--; paint(); if (left <= 0) { stopCount(); g.reset(); } });
      stopCount = () => { offTick(); stopCount = () => {}; countdown.textContent = ''; };
    } else countdown.textContent = '';
  }

  // ---------------------------------------------------------------- find by name (entrance poster without a remembered guest · kiosk)
  let findVia = 'entrance';
  const findInput = ctx.el('input', { cls: 'input f-prereg-input', attrs: { type: 'search', maxlength: '30', autocomplete: 'off', enterkeyhint: 'search', placeholder: ctx.t('prereg_find_ph'), 'aria-label': ctx.t('prereg_find_ph') } });
  const findList = ctx.el('div', { cls: 'f-prereg-list', attrs: { role: 'list' } });
  const findMsg = ctx.el('p', { cls: 'tip f-prereg-msg', attrs: { role: 'status' } });
  const findRetry = ctx.el('button', { cls: 'px-btn small secondary f-prereg-retry', text: ctx.t('prereg_retry'), attrs: { 'data-l': 'prereg_retry', type: 'button', hidden: '' }, on: { click: () => loadFind() } });
  const newBtn = ctx.el('button', { cls: 'px-btn secondary f-prereg-new', text: ctx.t('prereg_find_new'), attrs: { 'data-l': 'prereg_find_new', type: 'button' }, on: { click: () => g.go('info') } });
  let pool = [];
  function paintFind() {
    const q = norm(findInput.value);
    const hits = q ? pool.filter(d => norm(d.name).includes(q)).slice(0, 12) : [];
    findList.replaceChildren(...hits.map(d => ctx.el('button', {
      cls: 'px-box f-prereg-hit', attrs: { type: 'button', role: 'listitem', 'data-gid': d.id },
      kids: [face(d.avatar, 2), ctx.el('span', { cls: 'f-prereg-hitname', text: d.name }),
        ctx.el('span', { cls: 'f-prereg-side f-prereg-' + sideOf(d), text: ctx.t('prereg_side_' + sideOf(d)) }),
        ctx.el('span', { cls: 'f-prereg-code', text: guestCode(d.id) })],
      on: { click: () => openConfirm({ gid: d.id, name: d.name, avatar: d.avatar, side: sideOf(d), via: findVia }) },
    })));
    findMsg.textContent = q && !hits.length ? ctx.t('prereg_find_none') : '';
  }
  function loadFind() {
    findMsg.textContent = ctx.t('prereg_loading'); findRetry.hidden = true;
    guestList().then(ctx.guard(list => { pool = list.filter(d => !d.hidden && isPre(d)).sort((a, b) => String(a.name).localeCompare(String(b.name))); findMsg.textContent = ''; paintFind(); }),
      ctx.guard(e => { ctx.log('find', e?.code || e); findMsg.textContent = ctx.t('prereg_load_fail'); findRetry.hidden = false; }));
  }
  ctx.listen(findInput, 'input', () => paintFind());
  g.screens.add('f-prereg-find', {
    render: s => s.append(
      ctx.el('div', { cls: 'px-box card f-prereg-findbox', kids: [ctx.el('h2', { text: ctx.t('prereg_find_title'), attrs: { 'data-l': 'prereg_find_title' } }), findInput] }),
      findList, findMsg, findRetry, newBtn, back(),
    ),
    onEnter: () => { loadFind(); ctx.after(50, () => { try { findInput.focus(); } catch {} }); },
  });
  function openFind(via) { findVia = via; findInput.value = ''; findList.replaceChildren(); g.go('f-prereg-find'); }

  // ---------------------------------------------------------------- welcome slots
  // order 5 (live): the remembered pre-registered guest → a big check-in card · kiosk → "moved in early? check in by name"
  const card = ctx.el('div', { cls: 'px-box f-prereg-card', attrs: { hidden: '' } });
  const kioskRow = ctx.el('button', { cls: 'px-box f-prereg-kiosk', text: ctx.t('prereg_kiosk_cta'), attrs: { 'data-l': 'prereg_kiosk_cta', type: 'button', hidden: '' }, on: { click: () => openFind('kiosk') } });
  const ticketRow = ctx.el('button', { cls: 'px-box f-prereg-ticketrow', text: ctx.t('prereg_view_ticket'), attrs: { 'data-l': 'prereg_view_ticket', type: 'button', hidden: '' }, on: { click: () => { const me = g.me(); if (me) openTicket(me.id); } } });
  g.welcome.add(K ? kioskRow : card, { order: 5 });
  if (!K) g.welcome.add(ticketRow, { order: 10 });
  let paintSeq = 0;
  function paintWelcome() {
    const my = ++paintSeq, phase = ctx.phase(), me = K ? null : g.me();
    kioskRow.hidden = !(K && phase === 'live');
    ticketRow.hidden = !(me && phase === 'pre');
    if (K || !me || phase !== 'live') { card.hidden = true; return; }
    // live + a remembered guest: show the card only if that guest moved in early and has not checked in yet
    Promise.all([guestDoc(me.id).catch(() => null), isCheckedIn(me.id)]).then(ctx.guard(([d, done]) => {
      if (my !== paintSeq) return;
      if (!d || d.hidden || !isPre(d) || done) { card.hidden = true; return; }
      card.replaceChildren(
        face(d.avatar, 3),
        ctx.el('div', { cls: 'f-prereg-cardtext', kids: [ctx.el('b', { text: ctx.t('prereg_checkin_card', { name: d.name }) }), ctx.el('span', { cls: 'tip', text: ctx.t('prereg_checkin_sub'), attrs: { 'data-l': 'prereg_checkin_sub' } })] }),
        ctx.el('button', { cls: 'px-btn big f-prereg-go', text: ctx.t('prereg_yes'), attrs: { 'data-l': 'prereg_yes', type: 'button' }, on: { click: () => openConfirm({ gid: me.id, name: d.name, avatar: d.avatar, side: sideOf(d), via: 'phone' }) } }),
      );
      card.hidden = false;
    }));
  }
  paintWelcome();
  ctx.bus.on('guest:mine', () => paintWelcome());
  ctx.bus.on('checkin:done', () => paintWelcome());
  ctx.bus.on('phase', () => { applyTexts(); paintWelcome(); g.hub.refresh(); });

  // kiosk: the next person starts clean (search, lists, timers)
  ctx.bus.on('guest:reset', () => { stopCount(); target = null; findInput.value = ''; findList.replaceChildren(); findMsg.textContent = ''; pool = []; handoff.replaceChildren(); paintWelcome(); });

  // ---------------------------------------------------------------- the language changes while the screens exist (built once at setup)
  ctx.bus.on('lang', () => {
    for (const n of document.querySelectorAll('[data-f="prereg"][data-l]')) n.textContent = ctx.t(n.dataset.l);
    findInput.placeholder = ctx.t('prereg_find_ph'); findInput.setAttribute('aria-label', ctx.t('prereg_find_ph'));
    if (target) confirmQ.textContent = ctx.t('prereg_confirm', { name: target.name });
    paintWelcome();
  });

  // ---------------------------------------------------------------- entrance poster QR: index.html#checkin
  // (also when the hash changes on an open page — the QR scanned with the guestbook already open in that tab)
  function fromPoster() {
    if (K || location.hash !== '#checkin') return;
    try { history.replaceState(null, '', location.pathname + location.search); } catch {}
    if (!isLive()) return;
    const me = g.me();
    if (!me) { openFind('entrance'); return; }
    guestDoc(me.id).then(ctx.guard(d => {
      if (d && !d.hidden) openConfirm({ gid: me.id, name: d.name, avatar: d.avatar, side: sideOf(d), via: 'entrance' });
      else openFind('entrance');
    }), ctx.guard(() => openFind('entrance')));
  }
  fromPoster();
  ctx.listen(window, 'hashchange', () => fromPoster());
  ctx.log('guest ready', { kiosk: K, phase: ctx.phase(), liveStart: liveStart() });
}

/** all-day calendar entry when the ceremony time is not set yet (RFC 5545, CRLF, folded at 75 bytes is not needed for these short lines) */
function allDayIcs(title, location) {
  const d = CONFIG.schedule.weddingDate.replace(/-/g, '');
  const [y, m, day] = CONFIG.schedule.weddingDate.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, day + 1)), nd = `${next.getUTCFullYear()}${String(next.getUTCMonth() + 1).padStart(2, '0')}${String(next.getUTCDate()).padStart(2, '0')}`;
  const esc = s => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//wedding-guestbook//prereg//EN', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
    `UID:wedding-${d}@guestbook`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${nd}`,
    `SUMMARY:${esc(title)}`, ...(location ? [`LOCATION:${esc(location)}`] : []), 'END:VEVENT', 'END:VCALENDAR'].join('\r\n') + '\r\n';
}

// ============================================================
//  WP-20 · 📺 마을 TV (tv) — docs/v4/wp/WP-20-tv.md
//  결혼식 당일(live) 마을 호숫가에 떠 있는 TV 한 대가 관리자가 넣은 유튜브(라이브 방송 또는 영상)를 틀어 줍니다.
//  · 식장 TV(HOST): 소리 끈 채로 바로 재생 (관리자 설정으로 끌 수 있음) · 조용 모드가 켜지면 소리를 끔
//  · 하객 폰: 처음엔 "▶ 눌러서 보기" 포스터 (데이터 절약) → 누르면 재생 · 하단 바 "📺 TV"는 카메라를 TV로
//  · 화면을 한 번 누르면 소리 켜기/끄기, 두 번(더블클릭·더블탭) 누르면 전체화면 (아이폰은 유튜브 자체 ⛶ 버튼 안내)
//  유튜브 iframe 은 코어 core/ui.js 의 youtubeFrame 만 만듭니다 (기능 코드에는 외부 주소 금지 — 02 §12-4).
// ============================================================
import D from './i18n.js';
import { youtubeSource, youtubeFrame, youtubeCommand } from '../../core/ui.js';

export const i18n = D;
export const css = true;

// the screen, in world pixels (16:9): standing in the lake, top right — clear of the QR panel, the dock and every walking path
const SX = 350, SY = 34, SW = 76, SH = 43;
const DEFAULTS = { url: '', autoplay: true, phone: true };

export async function setup(ctx) {
  if (ctx.page === 'admin') return setupAdmin(ctx);
  return setupVillage(ctx);
}

// ---------------------------------------------------------------- village (TV and phones)
function setupVillage(ctx) {
  const v = ctx.v;
  if (!v?.anchor || !v?.addProp) return;              // a page without the world (the core loader's test page)
  let cur = null;                                         // the mounted TV: { key, teardown }

  function build() {
    const c = { ...DEFAULTS, ...ctx.cfg() }, src = youtubeSource(c.url);
    const auto = v.HOST && c.autoplay !== false;
    // no link yet → the set still stands with a "coming up soon" card (the couple can see where the TV will be)
    const key = v.HOST || c.phone !== false ? (src ? `${src.video || src.channel}|${auto}` : 'soon') : null;
    if (key === (cur?.key ?? null)) return;
    cur?.teardown(); cur = null;
    if (key) cur = { key, teardown: src ? mount(src, auto) : mountSoon() };
    v.actions.refresh();
  }

  function mountSoon() {
    const prop = v.addProp({ x: SX - 6, y: SY - 12, w: SW + 12, h: SH + 34, base: SY + SH + 21, kind: 'tv', draw: drawSet });
    const el = ctx.el('div', { cls: 'f-tv-screen f-tv-idle', kids: [ctx.el('div', { cls: 'f-tv-soon', kids: [ctx.el('b', { text: '📺' }), ctx.el('span', { text: ctx.t('tv_soon') })] })] });
    const anchor = v.anchor(el, { x: SX, y: SY, w: SW, h: SH });
    return () => { anchor.remove(); prop.remove(); el.remove(); };
  }

  function mount(src, autoplay) {
    // the set: a dark frame on two posts in the water, a blinking "on air" light — drawn on the world canvas (y-sorted with everything)
    const prop = v.addProp({ x: SX - 6, y: SY - 12, w: SW + 12, h: SH + 34, base: SY + SH + 21, kind: 'tv', draw: drawSet });
    const el = ctx.el('div', { cls: 'f-tv-screen', attrs: { 'aria-label': ctx.t('tv_live') } });
    const anchor = v.anchor(el, { x: SX, y: SY, w: SW, h: SH, interactive: true });
    let frame = null, glass = null, badge = null, muted = true, lastUp = 0, cancelSingle = null;

    const paintBadge = () => { if (badge) badge.textContent = ctx.t(muted ? 'tv_sound_off' : 'tv_sound_on'); };
    const toggleSound = () => {
      cancelSingle = null;
      if (!frame) return;
      if (youtubeCommand(frame, muted ? 'unMute' : 'mute')) { muted = !muted; paintBadge(); }
    };
    const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement || null;
    const toggleFull = () => {
      if (fsEl()) { (document.exitFullscreen || document.webkitExitFullscreen)?.call(document); return; }
      const req = el.requestFullscreen || el.webkitRequestFullscreen;
      const fallback = ctx.guard(() => {                  // iPhone Safari has no element full screen: let taps reach YouTube's own ⛶ button
        glass?.classList.add('f-tv-thru');
        if (!v.HOST) v.toast(ctx.t('tv_fs_hint'));
      });
      if (!req) { fallback(); return; }
      try { const p = req.call(el); if (p?.catch) p.catch(fallback); } catch { fallback(); }
    };
    // one press = sound on/off · two presses within 0.35 s = full screen (same on mouse and touch — dblclick is unreliable on phones)
    const onUp = e => {
      if (e.button > 0) return;
      const now = performance.now();
      if (now - lastUp < 350) { lastUp = 0; cancelSingle?.(); cancelSingle = null; toggleFull(); return; }
      lastUp = now; cancelSingle?.(); cancelSingle = ctx.after(360, toggleSound);
    };
    const onKey = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSound(); } };   // (F is the TV's own full-screen key — not ours)

    function play() {
      if (frame) return;
      frame = youtubeFrame(src, { mute: true, autoplay: true, title: ctx.t('tv_live') });
      frame.className = 'f-tv-frame';
      glass = ctx.el('div', { cls: 'f-tv-glass', attrs: { role: 'button', tabindex: '0', 'aria-label': ctx.t('tv_sound_off') }, on: { pointerup: onUp, keydown: onKey } });
      badge = ctx.el('span', { cls: 'f-tv-badge', attrs: { 'aria-hidden': 'true' } });
      muted = true; paintBadge();
      el.replaceChildren(frame, glass, badge);
      el.classList.add('f-tv-on');
    }
    if (autoplay) play();
    else el.append(ctx.el('button', { cls: 'f-tv-poster', text: ctx.t(v.HOST ? 'tv_poster_host' : 'tv_poster'), attrs: { type: 'button' }, on: { click: play } }));

    // the venue screen goes silent while the ceremony is in quiet mode (vows, rings …) — a staff click turns it back on
    const offLive = ctx.onLive(l => { if (v.HOST && l.quiet && frame && !muted && youtubeCommand(frame, 'mute')) { muted = true; paintBadge(); } });

    return () => {
      offLive(); cancelSingle?.();
      if (fsEl() === el) (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
      anchor.remove(); prop.remove(); el.remove();
    };
  }

  ctx.onSettings(() => build());                          // replays at once, then on every admin change (url · autoplay · phone)
  ctx.onCleanup(() => { cur?.teardown(); cur = null; });

  // phones: a button that brings the camera to the TV (the lake is at the edge of the map)
  v.actions.add({
    key: 'f-tv', icon: '📺', label: ctx.t('tv_action'), order: 35, when: () => !!cur && cur.key !== 'soon',
    onClick: () => v.camFocus(SX + SW / 2, SY + SH / 2, 12),
  });
}

/** frame · posts · light — world pixels, nothing allocated per frame */
function drawSet(g, time) {
  g.fillStyle = '#5b4636'; g.fillRect(SX + 9, SY + SH + 4, 3, 17); g.fillRect(SX + SW - 12, SY + SH + 4, 3, 17);   // posts
  g.fillStyle = '#d8eef8'; const r = Math.sin(time * 2) > 0 ? 1 : 0;
  g.fillRect(SX + 6 - r, SY + SH + 21, 9 + r * 2, 1); g.fillRect(SX + SW - 15 - r, SY + SH + 21, 9 + r * 2, 1);   // ripples
  g.fillStyle = '#2b2033'; g.fillRect(SX - 4, SY - 4, SW + 8, SH + 8);                                                // frame
  g.fillStyle = '#4a4458'; g.fillRect(SX - 3, SY - 3, SW + 6, SH + 6);
  g.fillStyle = '#12101a'; g.fillRect(SX - 1, SY - 1, SW + 2, SH + 2);                                                // the screen behind the video
  g.fillStyle = '#2b2033'; g.fillRect(SX + SW / 2 - 9, SY - 10, 18, 7);                                               // "on air" sign
  g.fillStyle = Math.floor(time * 1.5) % 2 ? '#e8463c' : '#7a2f45'; g.fillRect(SX + SW / 2 - 7, SY - 8, 3, 3);
  g.fillStyle = '#c9c2d4'; g.fillRect(SX + SW / 2 - 2, SY - 8, 9, 1); g.fillRect(SX + SW / 2 - 2, SY - 6, 7, 1);
}

// ---------------------------------------------------------------- admin: ⚙️ settings row
function setupAdmin(ctx) {
  if (!ctx.admin?.settings) return;
  ctx.admin.settings.add({ render(box) {
    const c = { ...DEFAULTS, ...ctx.cfg() };
    const input = ctx.el('input', { cls: 'input f-tv-url', attrs: { type: 'url', inputmode: 'url', maxlength: '200', placeholder: ctx.t('tv_admin_ph'), 'aria-label': ctx.t('tv_admin_url'), value: c.url || '' } });
    const parsed = ctx.el('p', { cls: 'f-tv-parsed' });
    const check = (key, label, on) => {
      const cb = ctx.el('input', { attrs: { type: 'checkbox', 'data-k': key } }); cb.checked = on;
      return { cb, row: ctx.el('label', { cls: 'f-tv-check', kids: [cb, ctx.el('span', { text: label })] }) };
    };
    const auto = check('autoplay', ctx.t('tv_admin_autoplay'), c.autoplay !== false);
    const phone = check('phone', ctx.t('tv_admin_phone'), c.phone !== false);
    const msg = ctx.el('p', { cls: 'f-tv-msg', attrs: { role: 'status' } });
    const preview = ctx.el('div', { cls: 'f-tv-preview' });
    const paintParsed = () => {
      const s = input.value.trim(), src = youtubeSource(s);
      parsed.textContent = !s ? ctx.t('tv_admin_empty') : src ? (src.video ? ctx.t('tv_admin_ok_video', { id: src.video }) : ctx.t('tv_admin_ok_channel')) : ctx.t('tv_admin_bad');
      parsed.dataset.ok = String(!s || !!src);
      showPrev.disabled = !src;
    };
    const showPrev = ctx.el('button', { cls: 'px-btn small secondary f-tv-prev', text: ctx.t('tv_admin_preview'), attrs: { type: 'button' }, on: { click: () => {
      const src = youtubeSource(input.value.trim()); if (!src) return;
      const f = youtubeFrame(src, { mute: true, autoplay: false, title: ctx.t('tv_admin_preview') }); f.className = 'f-tv-prevframe';
      preview.replaceChildren(f);
    } } });
    const save = ctx.el('button', { cls: 'px-btn small f-tv-save', text: ctx.t('tv_admin_save'), attrs: { type: 'button' }, on: { click: () => {
      const s = input.value.trim();
      if (s && !youtubeSource(s)) { msg.textContent = ctx.t('tv_admin_bad'); return; }
      save.disabled = true; msg.textContent = '';
      ctx.admin.saveCfg({ url: s, autoplay: auto.cb.checked, phone: phone.cb.checked })
        .then(ctx.guard(() => { msg.textContent = ctx.t('tv_admin_saved'); }), ctx.guard(e => { msg.textContent = ctx.t('tv_admin_fail', { e: e?.code || e?.message || '?' }); }))
        .finally(() => { save.disabled = false; });
    } } });
    ctx.listen(input, 'input', paintParsed);
    box.append(
      ctx.el('label', { cls: 'f-tv-field', kids: [ctx.el('b', { text: ctx.t('tv_admin_url') }), input] }), parsed,
      auto.row, phone.row,
      ctx.el('div', { cls: 'f-tv-row', kids: [save, showPrev] }), msg,
      ctx.el('p', { cls: 'f-tv-when', text: ctx.t('tv_admin_when') }), preview,
    );
    paintParsed();
  } });
}

// ============================================================
//  _selftest — 하객·키오스크 부분 (WP-00c §6): ctx.guest 의 모든 API 를 한 번씩 씁니다. 데모 전용.
//  각 사용처에 data-st="<항목>" 표식을 남겨 tests/suites/core-extension.mjs 가 찾습니다. 모든 DOM 은 ctx.el 로만 만듭니다.
// ============================================================
import D from './i18n.js';

/** payload 를 짧게 (아바타 같은 큰 값은 빼고) — 배지의 data-ev 에 JSON 으로 남깁니다 */
const slim = p => (p && typeof p === 'object' ? JSON.parse(JSON.stringify(p, (k, v) => (k === 'avatar' ? !!v : v))) : p ?? null);

export function guestPart(ctx, badge) {
  const g = ctx.guest;
  const st = new Set((new URLSearchParams(location.search).get('st') || '').split(',').filter(Boolean));   // 데모 전용 시험 장치 (?st=coupleSprites …)
  const btn = (st2, text, fn) => ctx.el('button', { cls: 'px-btn small f-_selftest-btn', text, attrs: { type: 'button', 'data-st': st2 }, on: { click: fn } });

  // ---- 버스: 받은 횟수와 마지막 값을 배지의 data-ev 에 (A10: ctx.texts 는 lang 을 내지 않음 · A11: reset 순서) ----
  const log = {};
  const flush = () => { badge.dataset.ev = JSON.stringify(log); };
  for (const type of ['lang', 'guest:screen', 'guest:mine', 'guest:submitted', 'guest:simple', 'guest:reset', 'remote:sent', 'snap:uploaded']) {
    ctx.bus.on(type, p => { const e = log[type] || (log[type] = { n: 0 }); e.n++; e.last = slim(p); flush(); });
  }
  ctx.bus.on('guest:screen', p => { badge.dataset.replayScreen = JSON.stringify(slim(p)); }, { replay: true });   // 스티키 replay 가 동기로 오는지
  badge.dataset.boot = JSON.stringify({ mine: slim(ctx.bus.last('guest:mine')), simple: slim(ctx.bus.last('guest:simple')), lang: slim(ctx.bus.last('lang')) });

  // ---- 문구 덮어쓰기 (A10): 코어 환영 문구 → 화면이 바로 다시 그려지고, 끄면 원문 ----
  ctx.texts({ ko: { welcome_sub: D.ko._selftest_welcome_sub }, en: { welcome_sub: D.en._selftest_welcome_sub } });

  // ---- 환영 슬롯 ----
  g.welcome.add(ctx.el('div', {
    cls: 'px-box f-_selftest-welcome', attrs: { 'data-st': 'welcome' },
    kids: [ctx.el('span', { text: ctx.t('_selftest_welcome') }), btn('welcome-go', ctx.t('_selftest_welcome_go'), () => g.go('f-_selftest'))],
  }), { order: 10 });

  // ---- 기능 화면 ----
  let cardOn = true, entered = 0, left = 0;
  const info = ctx.el('p', { cls: 'tip f-_selftest-info', attrs: { 'data-st': 'screen-info' } });
  const paintInfo = () => {
    info.textContent = JSON.stringify({ screen: g.screen(), me: g.me(), simple: g.simple(), kiosk: g.kiosk, village: g.villageUrl(), left: g.snapsLeft('f-_selftest-none'), entered, leftN: left });
  };
  g.screens.add('f-_selftest', {
    render: s => s.append(
      ctx.el('div', { cls: 'px-box card', kids: [ctx.el('h2', { text: ctx.t('_selftest_screen_title'), attrs: { 'data-st': 'screen-title' } }), info] }),
      ctx.el('div', { cls: 'sticky-foot', kids: [ctx.el('div', { cls: 'f-_selftest-bar', kids: [
        btn('screen-back', ctx.t('_selftest_back'), () => g.back()),
        btn('screen-reset', ctx.t('_selftest_reset'), () => g.reset()),
        btn('screen-toast', ctx.t('_selftest_toast'), () => g.toast('selftest toast', 1500)),
        btn('screen-remember', ctx.t('_selftest_remember'), () => { g.remember({ id: 'st_gid', name: '점검' }); paintInfo(); }),
        btn('screen-mine', ctx.t('_selftest_mine'), () => g.openMine()),
        btn('screen-toggle', ctx.t('_selftest_toggle'), () => { cardOn = !cardOn; g.hub.refresh(); }),
      ] })] }),
    ),
    onEnter: () => { entered++; badge.dataset.screenEnter = String(entered); paintInfo(); },
    onLeave: () => { left++; badge.dataset.screenLeave = String(left); },
  });

  // ---- 허브: 한 줄 행(order 60) + 펼친 카드(order 55) — when() 은 screen-toggle 이 바꾸고 hub.refresh() 로 다시 판정 ----
  g.hub.add({
    key: 'f-_selftest', order: 60, size: 'row', icon: '🧪', title: () => ctx.t('_selftest_hub_row'),
    onClick: who => { badge.dataset.hubClick = JSON.stringify(who); g.go('f-_selftest'); },
  });
  g.hub.add({
    key: 'f-_selftest-card', order: 55, size: 'card', title: ctx.t('_selftest_hub_card'),
    when: () => cardOn,
    render: (box, who) => {
      const snapHost = ctx.el('div', { cls: 'snapbox px-box', attrs: { 'data-st': 'hub-snap' } });
      const out = ctx.el('p', { cls: 'tip', attrs: { 'data-st': 'hub-card-out' } });
      box.append(
        ctx.el('b', { text: ctx.t('_selftest_hub_card'), attrs: { 'data-st': 'hub-card-title' } }),
        ctx.el('p', { cls: 'tip', text: JSON.stringify(who), attrs: { 'data-st': 'hub-card-who' } }),
        btn('hub-upload', ctx.t('_selftest_upload'), () => {
          const c = document.createElement('canvas'); c.width = c.height = 8;
          c.getContext('2d').fillRect(0, 0, 8, 8);
          g.uploadSnap({ gid: who.gid, name: who.name, dataURL: c.toDataURL('image/jpeg', 0.8), caption: 'selftest' })
            .then(ctx.guard(r => { out.textContent = JSON.stringify({ ok: r, left: g.snapsLeft(who.gid) }); }), ctx.guard(e => { out.textContent = JSON.stringify({ error: e.code || String(e.message) }); }));
        }),
        out, snapHost,
      );
      g.mountSnapUploader(snapHost, { gid: who.gid, name: who.name, onUploaded: () => { out.dataset.mounted = '1'; } });
    },
  });

  // ---- 한 기능 전용 (?st=coupleSprites): 환영 무대의 신랑·신부를 점검용 그림으로 ----
  if (st.has('coupleSprites')) {
    const mk = color => { const c = document.createElement('canvas'); c.width = 24; c.height = 36; const x = c.getContext('2d'); x.fillStyle = color; x.fillRect(4, 2, 16, 32); return c; };
    const frames = color => { const c = mk(color); return { idle: c, blink: c, wave: c }; };
    g.setCoupleSprites(frames('#00aa66'), frames('#aa3300'));
    badge.dataset.stCouple = '1';
  }
}

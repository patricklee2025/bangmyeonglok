// ============================================================
//  _selftest — 코어 자체 점검용 기능 (데모 전용, 영원히 planned · 켜기: ?ff=_selftest)
//  WP-00b 최소판: **공통 ctx API 만** 씁니다 — 로더·자동 정리·서킷 브레이커 검증용 (tests/suites/core-units.mjs).
//  WP-00c: 페이지 API(ctx.guest / ctx.v / ctx.admin)·한 기능 전용 API·gate 를 쓰는 부분이 페이지마다 따로 붙습니다 (WP-00c §6).
// ============================================================
import D from './i18n.js';
import { guestPart } from './guest.js';
import { adminPart } from './admin.js';
import { villagePart } from './village.js';

export const i18n = D;
export const css = true;

export async function setup(ctx) {
  // 눈에 안 보이는 표식 노드 (style.css 가 display:none) — 테스트는 data-st 로 찾습니다
  const badge = ctx.el('div', { cls: 'f-_selftest-badge', text: ctx.t('_selftest_badge'), attrs: { 'data-st': 'badge', 'data-page': ctx.page } });
  document.body.appendChild(badge);

  ctx.rootClass('on');                                                                   // <html class="f-_selftest-on">

  let ticks = 0;
  ctx.every(200, () => { badge.dataset.ticks = String(++ticks); });                      // 타이머 (guard 됨 — fcrash 가 여기서 터짐)
  ctx.listen(window, 'resize', () => { badge.dataset.resized = '1'; });                   // 리스너
  ctx.bus.on('settings', s => { badge.dataset.flags = String(Object.keys(s.features).length); }, { replay: true });   // 버스 구독 (replay)
  const stop = ctx.raf(() => { badge.dataset.raf = '1'; stop(); });                      // 한 프레임만 쓰고 스스로 해제
  ctx.db.doc('app/settings').watch(() => { badge.dataset.db = '1'; }, () => {});          // 문서 구독 (자동 해제)

  // 코어 문구 덮어쓰기 경로 (눈에 보이는 코어 문구는 건드리지 않고 자기 키만 덮어씀)
  ctx.texts({ ko: { _selftest_probe: '덮어쓴 점검 문구' }, en: { _selftest_probe: 'overridden probe text' } });

  // 페이지 API 는 페이지가 있을 때만 (ctx.guest = guest·kiosk · ctx.v = village · ctx.admin = admin)
  if (ctx.guest?.screens) guestPart(ctx, badge);          // (the 00b loader tests hand out a bare { id } as ctx.guest — no real page behind it)
  if (ctx.admin?.tabs) adminPart(ctx, badge);
  if (ctx.v?.hud) villagePart(ctx, badge);

  // gate (WP-00c A13): ?st=gate 이면 이 기능이 gate 기능이 되고(데모 전용), 마을 쪽 setup 이 2초 걸린다고 가정합니다 —
  // 마을의 첫 village:guests 는 이 대기가 끝난 뒤에 나와야 합니다 (끝난 시각이 배지의 data-gate-done).
  if (ctx.page === 'village' && new URLSearchParams(location.search).get('st')?.split(',').includes('gate')) {
    badge.dataset.gateStart = String(Math.round(performance.now()));
    await new Promise(r => setTimeout(r, 2000));
    badge.dataset.gateDone = String(Math.round(performance.now()));
  }
}

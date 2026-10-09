// ============================================================
//  WP-13 · 📶 오프라인 대비 (offline) — docs/v4/wp/WP-13-offline.md
//  서비스워커(public/sw.js) 등록 → ctx.markOffHook() (기능을 끄면 off.js 가 해제·캐시 삭제).
//  등록 조건: 실서버(데모·localhost 아님) — 단 ?sw=1 이면 어디서나 (시험·개발). ?nosw=1 = 이 기기에서 바로 해제 + 캐시 삭제.
//  인터넷 끊김/복귀 안내: 하객·키오스크 = 토스트, 폰 마을 = 작은 배너, TV·관리자 = 없음 (코어 연결 배너가 있음).
// ============================================================
import D from './i18n.js';
import { off as removeAll } from './off.js';

export const i18n = D;

const LOCAL = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\])$/;

export async function setup(ctx) {
  const qs = new URLSearchParams(location.search);
  const say = sayer(ctx);
  if (qs.get('nosw') === '1') {                                     // emergency switch for one device
    removeAll().then(ctx.guard(() => say(ctx.t('offline_removed'))), e => ctx.log('nosw', e?.message || e));
    return;
  }
  const want = qs.get('sw') === '1' || (!ctx.demo && !LOCAL.test(location.hostname));
  if (want && 'serviceWorker' in navigator) {
    const first = !navigator.serviceWorker.controller;
    navigator.serviceWorker.register('sw.js').then(ctx.guard(reg => {
      ctx.markOffHook();
      if (!first || (ctx.page !== 'guest' && ctx.page !== 'kiosk')) return;
      const w = reg.installing || reg.waiting;
      const done = () => { if (readyShown()) return; say(ctx.t('offline_ready')); };
      if (!w) return void (reg.active && done());
      ctx.listen(w, 'statechange', () => { if (w.state === 'activated') done(); });
    }), e => ctx.log('register', e?.message || e));                 // private mode, no storage …: as if the feature were not there
  }
  ctx.listen(window, 'offline', () => say(ctx.t('offline_now')));
  ctx.listen(window, 'online', () => say(ctx.t('offline_back')));
  ctx.after(300, () => { if (navigator.onLine === false) say(ctx.t('offline_now')); });   // opened while already offline (from the saved shell)
}

/** where a short notice goes on this page (null = nowhere) */
function sayer(ctx) {
  if (ctx.guest?.toast) return msg => ctx.guest.toast(msg, 5000);
  if (ctx.page === 'village' && ctx.v && !ctx.v.HOST) return msg => ctx.v.banner(msg, { kind: 'small' });
  return () => {};
}
/** "ready to work offline" is said once per device: true if it was said before (and remembers it now) */
function readyShown() {
  try { if (localStorage.getItem('wgb_f_offline_ready')) return true; localStorage.setItem('wgb_f_offline_ready', '1'); } catch {}
  return false;
}

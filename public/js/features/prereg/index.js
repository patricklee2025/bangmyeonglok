// ============================================================
//  WP-01 · 🎟 사전 입주 · 체크인 · 입장권 (prereg) — docs/v4/wp/WP-01-prereg.md
//  결혼식 전: 하객이 캐릭터를 미리 만들어 두고(입주) 픽셀 입장권을 받음 → 결혼식 날 체크인하는 순간 TV 마을 문으로 입장.
//  gate 기능: 마을은 첫 동기화 전에 village 부분의 setup(체크인 첫 스냅샷 대기, 최대 1.5초)을 기다림 (02 §2.2).
// ============================================================
import D from './i18n.js';
import { setupGuest } from './guest.js';
import { setupVillage } from './village.js';
import { setupAdmin } from './admin.js';

export const i18n = D;
export const css = true;

export async function setup(ctx) {
  if (ctx.page === 'village') return setupVillage(ctx);
  if (ctx.page === 'admin') return setupAdmin(ctx);
  return setupGuest(ctx);                                // 'guest' | 'kiosk'
}

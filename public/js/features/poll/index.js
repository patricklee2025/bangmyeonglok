// ============================================================
//  WP-10 · 🗳 실시간 투표 (poll) — docs/v4/wp/WP-10-poll.md
//  관리자가 투표를 열면 하객 폰에 카드(허브 order 50) · 폰 마을 🗳 시트, TV 오른쪽(rm)에 실시간 막대 → 닫고 발표 → 결과 배너
//  데이터: polls/{pid}(관리자) · votes/{pid}_{gid}(하객) · app/live.poll
// ============================================================
import D from './i18n.js';
import { setupGuest } from './guest.js';
import { setupVillage } from './village.js';
import { setupAdmin } from './admin.js';

export const i18n = D;
export const css = true;

export async function setup(ctx) {
  if (ctx.page === 'admin') return setupAdmin(ctx);
  if (ctx.page === 'village') return setupVillage(ctx);
  return setupGuest(ctx);
}

// ============================================================
//  WP-09 · 🎯 양가 섞이기 빙고 (bingo) — docs/v4/wp/WP-09-bingo.md
//  신랑측·신부측 하객이 서로 말을 걸게 만드는 4×4 빙고. 같은 하객 = 늘 같은 카드. 줄 완성 → TV 배너 · 왕관 · 순위
//  데이터: bingo/{gid} (하객 본인 · done 은 늘기만) · guests 읽기(코드 확인)
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

// ============================================================
//  WP-08 온도계 — 점수 공식 (순수 함수, 시험이 직접 부름)
// ============================================================
export const MILESTONES = [50, 70, 85, 100];
export const WEIGHTS = { guests: 10, snaps: 5, emotes: 1, lines: 3, votes: 2 };

/** cfg.meter.target, or the formula for the expected guest count E (default 50 → 1,690) */
export function targetOf(cfg) {
  const t = Number(cfg?.target);
  if (cfg?.target !== null && cfg?.target !== '' && Number.isFinite(t) && t > 0) return Math.round(t);
  const e = Number(cfg?.expected), E = Number.isFinite(e) && e > 0 ? e : 50;
  return Math.max(1, Math.round(10 * E + 5 * 2 * E + 1 * 6 * E + 3 * 0.6 * E + 2 * 3 * E));
}
export const scoreOf = n => WEIGHTS.guests * (n.guests || 0) + WEIGHTS.snaps * (n.snaps || 0) + WEIGHTS.emotes * (n.emotes || 0) + WEIGHTS.lines * (n.lines || 0) + WEIGHTS.votes * (n.votes || 0);
/** score → { pct 0–1, temp 36.5–100 } */
export function tempOf(score, target) {
  const pct = Math.min(1, Math.max(0, target > 0 ? score / target : 0));
  return { pct, temp: 36.5 + pct * 63.5 };
}
/** what the TV shows: one decimal (100% = 100.0) */
export const fmt = temp => (Math.round(temp * 10) / 10).toFixed(1);

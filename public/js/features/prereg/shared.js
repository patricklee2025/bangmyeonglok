// WP-01 — guest · kiosk · village · admin 가 같이 쓰는 작은 도우미 (상태 없음 — 모듈 최상위는 정의만)
import { CONFIG } from '../../config.js';
import { liveWindow } from '../../core/phase.js';

export const VIAS = ['phone', 'kiosk', 'entrance', 'admin'];
const SIDES = ['groom', 'bride', 'both'];

/** 본식 날(live) 시작 시각 — 그 전에 쓴 방명록 = 사전 입주 */
export const liveStart = () => liveWindow(CONFIG.schedule).start;
export const isPre = g => Number(g?.createdAt) > 0 && Number(g.createdAt) < liveStart();
export const sideOf = g => (SIDES.includes(g?.side) ? g.side : 'both');

/** 출석 판정의 "현장 등록" 기준 시각 (§3) — 페이즈가 강제(?phase= · 관리자)면 리허설: 지금 - 12시간 */
export function walkInSince(ctx) {
  const src = ctx.bus.last('phase')?.source;
  return src && src !== 'auto' ? Date.now() - 12 * 3600e3 : liveStart();
}

/** 사이트 주소 (청첩장 · 입장권 QR · 입구 포스터) — config.guestUrl 이 있으면 그것, 없으면 지금 페이지가 있는 폴더 */
export function siteBase(ctx) {
  const base = CONFIG.guestUrl || new URL('./', location.href).href;
  return base + (ctx.demo && new URLSearchParams(location.search).get('demo') === '1' ? '?demo=1' : '');
}
export const inviteUrl = ctx => siteBase(ctx);
export const checkinUrl = ctx => siteBase(ctx) + '#checkin';
/** 다른 폰에서 열면 그 하객으로 기억 (코어 #me= 처리 — 키오스크 이어하기 QR과 같음) */
export const meUrl = (ctx, gid, name) => siteBase(ctx) + '#me=' + encodeURIComponent(gid) + '&n=' + encodeURIComponent(name || '');

/** 본식 시각 'HH:MM' (관리자 설정) → 유효하면 그대로, 아니면 '' */
export function ceremonyTime(ctx) {
  const t = String(ctx.cfg()?.time ?? '').trim();
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(t) ? t : '';
}
/** 본식 시작 ms (식장 현지 시각) · 시각이 없으면 null */
export function ceremonyStart(ctx) {
  const t = ceremonyTime(ctx);
  return t ? Date.parse(`${CONFIG.schedule.weddingDate}T${t}:00${CONFIG.schedule.utcOffset}`) : null;
}

const DOW = { ko: ['일', '월', '화', '수', '목', '금', '토'], en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] };
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** 입장권 날짜 줄: ko '2027.04.10 (토) 17:00' · en 'Sat, Apr 10, 2027 · 5:00 PM' (시각 없으면 날짜만) */
export function dateLine(ctx, lang) {
  const [y, m, d] = CONFIG.schedule.weddingDate.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(), t = ceremonyTime(ctx);
  if (lang === 'en') {
    let s = `${DOW.en[dow]}, ${MON[m - 1]} ${d}, ${y}`;
    if (t) { const [hh, mm] = t.split(':').map(Number); s += ` · ${((hh + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'AM' : 'PM'}`; }
    return s;
  }
  return `${y}.${String(m).padStart(2, '0')}.${String(d).padStart(2, '0')} (${DOW.ko[dow]})${t ? ' ' + t : ''}`;
}
/** 식장 줄 (이름 · 주소, 있는 것만) */
export const venueLine = () => [CONFIG.couple.venueName, CONFIG.couple.venueAddress || CONFIG.couple.venue].filter(Boolean).join(' · ');
export const coupleNames = lang => ({ groom: CONFIG.couple.groom[lang === 'en' ? 'en' : 'ko'], bride: CONFIG.couple.bride[lang === 'en' ? 'en' : 'ko'] });

/**
 * 체크인 쓰기 (§7): 이미 있으면 'already' · 2.5초 안에 서버 확인이 없으면 'queued'(오프라인 — Firestore 가 다시 보냄) · 아니면 'ok'.
 * 문서를 먼저 읽고(1회) 없을 때만 set — 규칙은 덮어쓰기(update)를 막으므로 두 번째 체크인도 서버에서 거절됩니다.
 */
export async function writeCheckin(ctx, gid, via) {
  const ref = ctx.db.doc('checkins/' + gid);
  const have = await Promise.race([ref.get().catch(() => null), new Promise(r => setTimeout(() => r(undefined), 2500))]);
  if (have) return 'already';
  const write = ref.set({ via: VIAS.includes(via) ? via : 'phone', createdAt: ctx.db.ts() });
  const res = await Promise.race([write.then(() => 'ok', e => (e?.code === 'permission-denied' ? 'already' : Promise.reject(e))), new Promise(r => setTimeout(() => r('queued'), 2500))]);
  if (res === 'queued') write.catch(() => {});
  return res;
}

/** 이름 찾기용 정규화: 공백·대소문자 무시 */
export const norm = s => String(s ?? '').toLowerCase().replace(/\s+/g, '');

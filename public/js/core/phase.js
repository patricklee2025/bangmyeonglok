// ============================================================
//  core/phase.js — 결혼식 페이즈 (docs/v4/03-data-and-rules.md §1, 02-contracts.md §10)
//
//    pre → live → after → (매년 기념일 주간) anniversary → after …
//
//  결정 순서:  ?phase=<값> (탭 기억 sessionStorage 'wgb_phase', ?phase=auto 로 해제)
//             > settings.phase (관리자 비상 강제, 'auto' 가 아니면)
//             > 시계 자동 = phaseAt(now, CONFIG.schedule)
//  <html data-phase="…"> 를 설정하고, 바뀔 때만 버스에 'phase' 를 냅니다.
// ============================================================
import { CONFIG } from '../config.js';
import * as bus from './bus.js';

export const PHASES = ['pre', 'live', 'after', 'anniversary'];

const pad2 = n => String(n).padStart(2, '0');
const DAY = 86400e3;

/** '-04:00' · '+0900' · 'Z' → 밀리초 (UTC 기준 오프셋). 형식이 틀리면 NaN. */
function offsetMs(utcOffset) {
  const s = String(utcOffset ?? '').trim();
  if (s === 'Z') return 0;
  const m = /^([+-])(\d{2}):?(\d{2})$/.exec(s);
  return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) * 60e3 : NaN;
}

/** 본식 시간대(live)의 [시작, 끝) 밀리초. 03 §1: 당일 liveStartHour 시부터 liveHours 시간. */
export function liveWindow(schedule = CONFIG.schedule) {
  const s = schedule;
  const start = Date.parse(`${s.weddingDate}T${pad2(s.liveStartHour)}:00:00${s.utcOffset}`);
  return { start, end: start + s.liveHours * 3600e3 };
}

/**
 * 순수 함수 — 시각(ms)과 일정으로 페이즈를 계산합니다. 경계값은 단위 테스트(core-units)로 고정.
 *   now <  liveStart → 'pre' · now < liveEnd → 'live'
 *   어떤 해 k≥1 의 기념일 00:00(식장 현지) ~ +anniversaryDays 일 → 'anniversary' · 그 외 → 'after'
 * 일정이 잘못돼 계산할 수 없으면 'pre' (가장 보수적인 화면) — 정적 테스트가 CONFIG.schedule 형식을 따로 검사합니다.
 */
export function phaseAt(nowMs, schedule = CONFIG.schedule) {
  const s = schedule;
  const { start, end } = liveWindow(s);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 'pre';
  if (nowMs < start) return 'pre';
  if (nowMs < end) return 'live';

  const off = offsetMs(s.utcOffset);
  const [Y, M, D] = String(s.weddingDate).split('-').map(Number);
  if (!Number.isFinite(off) || !Y || !M || !D) return 'after';
  const span = s.anniversaryDays * DAY;
  const yearNow = new Date(nowMs + off).getUTCFullYear();             // 식장 현지 달력의 올해
  for (let y = yearNow - 1; y <= yearNow; y++) {                      // 12월 말 결혼식은 창이 새해로 넘어갈 수 있어 작년 것도 확인
    if (y - Y < 1) continue;                                          // k ≥ 1 (첫 기념일부터)
    const annStart = Date.UTC(y, M - 1, D) - off;                     // 그해 기념일 00:00 (식장 현지). 2/29 는 평년에 3/1 로 넘어감
    if (nowMs >= annStart && nowMs < annStart + span) return 'anniversary';
  }
  return 'after';
}

/** ?phase= → 유효한 페이즈 또는 null. 탭 안에서 기억(sessionStorage 'wgb_phase'), ?phase=auto 로 기억 삭제, 잘못된 값은 무시. */
export function urlPhase() {
  let q = null;
  try { q = new URLSearchParams(location.search).get('phase'); } catch {}
  try {
    if (q === 'auto') { sessionStorage.removeItem('wgb_phase'); return null; }
    if (PHASES.includes(q)) { sessionStorage.setItem('wgb_phase', q); return q; }
    const kept = sessionStorage.getItem('wgb_phase');
    return PHASES.includes(kept) ? kept : null;
  } catch { return PHASES.includes(q) ? q : null; }                   // 저장소를 못 쓰는 환경: 이번 주소의 값만
}

/** 순수 함수 — url(urlPhase 결과 또는 null) > settings.phase > 시계. */
export function resolvePhase({ now = Date.now(), settings = null, url = null, schedule = CONFIG.schedule } = {}) {
  if (PHASES.includes(url)) return { phase: url, source: 'url' };
  if (PHASES.includes(settings?.phase)) return { phase: settings.phase, source: 'admin' };
  return { phase: phaseAt(now, schedule), source: 'auto' };
}

let started = false, current = null, fromUrl = null;

function recompute(force = false) {
  const r = resolvePhase({ now: Date.now(), settings: bus.last('settings'), url: fromUrl });
  if (!force && current && current.phase === r.phase && current.source === r.source) return;   // 바뀔 때만
  current = r;
  try { document.documentElement.dataset.phase = r.phase; } catch {}
  bus.emit('phase', { phase: r.phase, source: r.source });
}

/** 한 번만 시작: 계산 → <html data-phase> → emit('phase'). 이후 30초마다와 'settings' 가 올 때마다 다시 계산. */
export function startPhase() {
  if (started) return;
  started = true;
  fromUrl = urlPhase();
  if (!Number.isFinite(liveWindow().start)) console.error('[phase] CONFIG.schedule is invalid — falling back to "pre"');
  recompute(true);
  bus.on('settings', () => recompute());
  setInterval(() => recompute(), 30000);
}

/** 지금 페이즈 (startPhase 전이면 시계 기준으로 즉석 계산). */
export function currentPhase() { return current ? current.phase : phaseAt(Date.now(), CONFIG.schedule); }

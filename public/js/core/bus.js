// ============================================================
//  core/bus.js — 기기(탭) 안에서만 흐르는 동기 이벤트 버스 (docs/v4/02-contracts.md §5)
//
//  · emit() 은 동기 호출입니다. 핸들러마다 try/catch → 한 핸들러의 오류가 다른 핸들러를 멈추지 않습니다.
//  · 스티키(STICKY) 이벤트는 마지막 값을 기억하고, on(type, fn, { replay: true }) 이면 등록 즉시(동기) 1번 받습니다.
//  · owner(기능 id)로 등록한 구독은 offOwner(owner) 한 번으로 전부 해제됩니다 (기능 dispose).
//  · 이 모듈은 기능(features/*)이 직접 import 하지 않습니다 — 기능은 ctx.bus 를 씁니다 (02 §1.1).
// ============================================================

/** 스티키 이벤트 = 02 §5 표의 ✓. 마지막 값이 저장되고 replay 로 바로 받을 수 있습니다. */
export const STICKY = new Set([
  'phase', 'settings', 'live', 'lang',
  'guest:screen', 'guest:mine', 'guest:simple',
  'village:ready', 'village:guests', 'village:level', 'village:snaps',
  'admin:guests', 'admin:tab',
  'couple:sprites', 'bgm:state', 'live:cue',
]);

const subs = new Map();      // type → Set<entry>
const byOwner = new Map();   // owner → Set<entry>
const lastValue = new Map(); // 스티키 type → 마지막 payload
let reporter = null;

/** 오류 보고자 등록 — fn(owner, error, type). features.js 가 서킷 브레이커 집계용으로 등록합니다. */
export function setErrorReporter(fn) { reporter = typeof fn === 'function' ? fn : null; }

function fail(entry, type, err) {
  if (entry.owner && reporter) {
    try { reporter(entry.owner, err, type); return; } catch (e2) { console.error('[bus] reporter threw', e2); }
  }
  console.error('[bus]', type, err);
}

function call(entry, type, payload) {
  try { entry.fn(payload); } catch (err) { fail(entry, type, err); }
}

/**
 * 구독. 반환값 off() 는 여러 번 불러도 안전합니다.
 * @param {string} type
 * @param {(payload:any)=>void} fn
 * @param {{ replay?: boolean, owner?: string|null }} [opts]
 */
export function on(type, fn, { replay = false, owner = null } = {}) {
  if (typeof fn !== 'function') throw new TypeError('bus.on: fn must be a function');
  const entry = { type, fn, owner, dead: false };
  let set = subs.get(type); if (!set) subs.set(type, set = new Set());
  set.add(entry);
  if (owner) { let o = byOwner.get(owner); if (!o) byOwner.set(owner, o = new Set()); o.add(entry); }
  if (replay && STICKY.has(type) && lastValue.has(type)) call(entry, type, lastValue.get(type));   // 동기 (마이크로태스크 아님)
  return () => drop(entry);
}

function drop(entry) {
  if (entry.dead) return;
  entry.dead = true;
  const set = subs.get(entry.type); if (set) { set.delete(entry); if (!set.size) subs.delete(entry.type); }
  if (entry.owner) { const o = byOwner.get(entry.owner); if (o) { o.delete(entry); if (!o.size) byOwner.delete(entry.owner); } }
}

/**
 * 발행. 구독 목록을 복사한 뒤 순회하므로 핸들러 안에서 on/off/emit 을 해도 안전합니다.
 * 순회 중에 해제된 구독(dead)은 건너뜁니다 — dispose 된 기능의 핸들러가 이어서 불리지 않게.
 */
export function emit(type, payload) {
  if (STICKY.has(type)) lastValue.set(type, payload);
  const set = subs.get(type); if (!set) return;
  for (const entry of [...set]) if (!entry.dead) call(entry, type, payload);
}

/** 스티키 이벤트의 마지막 값 (없으면 undefined). */
export function last(type) { return lastValue.get(type); }

/** 이 owner(기능)의 구독을 전부 해제. */
export function offOwner(owner) {
  const o = byOwner.get(owner); if (!o) return;
  for (const entry of [...o]) drop(entry);
}

/** 진단용: 살아 있는 구독 수 (owner 를 주면 그 owner 것만). 테스트(A7)가 "핫 토글 후 구독 0"을 확인하는 데 씁니다. */
export function count(owner) {
  if (owner !== undefined) return byOwner.get(owner)?.size || 0;
  let n = 0; for (const set of subs.values()) n += set.size;
  return n;
}

// ============================================================
//  core/features.js — 기능 로더 · 켜짐 판정 · 핫 토글 · 서킷 브레이커 · ctx 만들기
//  (docs/v4/02-contracts.md §2–§4 · WP-00b §4.6)
//
//  페이지 부팅 코드는 bootFeatures(page, pageApi) 를 1번 부릅니다 (기다리지 않아도 됨 — 실패해도 코어는 계속 동작).
//    1. startPhase() · startSettings() 를 시작하고, 설정 문서의 첫 값(또는 2초 기본값)이 오면 처음 판정합니다.
//    2. 판정(resolveEnabled)이 켜진 기능만 import → i18n 등록 → style.css 붙이기 → setup(ctx) (3초 제한).
//    3. 'settings' · 'phase' 가 올 때마다 다시 판정하고, 바뀐 기능만 핫 토글(dispose / setup) 합니다.
//    4. ctx 로 등록한 모든 것은 dispose 때 자동으로 풀립니다. 기능이 만든 콜백의 오류는 기능별로 집계 —
//       60초 안에 5번이면 서킷 브레이커가 그 기능만 이번 세션 동안 끕니다.
//  페이지가 제공하는 부분(ctx.guest / ctx.v / ctx.admin)은 pageApi.forFeature(scope) 가 돌려줍니다 (WP-00c).
//  기능은 이 파일을 import 하지 않습니다 — 기능은 ctx 만 씁니다 (02 §1.1).
// ============================================================
import { DEMO } from '../config.js';
import * as bus from './bus.js';
import { startPhase, currentPhase } from './phase.js';
import { startSettings, settingsArrived, getSettings, getLive } from './settings.js';
import { docdb, ts, inc } from './docdb.js';
import { addStrings, removeStrings, overrideStrings, t, getLang } from '../i18n.js';
import { getStore } from '../store.js';
import { FEATURES } from '../features/index.js';

export const SETUP_TIMEOUT_MS = 3000;          // 02 §3 규칙 1
const LOAD_TIMEOUT_MS = 10000;                 // import() 가 끝내 안 끝나는 경우 (네트워크)
const CSS_TIMEOUT_MS = 2000;                   // WP-00b §4.6 — onload/onerror 까지 최대 2초
const OFF_HOOK_TIMEOUT_MS = 3000;
const BREAKER_WINDOW_MS = 60000, BREAKER_LIMIT = 5;
const PAGES = ['guest', 'kiosk', 'village', 'admin'];
/** 한 기능만 쓸 수 있는 자리 (02 §7.8) — scope.claim(slot) */
export const SLOTS = ['presence', 'tickerExtra', 'tickerPrefix', 'coupleSprites'];
/** 02 §5 표의 "기능이 내는" 이벤트 → 그 이벤트를 낼 수 있는 기능. 그 밖에는 `<id>:…` 만 낼 수 있습니다. */
export const EVENT_OWNERS = {
  'checkin:done': 'prereg', 'couple:sprites': 'couple', 'bgm:state': 'bgm', 'poll:result': 'poll',
  'live:cue': 'live', 'vote:cast': 'poll', 'bingo:line': 'bingo', 'meter:milestone': 'meter',
};

const FF_ID = /^_?[a-z][a-z0-9]{1,15}$/;
/** import() 가 파일을 못 찾았을 때 브라우저들이 내는 메시지 (Chrome · Firefox · Safari) */
const MISSING_MODULE = /dynamically imported module|Importing a module script failed/i;
const noop = () => {};
const isObj = v => v !== null && typeof v === 'object';
const coded = (code, message) => Object.assign(new Error(message), { code });

// ============================================================
//  ① 순수 부분 — ?ff= 읽기 · 켜짐 판정
// ============================================================

/**
 * ?ff= 문법 (02 §2.2):  poll,bingo 켜기 · -bgm 끄기 · all (전부 켜기, `_` 로 시작하는 id 제외) · none (전부 끄기) · 빈 값 = 탭 기억 삭제.
 * 값은 탭 안에서 sessionStorage['wgb_ff'] 에 기억해서 페이지를 옮겨도 유지됩니다. 주소에 ff 가 없으면 기억한 값을 씁니다.
 * `+poll` 도 켜기입니다 (주소에서 + 는 공백이 되므로 앞뒤 공백은 무시). 모르는 토큰은 버립니다.
 * @returns {{ all: boolean, none: boolean, on: Set<string>, off: Set<string> }}
 */
export function parseFF(search = '', storage) {
  let st = storage;
  if (st === undefined) { try { st = sessionStorage; } catch { st = null; } }
  let raw = null;
  try { raw = new URLSearchParams(search).get('ff'); } catch { raw = null; }
  try {
    if (raw !== null) {
      if (raw.trim() === '') { st?.removeItem('wgb_ff'); raw = ''; }
      else st?.setItem('wgb_ff', raw);
    } else raw = st?.getItem('wgb_ff') ?? '';
  } catch { raw = raw ?? ''; }
  const out = { all: false, none: false, on: new Set(), off: new Set() };
  for (let tok of String(raw).split(',')) {
    tok = tok.trim().toLowerCase();
    if (!tok) continue;
    if (tok === 'all') { out.all = true; continue; }
    if (tok === 'none') { out.none = true; continue; }
    let neg = false;
    if (tok[0] === '-') { neg = true; tok = tok.slice(1); } else if (tok[0] === '+') tok = tok.slice(1);
    tok = tok.trim();
    if (FF_ID.test(tok)) (neg ? out.off : out.on).add(tok);
  }
  return out;
}

/**
 * 켜짐 판정 — 02 §2.2 의 12단계를 **순서 그대로**. 순수 함수 (입력만 보고 결정).
 * @param {object} entry   매니페스트 항목
 * @param {{ page:string, phase:string, url:object, remote:{features?:object}, safe:boolean, demo:boolean, tripped:boolean }} env
 * @returns {{ on: boolean, source: 'page'|'phase'|'tripped'|'url'|'planned'|'safe'|'admin'|'default'|'beta' }}
 */
export function resolveEnabled(entry, env) {
  const { page, phase, remote, safe = false, demo = false, tripped = false } = env;
  const url = env.url || { all: false, none: false, on: new Set(), off: new Set() };
  const id = entry.id;
  const urlOn = url.on.has(id) || (url.all && id[0] !== '_');
  if (!entry.pages.includes(page)) return { on: false, source: 'page' };                                   //  1
  if (page !== 'admin' && !entry.phases.includes(phase)) return { on: false, source: 'phase' };            //  2  (?ff= 로도 못 뒤집음)
  if (tripped) return { on: false, source: 'tripped' };                                                    //  3
  if (url.none || url.off.has(id)) return { on: false, source: 'url' };                                    //  4  끄기는 언제나 가능
  if (entry.status === 'planned') return (demo && urlOn) ? { on: true, source: 'url' } : { on: false, source: 'planned' };   // 5
  const flag = remote?.features?.[id];
  if (!demo && safe && !entry.liveSafe) return { on: false, source: 'safe' };                              //  6  실서버: 안전 모드와
  if (!demo && flag === false) return { on: false, source: 'admin' };                                      //  7  관리자 "끄기"가 ?ff= 보다 우선
  if (urlOn) return { on: true, source: 'url' };                                                           //  8
  if (safe && !entry.liveSafe) return { on: false, source: 'safe' };                                       //  9  (데모는 8번이 먼저)
  if (typeof flag === 'boolean') return { on: flag, source: 'admin' };                                     // 10
  if (entry.status === 'ready') return { on: !!entry.default, source: 'default' };                         // 11
  return { on: false, source: 'beta' };                                                                    // 12
}

// ============================================================
//  ② 도우미
// ============================================================
function withTimeout(p, ms, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(coded('timeout', `${label} timed out after ${ms} ms`)), ms);
    Promise.resolve(p).then(v => { clearTimeout(timer); resolve(v); }, e => { clearTimeout(timer); reject(e); });
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const offKey = id => `wgb_f_${id}__offhook`;
const hasOffMarker = id => { try { return localStorage.getItem(offKey(id)) !== null; } catch { return false; } };

const BAD_TAG = /^(script|iframe|frame|frameset|object|embed|base|meta|link|style)$/i;
const URL_ATTR = /^(href|src|action|formaction|poster|data|xlink:href)$/i;
/** 브라우저의 URL 해석기는 탭·줄바꿈을 **어디서든** 지우고 앞뒤 제어문자·공백도 지웁니다 (`java\tscript:` 는 javascript: 입니다).
 *  그래서 검사 전에 제어문자(C0 · DEL · C1)와 공백을 전부 지웁니다 — 정상 주소는 이것으로 달라지지 않습니다. */
const compactUrl = v => v.replace(/[\u0000-\u0020\u007f-\u009f]/g, '');
const UNSAFE_URL = /^(?:javascript|vbscript):|^data:(?:text\/html|application\/xhtml\+xml)/i;
function setAttr(el, name, value) {
  const k = String(name).toLowerCase();
  if (!/^[a-z_:][a-z0-9_:.-]*$/.test(k) || k.startsWith('on') || k === 'srcdoc' || k === 'style' || k === 'data-f') throw coded('bad-name', `ctx.el: attribute "${name}" is not allowed`);
  if (value === false || value === null || value === undefined) return;
  const v = value === true ? '' : String(value);
  if (URL_ATTR.test(k) && UNSAFE_URL.test(compactUrl(v))) throw coded('bad-name', `ctx.el: unsafe URL in "${name}"`);
  el.setAttribute(k, v);
}

// ============================================================
//  ③ 로더
// ============================================================
let loader = null;                       // 페이지당 1개 (bootFeatures 는 두 번 불려도 같은 것을 돌려줌)
const slotOwner = new Map();             // 한 기능 전용 자리 → 기능 id (02 §7.8)
const counted = new WeakSet();           // 이미 집계한 오류 객체 — 같은 오류를 두 번 세지 않음

/**
 * @param {'guest'|'kiosk'|'village'|'admin'} page
 * @param {{ forFeature(scope): object, refreshTexts?(): void }} pageApi  (WP-00c 가 구현. 00b 테스트는 가짜 구현)
 * @param {{ readyTimeoutMs?: number, manifest?: object[], setupTimeoutMs?: number, loadTimeoutMs?: number, cssTimeoutMs?: number }} [opts]
 *        manifest · *TimeoutMs 는 시험용 (기본값이 계약 값)
 * @returns {Promise<void>} 처음 켜질 기능들의 setup 이 끝나거나 readyTimeoutMs(기본 3000) 가 지나면 resolve. 거부되는 것은 인자가 틀렸을 때뿐
 */
export function bootFeatures(page, pageApi, opts = {}) {
  if (loader) return loader.boot;
  if (!PAGES.includes(page)) return Promise.reject(new TypeError(`bootFeatures: unknown page "${page}"`));
  if (!pageApi || typeof pageApi.forFeature !== 'function') return Promise.reject(new TypeError('bootFeatures: pageApi.forFeature(scope) is required'));
  loader = createLoader(page, pageApi, opts);
  return loader.boot;
}

function createLoader(page, pageApi, opts) {
  const {
    readyTimeoutMs = 3000, manifest = FEATURES, setupTimeoutMs = SETUP_TIMEOUT_MS,
    loadTimeoutMs = LOAD_TIMEOUT_MS, cssTimeoutMs = CSS_TIMEOUT_MS,
  } = opts;
  const demo = DEMO;
  const search = (() => { try { return location.search; } catch { return ''; } })();
  const url = parseFF(search);
  const qs = new URLSearchParams(search);
  const stFlags = new Set(demo ? (qs.get('st') || '').split(',').map(s => s.trim()).filter(Boolean) : []);   // 데모 전용 시험 장치
  const crashId = demo ? (qs.get('fcrash') || '') : '';
  const debug = demo || qs.get('debug') === '1';
  const refreshTexts = () => { try { pageApi.refreshTexts?.(); } catch (e) { console.error('[features] refreshTexts failed', e); } };

  /** @type {Map<string, any>} */
  const recs = new Map();
  for (const entry of manifest) {
    if (!entry || recs.has(entry.id)) continue;
    recs.set(entry.id, {
      id: entry.id, entry, state: 'off', want: false, source: 'page', tripped: false,
      errTimes: [], errorCount: 0, lastError: null, inst: null, running: null,
      offHookDue: false, fcrashLeft: crashId === entry.id ? BREAKER_LIMIT : 0,
    });
  }
  /** gate 기능 = 매니페스트 gate:true (prereg) + 데모에서 ?st=gate 이면 _selftest (WP-00c A13) */
  const isGate = rec => rec.entry.gate === true || (demo && rec.id === '_selftest' && stFlags.has('gate'));

  // ---- 오류 집계 · 서킷 브레이커 ----------------------------------------------------------------------------
  function noteError(rec, err, where) {
    if (isObj(err)) { if (counted.has(err)) return false; counted.add(err); }
    const now = Date.now();
    rec.errTimes.push(now);
    while (rec.errTimes.length && now - rec.errTimes[0] > BREAKER_WINDOW_MS) rec.errTimes.shift();
    rec.errorCount++;
    rec.lastError = { message: String(err?.message ?? err).slice(0, 200), code: err?.code ?? null, at: now, where };
    return true;
  }
  /** guard 된 콜백 · scope.report · bus 핸들러에서 온 오류 */
  function reportError(rec, inst, err, { tripNow = false } = {}) {
    if (inst?.dead && !tripNow) return;                           // 이미 꺼진 인스턴스의 늦은 오류는 세지 않음
    if (!noteError(rec, err, 'run') && !tripNow) return;
    const tripped = tripNow || rec.errTimes.length >= BREAKER_LIMIT;
    console.error(`[f:${rec.id}] ${rec.lastError.message}`);
    bus.emit('feature:error', { id: rec.id, message: rec.lastError.message, count: rec.errorCount, tripped });
    if (tripped && !rec.tripped) tripFeature(rec);
  }
  /** load · 모듈 검사 · css · setup 실패 = 이번 세션 동안 꺼짐 (02 §3 규칙 1). quiet = 아직 코드가 없는 planned 기능 (개발 중 ?ff=all) */
  function failFeature(rec, err, where, quiet = false) {
    noteError(rec, err, where);                                    // 이미 센 오류(예: claim 의 owner-conflict)면 개수는 그대로
    const message = quiet ? 'load: no code yet (planned)' : `${where}: ${String(err?.message ?? err)}`.slice(0, 200);
    rec.lastError = { message, code: err?.code ?? null, at: Date.now(), where };
    if (quiet) console.warn(`[features] ${rec.id}: planned and features/${rec.id}/index.js does not exist yet — skipped`);
    else console.error(`[f:${rec.id}] ${message}`);
    tripFeature(rec);
    bus.emit('feature:error', { id: rec.id, message, count: rec.errorCount, tripped: true });
  }
  function tripFeature(rec) {
    rec.tripped = true; rec.want = false; rec.source = 'tripped';
    if (rec.inst) rec.inst.dead = true;                            // 콜백은 지금부터 아무 일도 하지 않음 — 정리는 곧 뒤따름
    schedule(rec);
  }

  // ---- 켜기 · 끄기 ------------------------------------------------------------------------------------------
  /** 한 기능에 대한 일은 한 번에 하나 (직렬화) — 켜기/끄기가 겹쳐도 마지막 판정만 남습니다 */
  function schedule(rec) {
    if (rec.running) return rec.running;
    rec.running = Promise.resolve().then(() => drive(rec));
    return rec.running;
  }
  async function drive(rec) {
    try {
      for (let spin = 0; spin < 40; spin++) {
        if (rec.offHookDue && !rec.want && rec.state !== 'on') { rec.offHookDue = false; await runOffHook(rec); continue; }
        const wantOn = rec.want && !rec.tripped;
        if (wantOn === (rec.state === 'on')) break;
        if (wantOn) await turnOn(rec); else await turnOff(rec);
      }
    } catch (e) { console.error(`[features] ${rec.id}: ${e?.message || e}`); }
    rec.running = null;                                            // 마지막 검사와 같은 틱 (사이에 await 없음) — 새 판정을 놓치지 않음
  }

  function loadCss(rec, inst) {
    return new Promise(resolve => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = `js/features/${rec.id}/style.css`;
      link.setAttribute('data-f', rec.id);
      const finish = () => { clearTimeout(timer); link.onload = link.onerror = null; resolve(); };
      const timer = setTimeout(finish, cssTimeoutMs);
      link.onload = finish;
      link.onerror = () => { console.warn(`[features] ${rec.id}: style.css did not load`); finish(); };
      inst.link = link;
      document.head.appendChild(link);
    });
  }

  async function turnOn(rec) {
    const inst = { dead: false, cleanups: new Set(), counts: { listeners: 0, timers: 0, raf: 0, watchers: 0, bus: 0 }, slots: new Set(), roots: new Map(), strings: false, textsUsed: false, link: null };
    rec.inst = inst;
    const stale = () => inst.dead || !rec.want || rec.tripped;
    let where = 'load';
    try {
      const mod = await withTimeout(Promise.resolve().then(() => rec.entry.load()), loadTimeoutMs, 'load');
      if (stale()) return disposeInst(rec);
      where = 'module';
      if (!mod || typeof mod.setup !== 'function') throw coded('bad-module', `features/${rec.id}/index.js must export an async setup(ctx)`);
      if (!isObj(mod.i18n)) throw coded('bad-module', `features/${rec.id}/index.js must export i18n (the dictionary from i18n.js)`);
      addStrings(rec.id, mod.i18n); inst.strings = true;
      if (mod.css) { where = 'css'; await loadCss(rec, inst); if (stale()) return disposeInst(rec); }
      where = 'setup';
      const { ctx, scope } = buildCtx(rec, inst);
      const api = pageApi.forFeature(scope);
      if (isObj(api)) for (const k of ['guest', 'v', 'admin']) if (api[k]) ctx[k] = api[k];
      await withTimeout(mod.setup(ctx), setupTimeoutMs, 'setup');
      if (stale()) return disposeInst(rec);
      rec.state = 'on';
      bus.emit('feature:state', { id: rec.id, on: true, source: rec.source });
    } catch (err) {
      disposeInst(rec);
      failFeature(rec, err, where, where === 'load' && rec.entry.status === 'planned' && MISSING_MODULE.test(String(err?.message)));
    }
  }

  async function turnOff(rec) {
    disposeInst(rec);
    rec.state = 'off';
    bus.emit('feature:state', { id: rec.id, on: false, source: rec.source });
    await runOffHook(rec);
  }

  /** ctx 로 등록한 모든 것을 역순으로 풀고, DOM·스타일·문구·자리·버스 구독을 거둔다 (WP-00b §4.6 동작 3). 여러 번 불려도 안전 */
  function disposeInst(rec) {
    const inst = rec.inst;
    if (!inst) return;
    rec.inst = null;
    inst.dead = true;
    const fns = [...inst.cleanups].reverse();
    inst.cleanups.clear();
    for (const fn of fns) { try { fn(); } catch (e) { console.error(`[f:${rec.id}] cleanup failed: ${e?.message || e}`); } }
    bus.offOwner(rec.id);
    try { document.querySelectorAll(`[data-f="${rec.id}"]`).forEach(n => n.remove()); } catch {}      // <link data-f> 포함
    for (const [name] of inst.roots) document.documentElement.classList.remove(`f-${rec.id}-${name}`);
    inst.roots.clear();
    if (inst.strings) removeStrings(rec.id);
    overrideStrings(rec.id, null);
    if (inst.textsUsed) refreshTexts();                            // 문구 원복 → 화면 다시 칠하기 1번 ('lang' 이벤트는 내지 않음)
    for (const s of inst.slots) if (slotOwner.get(s) === rec.id) slotOwner.delete(s);
    inst.slots.clear();
  }

  /** 02 §3 규칙 6 — 기기에 오래 남는 것(서비스워커 등)을 만든 기능이 꺼진 채 부팅하거나 꺼질 때 features/<id>/off.js 의 off() 를 1번 */
  async function runOffHook(rec) {
    if (!hasOffMarker(rec.id)) return;
    try {
      const mod = await withTimeout(import(`../features/${rec.id}/off.js`), OFF_HOOK_TIMEOUT_MS, 'off hook (load)');
      if (typeof mod.off === 'function') await withTimeout(mod.off(), OFF_HOOK_TIMEOUT_MS, 'off hook');
    } catch (e) { console.warn(`[features] ${rec.id}: off hook failed — ${e?.message || e}`); }
    try { localStorage.removeItem(offKey(rec.id)); } catch {}
  }

  // ---- 판정 ---------------------------------------------------------------------------------------------------
  let evaluated = false, offChecked = false;
  function reevaluate() {
    const s = getSettings(), phase = currentPhase();
    for (const rec of recs.values()) {
      const r = (rec.id[0] === '_' && !demo)
        ? { on: false, source: 'planned' }                         // _selftest 는 데모에서만 로드 (WP-00b §4.6 동작 7)
        : resolveEnabled(rec.entry, { page, phase, url, remote: s, safe: s.safe, demo, tripped: rec.tripped });
      rec.want = r.on;
      rec.source = r.source;
      if (!offChecked && !r.on && r.source !== 'page' && hasOffMarker(rec.id)) rec.offHookDue = true;   // 부팅 판정에서 OFF 인 기능의 정리
      if (r.on !== (rec.state === 'on') || rec.offHookDue) schedule(rec);
    }
    offChecked = true;
  }
  const onChange = () => { if (!evaluated) return; try { reevaluate(); } catch (e) { console.error('[features] re-evaluation failed', e); } };

  // ---- ctx -----------------------------------------------------------------------------------------------------
  function buildCtx(rec, inst) {
    const id = rec.id;
    const guard = fn => {
      if (typeof fn !== 'function') throw new TypeError('ctx.guard(fn): fn must be a function');
      return function guarded(a, b, c, d, e, f) {                  // 고정 인자 6개 — 프레임마다 불리는 훅에서 배열을 만들지 않음
        if (inst.dead) return undefined;
        try {
          if (rec.fcrashLeft > 0) { rec.fcrashLeft--; throw new Error(`[fcrash] forced error ${BREAKER_LIMIT - rec.fcrashLeft}/${BREAKER_LIMIT} in ${id}`); }
          return fn.call(this, a, b, c, d, e, f);
        } catch (err) { reportError(rec, inst, err); return undefined; }
      };
    };
    /** 정리 함수 등록 + 개수 세기. 반환 off() 는 한 번만 일하고 목록에서도 빠집니다 */
    const reg = (kind, undo) => {
      let done = false;
      const off = () => { if (done) return; done = true; inst.cleanups.delete(off); if (kind) inst.counts[kind]--; undo(); };
      if (kind) inst.counts[kind]++;
      inst.cleanups.add(off);
      return off;
    };
    const el = (tag, o) => {
      o = o || {};                                                                                       // null 도 괜찮음
      if (typeof tag !== 'string' || !/^[a-z][a-z0-9-]{0,30}$/i.test(tag) || BAD_TAG.test(tag)) throw coded('bad-name', `ctx.el: tag "${tag}" is not allowed`);
      const node = document.createElement(tag);
      node.setAttribute('data-f', id);
      if (o.cls) node.className = String(o.cls);
      if (o.text !== undefined && o.text !== null) node.textContent = String(o.text);                    // 항상 textContent (HTML 아님)
      if (o.attrs) for (const [k, v] of Object.entries(o.attrs)) setAttr(node, k, v);
      if (o.style) for (const [k, v] of Object.entries(o.style)) { if (k.includes('-')) node.style.setProperty(k, String(v)); else node.style[k] = v; }
      if (o.on) for (const [ev, fn] of Object.entries(o.on)) { const g = guard(fn); node.addEventListener(ev, g); reg('listeners', () => node.removeEventListener(ev, g)); }
      if (o.kids) for (const k of o.kids) node.append(typeof k === 'string' ? document.createTextNode(k) : k);
      return node;
    };
    const listen = (target, type, fn, o) => {
      if (inst.dead) return noop;
      if (!target || typeof target.addEventListener !== 'function') throw coded('bad-name', 'ctx.listen: target must be an EventTarget');
      const g = guard(fn);
      target.addEventListener(type, g, o);
      return reg('listeners', () => target.removeEventListener(type, g, o));
    };
    const every = (ms, fn) => {
      if (inst.dead) return noop;
      const g = guard(fn), h = setInterval(g, Math.max(0, Number(ms) || 0));
      return reg('timers', () => clearInterval(h));
    };
    const after = (ms, fn) => {
      if (inst.dead) return noop;
      const g = guard(fn);
      let off = noop;
      const h = setTimeout(() => { off(); g(); }, Math.max(0, Number(ms) || 0));
      off = reg('timers', () => clearTimeout(h));
      return off;
    };
    const raf = fn => {
      if (inst.dead) return noop;
      const g = guard(fn);
      let h = 0, last = 0, stopped = false;
      const tick = now => {
        if (stopped) return;
        const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
        last = now;
        h = requestAnimationFrame(tick);                           // 먼저 다음 프레임을 잡아 둠 — g 안에서 off() 하면 이것이 취소됨
        g(dt, now / 1000);                                         // dt · now 모두 초 단위 (마을의 onUpdate 와 같은 단위)
      };
      h = requestAnimationFrame(tick);
      return reg('raf', () => { stopped = true; cancelAnimationFrame(h); });
    };
    const busOn = (type, fn, replay) => {
      if (inst.dead) return noop;
      const off = bus.on(type, guard(fn), { replay, owner: id });
      return reg('bus', off);
    };
    const texts = dict => {
      if (inst.dead) return;
      overrideStrings(id, dict);
      inst.textsUsed = true;
      refreshTexts();                                              // 'lang' 이벤트는 내지 않음 — lang 핸들러 안에서 불러도 무한 반복 없음
    };
    const rootClass = name => {
      if (typeof name !== 'string' || !/^[a-z0-9-]{1,20}$/.test(name)) throw coded('bad-name', `ctx.rootClass: "${name}" must match ^[a-z0-9-]{1,20}$`);
      if (inst.dead) return noop;
      const cls = `f-${id}-${name}`;
      inst.roots.set(name, (inst.roots.get(name) || 0) + 1);
      document.documentElement.classList.add(cls);
      return reg(null, () => {
        const n = (inst.roots.get(name) || 0) - 1;
        if (n > 0) inst.roots.set(name, n); else { inst.roots.delete(name); document.documentElement.classList.remove(cls); }
      });
    };

    // ---- ctx.db: 같은 docdb, 다만 watch 는 자동 해제 · 콜백은 guard · 꺼진 뒤의 호출은 아무 일도 안 함 ----
    const watchReg = (target, fn, onError) => {
      if (inst.dead) return noop;
      const off = target.watch(guard(fn), typeof onError === 'function' ? guard(onError) : undefined);   // 경로·인자 오류는 여기서 바로 throw
      return reg('watchers', off);
    };
    const wrapDoc = ref => ({
      path: ref.path,
      get: () => (inst.dead ? Promise.resolve(null) : ref.get()),
      watch: (fn, onError) => watchReg(ref, fn, onError),
      create: d => (inst.dead ? Promise.resolve() : ref.create(d)),
      set: (d, o) => (inst.dead ? Promise.resolve() : ref.set(d, o)),
      update: p => (inst.dead ? Promise.resolve() : ref.update(p)),
      delete: () => (inst.dead ? Promise.resolve() : ref.delete()),
    });
    const wrapCol = q => ({
      name: q.name,
      where: (f, op, v) => wrapCol(q.where(f, op, v)),
      orderBy: (f, dir) => wrapCol(q.orderBy(f, dir)),
      limit: n => wrapCol(q.limit(n)),
      get: () => (inst.dead ? Promise.resolve([]) : q.get()),
      watch: (fn, onError) => watchReg(q, fn, onError),
      add: d => (inst.dead ? Promise.resolve(null) : q.add(d)),
    });
    const db = {
      get backend() { return docdb().backend; },
      doc: path => wrapDoc(docdb().doc(path)),
      col: name => wrapCol(docdb().col(name)),
      ts, inc,
      batch() {
        const b = docdb().batch(), w = {
          set(path, data, o) { b.set(path, data, o); return w; },
          update(path, patch) { b.update(path, patch); return w; },
          delete(path) { b.delete(path); return w; },
          commit: () => (inst.dead ? Promise.resolve() : b.commit()),
        };
        return w;
      },
    };

    const claim = slot => {
      if (!SLOTS.includes(slot)) throw coded('bad-name', `scope.claim: unknown slot "${slot}" (${SLOTS.join(' · ')})`);
      if (inst.dead) return noop;
      const cur = slotOwner.get(slot);
      if (cur && cur !== id) {
        const e = coded('owner-conflict', `slot "${slot}" is already used by feature "${cur}"`);
        reportError(rec, inst, e);                                 // feature:error { id: 부른 기능 } — 조용히 덮어쓰지 않음
        throw e;
      }
      slotOwner.set(slot, id);
      inst.slots.add(slot);
      return () => { if (slotOwner.get(slot) === id) slotOwner.delete(slot); inst.slots.delete(slot); };
    };

    const entry = Object.freeze({ ...rec.entry, name: Object.freeze({ ...rec.entry.name }), pages: Object.freeze([...rec.entry.pages]), phases: Object.freeze([...rec.entry.phases]) });
    const scope = Object.freeze({
      id, entry, alive: () => !inst.dead,
      add: fn => { if (!inst.dead && typeof fn === 'function') inst.cleanups.add(fn); },
      guard, el, report: err => reportError(rec, inst, err), claim,
    });
    const ctx = {
      id, page, demo, entry,
      lang: () => getLang(),
      phase: () => currentPhase(),
      t: (key, vars) => t(key, vars),
      texts, rootClass, el, listen, every, after, raf,
      onCleanup: fn => { if (typeof fn === 'function') { if (inst.dead) { try { fn(); } catch {} } else inst.cleanups.add(fn); } },
      guard,
      bus: {
        on: (type, fn, o) => busOn(type, fn, !!o?.replay),
        emit: (type, payload) => {
          if (inst.dead) return;
          if (typeof type !== 'string' || !(type.startsWith(id + ':') || EVENT_OWNERS[type] === id)) throw coded('bad-name', `feature "${id}" may not emit "${type}" (only "${id}:…" or its own events in 02 §5)`);
          bus.emit(type, payload);
        },
        last: type => bus.last(type),
      },
      db,
      settings: () => getSettings(),
      cfg: () => getSettings().cfg[id] || EMPTY_CFG,
      live: () => getLive(),
      onSettings: fn => { const off = busOn('settings', fn, false); try { guard(fn)(getSettings()); } catch {} return off; },
      onLive: fn => { const off = busOn('live', fn, false); try { guard(fn)(getLive()); } catch {} return off; },
      store: () => getStore(),
      log: (...args) => { if (debug) console.log(`[f:${id}]`, ...args); },
      markOffHook: () => { try { localStorage.setItem(offKey(id), '1'); } catch {} },
    };
    return { ctx, scope };
  }

  // ---- 시작 ---------------------------------------------------------------------------------------------------
  bus.setErrorReporter((owner, err) => { const rec = recs.get(owner); if (rec) reportError(rec, rec.inst, err); });
  bus.on('settings', onChange);
  bus.on('phase', onChange);
  startPhase();
  let startP;
  try { startP = startSettings(); } catch (e) { startP = Promise.reject(e); }
  /** 첫 판정: 설정 문서의 실제 첫 값이 오거나, 2초가 지나 기본값으로 진행하면 (startSettings) */
  const firstEval = (async () => {
    try { await Promise.race([settingsArrived(), startP]); } catch (e) { console.warn('[features] settings unavailable — using defaults:', e?.code || e?.message || e); }
    evaluated = true;
    try { reevaluate(); } catch (e) { console.error('[features] first evaluation failed', e); }
  })();

  const boot = (async () => {
    const ready = (async () => {
      await firstEval;
      await Promise.all([...recs.values()].filter(r => r.running).map(r => r.running));
    })().catch(() => {});
    await Promise.race([ready, sleep(readyTimeoutMs)]);
  })();

  /** whenGateReady 가 기다릴 일들: 지금 켜져야 하는 gate 기능의 켜기 작업 */
  const gateWork = () => [...recs.values()].filter(r => isGate(r) && r.want && !r.tripped && r.running).map(r => r.running);
  return { page, recs, boot, firstEval: () => firstEval, gateWork, reportError, tripFeature, isGate };
}

const EMPTY_CFG = Object.freeze({});

// ============================================================
//  ④ 밖으로 내보내는 것
// ============================================================

/**
 * 마을의 첫 동기화 전에 기다립니다 (gate, 02 §2.2): 설정 문서의 **실제** 첫 값(서버 또는 영구 캐시 — 2초 기본값 타임아웃이 아님)이 오고,
 * 그 판정에서 켜진 gate 기능(prereg)의 setup 이 (성공하든 실패하든) 끝날 때까지. 최대 timeoutMs. 거부(reject)는 없음.
 * 설정이 끝내 안 오면 timeoutMs 뒤에 그냥 resolve — 그때는 매니페스트 기본값으로 판정된 상태입니다.
 */
export function whenGateReady(timeoutMs = 8000) {
  return new Promise(resolve => {
    let finished = false, timer = 0;
    const done = () => { if (finished) return; finished = true; clearTimeout(timer); resolve(); };
    timer = setTimeout(done, timeoutMs);
    (async () => {
      try {
        await settingsArrived();
        if (loader) {
          await loader.firstEval();
          for (let pass = 0; pass < 5 && !finished; pass++) {      // 기다리는 동안 설정이 바뀌어 gate 기능이 새로 켜질 수도 있음
            const work = loader.gateWork();
            if (!work.length) break;
            await Promise.all(work);
          }
        }
      } catch { /* 기다림은 실패하지 않습니다 */ }
      done();
    })();
  });
}

/** 기능별 상태 (관리자 ⚙️ 설정 · 테스트용). 부팅 전에는 빈 목록 */
export function featureStates() {
  if (!loader) return [];
  return [...loader.recs.values()].map(r => ({
    id: r.id, name: r.entry.name, status: r.entry.status, on: r.state === 'on', source: r.source, tripped: r.tripped,
    errors: r.errorCount, lastError: r.lastError ? r.lastError.message : null,
    live: r.inst ? { ...r.inst.counts, bus: bus.count(r.id) } : { listeners: 0, timers: 0, raf: 0, watchers: 0, bus: bus.count(r.id) },   // A7: 꺼진 뒤 전부 0
  }));
}

/** 그 기능을 이번 세션 동안 끕니다 (dispose + 'feature:error' { tripped: true }). 모르는 id 면 false */
export function trip(id, reason = 'tripped') {
  const rec = loader?.recs.get(id);
  if (!rec) return false;
  loader.reportError(rec, rec.inst, coded('tripped', String(reason)), { tripNow: true });
  return true;
}

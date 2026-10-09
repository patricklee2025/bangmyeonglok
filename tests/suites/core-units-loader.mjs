// ============================================================
//  core-units-loader (WP-00b ③) — core/features.js 를 브라우저 안에서 직접 검사합니다 (docs/v4/04-testing.md §3.2 · WP-00b §6.3).
//  core-units 와 같은 "빈 페이지 + 진짜 모듈" 방식 (tests/lib/units.mjs): 페이지마다 새 컨텍스트 = 새 로더 (로더는 페이지당 1개).
//  가짜 매니페스트(bootFeatures 의 `manifest` 시험용 자리)로 기능을 만들어 켜고·끄고·망가뜨립니다. 진짜 기능은 `_selftest` 하나뿐.
//
//    ① resolveEnabled 판정표 (02 §2.2 12단계, 손으로 쓴 표 + 독립 오라클과 모든 조합 비교)   ② ?ff= 문법 · 부팅 인자
//    ③ 진짜 `_selftest` (css · 루트 클래스 · 타이머 · 버스 · 문서 구독) 켜기/끄기
//    ④ 핫 토글과 "끄면 흔적 0" (A7) — 브라우저 수준 스파이로 타이머·리스너·rAF 를 독립 확인
//    ⑤ 서킷 브레이커 (A8) · setup/load/css 실패 · 3초 제한 · 인자 오류
//    ⑥ gate (whenGateReady) · claim · 문구/루트 클래스 · off hook · ctx.el 보안 · ctx.db · ctx.bus · 관리자 → 다른 탭 · 늦은 설정
// ============================================================
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { inPage, unitTools, HELPERS, UNIT_PAGE, BLANK } from '../lib/units.mjs';
import { on, off, ff, adminPage, setFlag, setSafe, setPhase, setLive, setCfg, footprint, expectClean, dbGet, dbSet, dbCol, guestsWithCodes, featureStates, featureState, bootStub, coreOnly } from '../lib/v4.mjs';

export const meta = { title: 'v4 core loader (core/features.js): resolveEnabled table, ?ff= grammar, hot toggle, zero trace, circuit breaker, gate, claim, texts, off hook, ctx safety', timeout: 240000, tags: ['slow'] };

// ------------------------------------------------------------------------------------------------
//  페이지 안 도우미 → window.__L  (바깥 변수를 쓰지 않는 자기완결 함수 — page.evaluate 로 주입)
// ------------------------------------------------------------------------------------------------
const LH = () => {
  const L = (window.__L = {});
  const ALL = ['pre', 'live', 'after', 'anniversary'], PAGES = ['guest', 'kiosk', 'village', 'admin'];
  L.sleep = ms => new Promise(r => setTimeout(r, ms));
  L.until = async (cond, ms = 3000) => { const t0 = performance.now(); while (!(await cond())) { if (performance.now() - t0 > ms) return false; await L.sleep(10); } return true; };

  /** 가짜 매니페스트 항목. o: pages phases status default liveSafe gate css i18n noI18n noSetup extra load */
  L.entry = (id, setup, o = {}) => ({
    id, wp: 'WP-XX', name: { ko: id, en: id }, pages: o.pages || PAGES, phases: o.phases || ALL,
    simple: true, liveSafe: !!o.liveSafe, gate: !!o.gate, status: o.status || 'beta', default: o.default ?? true,
    load: o.load || (async () => ({
      ...(o.noI18n ? {} : { i18n: o.i18n || { ko: { [id + '_hello']: '안녕 {n}' }, en: { [id + '_hello']: 'Hello {n}' } } }),
      css: !!o.css, ...(o.noSetup ? {} : { setup }), ...(o.extra || {}),
    })),
  });

  /** 가짜 페이지 API 와 함께 부팅. stub.scopes[id] = scope, stub.refresh = refreshTexts 호출 수, stub.apis[id] = forFeature 가 돌려준 객체 */
  L.boot = (pageName, entries, opts = {}) => {
    const stub = (window.__stub = { refresh: 0, scopes: {}, apis: {}, pageName });
    const key = pageName === 'village' ? 'v' : pageName === 'admin' ? 'admin' : 'guest';
    const run = async () => {
      const F = await import('/js/core/features.js');
      return F.bootFeatures(pageName, {
        forFeature: scope => { stub.scopes[scope.id] = scope; return (stub.apis[scope.id] = { [key]: { id: scope.id, page: pageName } }); },
        refreshTexts: () => { stub.refresh++; },
      }, { manifest: entries, ...opts });
    };
    return run();
  };

  /** features.js 를 미리 읽어 둡니다 → await L.ready 한 뒤에는 L.bootNow 가 "동기적으로" 부팅합니다 (부팅 직후 whenGateReady 를 부르는 시험용) */
  L.ready = import('/js/core/features.js').then(m => { L.F = m; });
  L.bootNow = (pageName, entries, opts = {}) => {
    const stub = (window.__stub = { refresh: 0, scopes: {}, apis: {}, pageName });
    const key = pageName === 'village' ? 'v' : pageName === 'admin' ? 'admin' : 'guest';
    return L.F.bootFeatures(pageName, {
      forFeature: scope => { stub.scopes[scope.id] = scope; return (stub.apis[scope.id] = { [key]: { id: scope.id, page: pageName } }); },
      refreshTexts: () => { stub.refresh++; },
    }, { manifest: entries, ...opts });
  };

  /** 버스 이벤트 기록: L.rec(['feature:state', …]) → window.__ev[type] = [payload…] */
  L.rec = async types => {
    const bus = await import('/js/core/bus.js');
    window.__ev = window.__ev || {};
    for (const ty of types) { window.__ev[ty] = []; bus.on(ty, p => window.__ev[ty].push(p)); }
  };

  /** 한 기능의 현재 상태 (featureStates 에서) */
  L.state = async id => (await import('/js/core/features.js')).featureStates().find(s => s.id === id) || null;
  /** 기능이 남긴 흔적 (data-f 노드 · <link data-f> · f-<id>- 클래스) */
  L.trace = id => ({
    nodes: document.querySelectorAll(`[data-f="${id}"]:not(link)`).length,
    links: document.querySelectorAll(`link[data-f="${id}"]`).length,
    classes: [...new Set([document.documentElement, ...document.querySelectorAll('[class]')])].filter(e => [...e.classList].some(c => c.startsWith(`f-${id}-`))).length,
  });
  L.html = () => [...document.documentElement.classList].sort().join(' ');

  /**
   * 브라우저 수준 스파이 (opt-in): 코어가 등록한 것 가운데 "기능이 만든 것"만 센다.
   *   · setInterval / addEventListener 에 넘어온 콜백이 코어의 guard 가 만든 함수(이름 'guarded')이면 기능 것
   *   · setTimeout 은 마커 지연(987654 ms)으로, requestAnimationFrame 은 코어 루프 함수 이름('tick')으로 알아본다
   * 코어의 카운터(featureStates().live)를 믿지 않고 "정말 해제됐는지"를 따로 확인하기 위한 것.
   */
  L.spy = () => {
    if (window.__spy) return window.__spy;
    const S = (window.__spy = { iv: new Map(), to: new Map(), raf: new Map(), ls: [] });
    const si = window.setInterval.bind(window), ci = window.clearInterval.bind(window), st = window.setTimeout.bind(window), ct = window.clearTimeout.bind(window);
    const rq = window.requestAnimationFrame.bind(window), cq = window.cancelAnimationFrame.bind(window);
    window.setInterval = (fn, ms, ...a) => { const h = si(fn, ms, ...a); if (fn && fn.name === 'guarded') S.iv.set(h, ms); return h; };
    window.clearInterval = h => { S.iv.delete(h); return ci(h); };
    window.setTimeout = (fn, ms, ...a) => {
      if (ms !== 987654) return st(fn, ms, ...a);
      const h = st((...x) => { S.to.delete(h); return fn(...x); }, ms, ...a); S.to.set(h, ms); return h;
    };
    window.clearTimeout = h => { S.to.delete(h); return ct(h); };
    window.requestAnimationFrame = fn => { const h = rq(t => { S.raf.delete(h); return fn(t); }); if (fn && fn.name === 'tick') S.raf.set(h, 1); return h; };
    window.cancelAnimationFrame = h => { S.raf.delete(h); return cq(h); };
    const add = EventTarget.prototype.addEventListener, rem = EventTarget.prototype.removeEventListener;
    EventTarget.prototype.addEventListener = function (type, fn, o) {
      if (fn && fn.name === 'guarded') { const cap = typeof o === 'boolean' ? o : !!o?.capture; if (!S.ls.some(x => x.t === this && x.type === type && x.fn === fn && x.cap === cap)) S.ls.push({ t: this, type, fn, cap }); }
      return add.call(this, type, fn, o);
    };
    EventTarget.prototype.removeEventListener = function (type, fn, o) {
      const cap = typeof o === 'boolean' ? o : !!o?.capture, i = S.ls.findIndex(x => x.t === this && x.type === type && x.fn === fn && x.cap === cap);
      if (i >= 0) S.ls.splice(i, 1);
      return rem.call(this, type, fn, o);
    };
    S.active = () => ({ intervals: S.iv.size, timeouts: S.to.size, raf: S.raf.size, listeners: S.ls.length });
    return S;
  };

  /** console.warn / console.error 를 페이지 안에서 따로 모읍니다 (어떤 오류가 시끄럽게 났는지 정확히 확인) */
  L.con = () => {
    if (window.__con) return window.__con;
    const C = (window.__con = { warn: [], error: [] });
    for (const k of ['warn', 'error']) { const o = console[k].bind(console); console[k] = (...a) => { C[k].push(a.map(x => (x instanceof Error ? x.message : String(x))).join(' ')); o(...a); }; }
    return C;
  };

  /** 한 기록 상자: window.__sink[id] = { setups, calls, cleanups, ctx, node, rafArgs } */
  L.rec2 = id => { const all = (window.__sink = window.__sink || {}); return (all[id] = all[id] || { setups: 0, calls: {}, cleanups: 0, rafArgs: [] }); };

  /** 등록할 수 있는 것을 전부 한 번씩 쓰는 가짜 기능 (A7) — o.claim: scope.claim(slot) 도 부름 */
  L.sink = (id, o = {}) => L.entry(id, async ctx => {
    const R = L.rec2(id);
    R.setups++; R.ctx = ctx;
    const hit = k => () => { R.calls[k] = (R.calls[k] || 0) + 1; };
    const box = ctx.el('div', { cls: `f-${id}-box`, text: 'x', attrs: { id: `f-${id}-box`, title: 't', 'data-x': '1' }, on: { click: hit('click') }, kids: ['a', ctx.el('span', { text: 'k' })] });
    document.body.appendChild(box); R.node = box;
    ctx.rootClass('mode'); ctx.rootClass('mode'); ctx.rootClass('other');
    ctx.listen(window, 'resize', hit('resize'));
    ctx.listen(document, 'visibilitychange', hit('vis'), { capture: true });
    ctx.every(100, hit('every'));
    ctx.after(987654, hit('after'));
    ctx.after(30, hit('afterFast'));
    ctx.raf((dt, now) => { R.calls.raf = (R.calls.raf || 0) + 1; if (R.rafArgs.length < 6) R.rafArgs.push([dt, now]); });
    ctx.bus.on('settings', hit('settings'), { replay: true });
    ctx.bus.on('live', hit('live'));
    ctx.bus.on(`${id}:ping`, hit('ping'));
    ctx.onSettings(hit('onSettings')); ctx.onLive(hit('onLive'));
    ctx.db.doc('app/live').watch(hit('docwatch'));
    ctx.db.col('polls').watch(hit('colwatch'));
    ctx.texts({ ko: { title: 'SINK-' + id }, en: { title: 'SINK-' + id } });
    ctx.onCleanup(() => { R.cleanups++; });
    if (o.claim) window.__stub.scopes[id].claim(o.claim);
  }, { liveSafe: !!o.liveSafe, ...(o.entry || {}) });

  /** 서킷 브레이커 시험용: 정리할 것이 여럿 있고(노드·루트 클래스·리스너·타이머), 콜백이 guard 를 거치는 기능. R.guarded / R.ctx 로 밖에서 만짐 */
  L.bad = (id, o = {}) => L.entry(id, async ctx => {
    const R = L.rec2(id); R.setups++; R.ctx = ctx; R.n = 0;
    document.body.appendChild(ctx.el('div', { text: 'bad', cls: `f-${id}-n`, on: { click: () => { throw new Error('click boom'); } } }));
    ctx.rootClass('x');
    ctx.listen(window, 'resize', () => { R.calls.resize = (R.calls.resize || 0) + 1; });
    if (!o.quiet) ctx.every(30, () => { R.calls.every = (R.calls.every || 0) + 1; });
    R.guarded = ctx.guard(() => { R.calls.guarded = (R.calls.guarded || 0) + 1; return 'ok'; });
    R.boom = ctx.guard(() => { throw new Error('boom ' + (++R.n)); });
    ctx.bus.on(`${id}:boom`, () => { throw new Error('bus boom'); });
  }, o.entry || {});

  /** 한 기능 전용 자리를 차지하려는 가짜 기능. keep: 충돌 오류를 삼키고 계속 켜져 있음 (R.err) — 아니면 setup 이 던져 꺼짐 */
  L.claimer = (id, slot, o = {}) => L.entry(id, async ctx => {
    const R = L.rec2(id); R.setups++; R.ctx = ctx; R.scope = window.__stub.scopes[id]; (R.scopes = R.scopes || []).push(R.scope);
    R.try = s => { try { return { ok: true, off: R.scope.claim(s) }; } catch (e) { return { ok: false, e, code: e.code, message: e.message }; } };
    const r = R.try(slot);
    R.got = r.ok; R.release = r.off; R.err = r.ok ? null : { code: r.code, message: r.message };
    (R.releases = R.releases || []).push(r.off);
    if (!r.ok && !o.keep) throw r.e;                                           // 같은 오류 객체를 그대로 — 두 번 세지 않는지 확인
  }, { liveSafe: true });

  /** 곁에서 계속 일하는 가짜 기능 — 다른 기능이 꺼지거나 망가져도 영향이 없음을 보여 줌 */
  L.ctl = (id, o = {}) => L.entry(id, async ctx => {
    const R = L.rec2(id);
    R.setups++;
    document.body.appendChild(ctx.el('div', { text: 'ctl', attrs: { 'data-st': 'ctl' } }));
    ctx.every(50, () => { R.calls.every = (R.calls.every || 0) + 1; });
  }, { liveSafe: true, ...o });
};

/** 실서버 모드 시험용 (페이지 안): 'firebase' 백엔드 자리에 가짜 문서 저장소를 끼웁니다. window.__doc(path, value) 로 문서를 바꾸면 구독자에게 곧바로 전달됩니다. */
const PROD_STUB = async () => {
  const m = await import('/js/core/docdb.js');
  const docs = new Map(), subs = new Map();
  window.__doc = (path, v) => { docs.set(path, v); for (const fn of [...(subs.get(path) || [])]) fn(v); };
  m.registerBackend('firebase', () => ({
    kind: 'firebase', admin: () => false, read: async path => docs.get(path) ?? null, list: async () => [], write: async () => {}, watchList: () => () => {},
    watchDoc: (path, fn) => { const set = subs.get(path) || new Set(); subs.set(path, set); set.add(fn); Promise.resolve().then(() => { if (set.has(fn)) fn(docs.get(path) ?? null); }); return () => set.delete(fn); },
  }));
};

// ------------------------------------------------------------------------------------------------
//  ① resolveEnabled — 손으로 쓴 표 (02 §2.2) · 독립 오라클과 모든 조합 비교
// ------------------------------------------------------------------------------------------------
const POLL = { id: 'poll', pages: ['guest', 'village', 'admin'], phases: ['live'], status: 'beta', default: true, liveSafe: false };
/** [라벨, 항목 덮어쓰기, 환경 덮어쓰기 { …, flag, url: { on, off, all, none } }, 기대 'on|off:출처'] */
const TABLE = [
  // 1 · page
  ['1  page ∉ pages (guest on a village-only feature)', { pages: ['village'] }, {}, 'off:page'],
  ['1  page ∉ pages beats the url, an admin flag and ready/default', { pages: ['village'], status: 'ready' }, { demo: true, flag: true, url: { on: ['poll'] } }, 'off:page'],
  ['1  the kiosk is a page of its own (not in [guest, village, admin])', {}, { page: 'kiosk', flag: true }, 'off:page'],
  ['1  …and a feature that lists kiosk works there', { pages: ['kiosk'], status: 'ready' }, { page: 'kiosk' }, 'on:default'],
  // 2 · phase
  ['2  phase ∉ phases (non-admin page)', {}, { phase: 'pre', flag: true }, 'off:phase'],
  ['2  ?ff=+id cannot flip the phase (prod)', {}, { phase: 'pre', url: { on: ['poll'] } }, 'off:phase'],
  ['2  ?ff=+id cannot flip the phase (demo)', {}, { phase: 'after', demo: true, url: { on: ['poll'] } }, 'off:phase'],
  ['2  ?ff=all cannot flip the phase', {}, { phase: 'pre', demo: true, url: { all: true } }, 'off:phase'],
  ['2  ① the admin page ignores the phase — an admin flag turns it on', {}, { page: 'admin', phase: 'pre', flag: true }, 'on:admin'],
  ['2  ① …also a url "on"', {}, { page: 'admin', phase: 'anniversary', url: { on: ['poll'] } }, 'on:url'],
  ['2  ① …but nothing turns it on by itself (beta)', {}, { page: 'admin', phase: 'after' }, 'off:beta'],
  ['2  the phase check comes before "planned"', { status: 'planned' }, { phase: 'pre', demo: true, url: { on: ['poll'] } }, 'off:phase'],
  // 3 · tripped
  ['3  tripped (circuit breaker) beats an admin flag', {}, { tripped: true, flag: true }, 'off:tripped'],
  ['3  tripped beats ?ff=+id even in the demo', {}, { tripped: true, demo: true, url: { on: ['poll'] } }, 'off:tripped'],
  ['3  tripped comes after page and phase', {}, { tripped: true, phase: 'pre' }, 'off:phase'],
  // 4 · ?ff=none / ?ff=-id
  ['4  ⑤ ?ff=none turns everything off', {}, { flag: true, url: { none: true } }, 'off:url'],
  ['4  ⑤ ?ff=-poll turns it off (prod, admin flag on, ready/default on)', { status: 'ready' }, { flag: true, url: { off: ['poll'] } }, 'off:url'],
  ['4  ⑤ ?ff=-poll turns it off (demo)', {}, { demo: true, flag: true, url: { off: ['poll'] } }, 'off:url'],
  ['4  ⑤ -id beats +id (both in the url)', {}, { demo: true, url: { on: ['poll'], off: ['poll'] } }, 'off:url'],
  ['4  ⑤ -id beats all', {}, { demo: true, url: { all: true, off: ['poll'] } }, 'off:url'],
  ['4  ⑤ -id beats a planned feature in the demo', { status: 'planned' }, { demo: true, url: { on: ['poll'], off: ['poll'] } }, 'off:url'],
  ['4  -other leaves this feature alone', {}, { url: { off: ['bingo'] } }, 'off:beta'],
  // 5 · planned
  ['5  planned: never loads in production, whatever the flag or url says', { status: 'planned' }, { flag: true, url: { on: ['poll'] } }, 'off:planned'],
  ['5  planned: the demo needs ?ff=', { status: 'planned' }, { demo: true, flag: true }, 'off:planned'],
  ['5  planned: demo + ?ff=+id → on', { status: 'planned' }, { demo: true, url: { on: ['poll'] } }, 'on:url'],
  ['5  planned: demo + ?ff=all → on', { status: 'planned' }, { demo: true, url: { all: true } }, 'on:url'],
  ['5  planned: prod + ?ff=all → off', { status: 'planned' }, { url: { all: true } }, 'off:planned'],
  ['5  ④ planned _selftest: ?ff=all does not turn it on', { id: '_selftest', status: 'planned' }, { demo: true, url: { all: true } }, 'off:planned'],
  ['5  ④ …only ?ff=_selftest does', { id: '_selftest', status: 'planned' }, { demo: true, url: { on: ['_selftest'] } }, 'on:url'],
  ['5  _selftest in production stays off', { id: '_selftest', status: 'planned' }, { url: { on: ['_selftest'] } }, 'off:planned'],
  // 6 · prod safe mode
  ['6  ② prod safe mode beats ?ff=+id (feature not liveSafe)', {}, { safe: true, url: { on: ['poll'] } }, 'off:safe'],
  ['6  ② prod safe mode beats an admin flag', {}, { safe: true, flag: true }, 'off:safe'],
  ['6  ② prod safe mode beats ready/default', { status: 'ready' }, { safe: true }, 'off:safe'],
  ['6  a liveSafe feature survives prod safe mode (admin flag on)', { liveSafe: true }, { safe: true, flag: true }, 'on:admin'],
  ['6  …but is not turned on by it (beta, no flag)', { liveSafe: true }, { safe: true }, 'off:beta'],
  ['6  …ready/default on → on', { liveSafe: true, status: 'ready' }, { safe: true }, 'on:default'],
  // 7 · prod admin "off"
  ['7  ② prod: an admin "off" beats ?ff=+id (nobody revives it with a link)', {}, { flag: false, url: { on: ['poll'] } }, 'off:admin'],
  ['7  ② prod: an admin "off" beats ready/default', { status: 'ready' }, { flag: false }, 'off:admin'],
  ['7  ③ demo: ?ff=+id beats an admin "off"', {}, { demo: true, flag: false, url: { on: ['poll'] } }, 'on:url'],
  // 8 · ?ff=
  ['8  ?ff=+id turns a beta feature on', {}, { url: { on: ['poll'] } }, 'on:url'],
  ['8  ?ff=all turns a beta feature on', {}, { url: { all: true } }, 'on:url'],
  ['8  ④ ?ff=all skips ids that start with _ (beta _x: falls through to "beta")', { id: '_x' }, { url: { all: true } }, 'off:beta'],
  ['8  ④ …while ?ff=_x names it', { id: '_x' }, { url: { on: ['_x'] } }, 'on:url'],
  ['8  ?ff=+id beats "beta" and a missing flag', {}, { demo: true, url: { on: ['poll'] } }, 'on:url'],
  // 9 · demo safe
  ['9  ③ demo: ?ff=+id beats safe mode', {}, { demo: true, safe: true, url: { on: ['poll'] } }, 'on:url'],
  ['9  demo: safe mode still turns a normal feature off', {}, { demo: true, safe: true }, 'off:safe'],
  ['9  demo: safe mode beats an admin flag (step 9 comes before 10)', {}, { demo: true, safe: true, flag: true }, 'off:safe'],
  ['9  demo: a liveSafe feature ignores safe mode', { liveSafe: true }, { demo: true, safe: true, flag: true }, 'on:admin'],
  // 10 · admin flag
  ['10 admin flag true → on', {}, { flag: true }, 'on:admin'],
  ['10 admin flag false → off', {}, { flag: false }, 'off:admin'],
  ['10 demo: admin flag true → on', {}, { demo: true, flag: true }, 'on:admin'],
  ['10 demo: admin flag false without ?ff= → off', {}, { demo: true, flag: false }, 'off:admin'],
  ['10 the admin flag beats ready/default (flag false)', { status: 'ready', default: true }, { flag: false }, 'off:admin'],
  ['10 the admin flag beats ready/default (flag true, default false)', { status: 'ready', default: false }, { flag: true }, 'on:admin'],
  ['10 a flag that is not a boolean is ignored ("true")', {}, { flag: 'true' }, 'off:beta'],
  ['10 …(1)', { status: 'ready', default: true }, { flag: 1 }, 'on:default'],
  ['10 …(null)', { status: 'ready', default: false }, { flag: null }, 'off:default'],
  // 11 · ready
  ['11 ready + default true → on', { status: 'ready', default: true }, {}, 'on:default'],
  ['11 ready + default false → off', { status: 'ready', default: false }, {}, 'off:default'],
  ['11 ready: default only means something for ready', { status: 'ready', default: true }, { demo: true }, 'on:default'],
  // 12 · beta
  ['12 beta without anything → off, whatever "default" says', { status: 'beta', default: true }, {}, 'off:beta'],
  ['12 beta in the demo → off', {}, { demo: true }, 'off:beta'],
  // 입력이 빠졌을 때
  ['—  missing url / remote do not throw (defaults)', {}, { bare: true }, 'off:beta'],
];

// ------------------------------------------------------------------------------------------------
//  ctx.el 시험 목록 (페이지로는 JSON 으로 전달 — 제어문자도 그대로 전달됨)
// ------------------------------------------------------------------------------------------------
const EL_GOOD_TAGS = ['div', 'span', 'button', 'a', 'canvas', 'img', 'input', 'ul', 'li', 'H1', 'DIV', 'my-widget', 'x', 'scripts', 'x-script', 'style-box', 'a'.repeat(31)];
const EL_BAD_TAGS = ['script', 'SCRIPT', 'Script', 'iframe', 'IFRAME', 'frame', 'frameset', 'object', 'embed', 'base', 'meta', 'link', 'style', 'Style',
  '', ' div', 'div ', '<div>', 'div>', '1div', '-div', 'a b', 'é', 'a_b', 'div\n', '\ndiv', 'a'.repeat(32)];
const EL_BAD_ATTRS = ['onclick', 'onerror', 'ONCLICK', 'OnLoad', 'onmouseover', 'onanything', 'on', 'style', 'STYLE', 'srcdoc', 'SrcDoc', 'data-f', 'DATA-F',
  '', 'a b', 'a"b', "a'b", 'a=b', 'a>b', '1a', '-a', '.a', 'é', 'a/b', 'a\nb'];
const EL_URL_ATTRS = ['href', 'src', 'action', 'formaction', 'poster', 'data', 'xlink:href', 'HREF', 'Src'];
/** 브라우저가 스크립트/HTML 로 해석하는 주소 (탭·줄바꿈을 끼운 우회 포함 — 표준 URL 해석기는 이것들을 지웁니다) */
const EL_UNSAFE_URLS = [
  'javascript:alert(1)', 'JavaScript:alert(1)', 'JAVASCRIPT:alert(1)', ' javascript:alert(1)', '\tjavascript:alert(1)', '\n\r javascript:alert(1)', '\u0001javascript:alert(1)', '\u001fjavascript:alert(1)',
  'java\tscript:alert(1)', 'java\nscript:alert(1)', 'java\rscript:alert(1)', 'javascript\t:alert(1)', 'jav\r\nascript:alert(1)',
  'vbscript:msgbox(1)', 'VBScript:x', 'vb\tscript:x', '\u001fvbscript:x',
  'data:text/html,<b>x</b>', 'data:text/html;base64,PGI+', 'DATA:TEXT/HTML,x', 'da\tta:text/html,x', 'data: text/html,x', 'data:\ntext/html,x', 'data:\ttext/html,x', 'data:application/xhtml+xml,<x/>',
];
/** 막으면 안 되는 주소 (그대로 저장되어야 함) */
const EL_SAFE_URLS = ['#top', '/x/y.png', 'x.png', './javascript:alert(1)', 'https://www.w3.org/', 'mailto:a@b.co', 'tel:+1234', 'data:image/png;base64,AAAA', 'data:text/plain,hi', 'data:application/json,{}',
  'javascript-is-fun', 'xjavascript:x', 'my-vbscript:x', '?q=javascript:alert(1)', 'https://x.test/?u=javascript:alert(1)', '', 'datax:text/html,x', 'data', 'java script', 'javascript'];

// ------------------------------------------------------------------------------------------------
export default async (h) => {
  // 일부러 망가뜨린 가짜 기능(ux…)이 코어 로더를 거쳐 console.error 로 알리는 것만 허용 — 진짜 기능과 로더 자신의 오류는 계속 실패로 잡힘
  h.allowErrors(/\[f:ux[a-z0-9]*\] /);
  h.allowErrors(/\[f:_selftest\] \[fcrash\]/);
  coreOnly(h);                                           // the "real manifest" checks here mean "_selftest and planned lines only" (tests/lib/v4.mjs)

  const { open, unitPage } = unitTools(h);
  /** 새 빈 페이지 + __T + __L. params = 주소의 ?…  (기본: demo=1 만, phase 는 시계) */
  const lpage = async (tag, params = {}, ctx) => { const p = await unitPage(tag, ctx, params); await p.evaluate(LH); return p; };
  const reload = async (p, params = {}) => { await open(p, params); await p.evaluate(LH); };
  /** 가짜 시계 페이지 (Playwright clock): time = 시계의 시작 시각. pause: true → 부팅 전에 시계를 세워 p.clock.runFor(ms) 로만 흐르게 함 (ms 단위 경계 시험용) */
  const fakePage = async (tag, params, time, { pause = false } = {}) => {
    const p = await h.page('desktop', { tag });
    await p.route(UNIT_PAGE, r => r.fulfill({ contentType: 'text/html', body: BLANK }));
    await p.clock.install({ time: new Date(time) });
    await p.goto(h.url('__units.html', { phase: 'live', ...params }));
    await p.evaluate(LH);
    if (pause) await p.clock.pauseAt(new Date(Date.parse(time) + 5000));
    return p;
  };

  // ================================================================ ① resolveEnabled
  await h.step('resolveEnabled: the table of 02 §2.2 — each of the 12 steps, and the five points the contract stresses', async () => {
    const p = await lpage('ld-resolve');
    const r = await inPage(p, async ([table, base]) => {
      const { resolveEnabled } = await import('/js/core/features.js');
      const U = (u = {}) => ({ all: !!u.all, none: !!u.none, on: new Set(u.on || []), off: new Set(u.off || []) });
      const rows = table.map(([label, eo, vo, want]) => {
        const entry = { ...base, ...eo };
        const env = vo.bare ? { page: 'guest', phase: 'live' }
          : { page: 'guest', phase: 'live', safe: false, demo: false, tripped: false, ...vo, url: U(vo.url), remote: { features: 'flag' in vo ? { [entry.id]: vo.flag } : {} } };
        let got; try { const x = resolveEnabled(entry, env); got = (x.on ? 'on:' : 'off:') + x.source; } catch (e) { got = 'THROWS ' + e.message; }
        return { label, got, want };
      });
      return rows;
    }, [TABLE, POLL]);
    for (const row of r) h.eq(`resolveEnabled ${row.label}`, row.got, row.want);
    h.eq('the table exercises every output source (page phase tripped url planned safe admin default beta)', [...new Set(TABLE.map(t => t[3].split(':')[1]))].sort(), ['admin', 'beta', 'default', 'page', 'phase', 'planned', 'safe', 'tripped', 'url']);
  });

  await h.step('resolveEnabled: every combination agrees with an independently written oracle (20 736 inputs), and it is pure', async () => {
    const p = await lpage('ld-resolve-all');
    const r = await inPage(p, async () => {
      const { resolveEnabled } = await import('/js/core/features.js');
      // 02 §2.2 를 "첫 번째로 맞는 줄" 표로 다시 쓴 것 (core/features.js 의 if 사슬과 다른 모양으로)
      const oracle = (e, v) => {
        const urlOn = v.url.on.has(e.id) || (v.url.all && !e.id.startsWith('_'));
        const flag = v.remote.features[e.id];
        const rules = [
          [!e.pages.includes(v.page), false, 'page'],
          [v.page !== 'admin' && !e.phases.includes(v.phase), false, 'phase'],
          [v.tripped, false, 'tripped'],
          [v.url.none || v.url.off.has(e.id), false, 'url'],
          [e.status === 'planned', v.demo && urlOn, v.demo && urlOn ? 'url' : 'planned'],
          [!v.demo && v.safe && !e.liveSafe, false, 'safe'],
          [!v.demo && flag === false, false, 'admin'],
          [urlOn, true, 'url'],
          [v.safe && !e.liveSafe, false, 'safe'],
          [typeof flag === 'boolean', flag, 'admin'],
          [e.status === 'ready', !!e.default, 'default'],
          [true, false, 'beta'],
        ];
        const hit = rules.find(x => x[0]);
        return { on: !!hit[1], source: hit[2] };
      };
      const urls = [{}, { on: ['poll', '_x'] }, { off: ['poll', '_x'] }, { all: true }, { none: true }, { on: ['poll', '_x'], off: ['poll', '_x'], all: true }];
      const U = (u = {}) => ({ all: !!u.all, none: !!u.none, on: new Set(u.on || []), off: new Set(u.off || []) });
      let n = 0, bad = [], seen = new Set(), frozenOk = true;
      for (const id of ['poll', '_x']) for (const page of ['guest', 'admin', 'village']) for (const phase of ['live', 'pre']) for (const status of ['planned', 'beta', 'ready'])
        for (const demo of [false, true]) for (const safe of [false, true]) for (const liveSafe of [false, true]) for (const flag of [undefined, true, false])
          for (const url of urls) for (const tripped of [false, true]) for (const dflt of [false, true]) {
            const entry = Object.freeze({ id, pages: Object.freeze(['guest', 'admin']), phases: Object.freeze(['live']), status, default: dflt, liveSafe });
            const env = Object.freeze({ page, phase, url: U(url), remote: { features: flag === undefined ? {} : { [id]: flag } }, safe, demo, tripped });
            const want = oracle(entry, env); let got;
            try { got = resolveEnabled(entry, env); } catch (e) { frozenOk = false; got = { on: 'throws', source: e.message }; }
            n++; seen.add(`${got.on}:${got.source}`);
            if (got.on !== want.on || got.source !== want.source) { if (bad.length < 5) bad.push({ id, page, phase, status, demo, safe, liveSafe, flag, url, tripped, dflt, got, want }); }
          }
      return { n, bad, seen: [...seen].sort(), frozenOk };
    });
    h.eq('20 736 combinations compared (2 ids × 3 pages × 2 phases × 3 statuses × demo × safe × liveSafe × 3 flags × 6 url forms × tripped × default)', r.n, 20736);
    h.eq('…and the function agrees with the oracle everywhere (first mismatches listed)', r.bad, []);
    h.check('…without mutating its (frozen) inputs, without throwing', r.frozenOk);
    h.eq('…and all 12 reachable on/source outcomes occur (the enumeration really covers the table)', r.seen, ['false:admin', 'false:beta', 'false:default', 'false:page', 'false:phase', 'false:planned', 'false:safe', 'false:tripped', 'false:url', 'true:admin', 'true:default', 'true:url']);
  });

  // ================================================================ ② ?ff= grammar
  await h.step('parseFF: the ?ff= grammar of 02 §2.2 (+id · -id · all · none · empty = forget · remembered in the tab · junk dropped)', async () => {
    const p = await lpage('ld-parseff');
    const r = await inPage(p, async () => {
      const { parseFF } = await import('/js/core/features.js');
      const mem = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: k => { m.delete(k); }, m }; };
      const ser = f => ({ all: f.all, none: f.none, on: [...f.on].sort(), off: [...f.off].sort() });
      const out = {}, s = mem();
      out.basic = ser(parseFF('?ff=poll,bingo', s)); out.mem1 = s.m.get('wgb_ff');
      out.remembered = ser(parseFF('', s)); out.remembered2 = ser(parseFF('?demo=1&phase=live', s));
      out.minus = ser(parseFF('?ff=-bgm', s)); out.mem2 = s.m.get('wgb_ff');
      out.replaced = ser(parseFF('', s));
      out.all = ser(parseFF('?ff=all', s)); out.none = ser(parseFF('?ff=none', s)); out.allMinus = ser(parseFF('?ff=all,-bgm', s)); out.upper = ser(parseFF('?ff=ALL,Poll,-BGM', s));
      out.plus = [ser(parseFF('?ff=+poll', s)), ser(parseFF('?ff=%2Bpoll', s)), ser(parseFF('?ff=+poll,+bingo', s)), ser(parseFF('?ff=%2Bpoll,-%2Bbgm', s))];
      out.junk = ser(parseFF('?ff=Poll!,x,-,+,a-b,a_b,po_ll,_,__x,_selftest,poll,,, ,1ab,-%20,po ll', s));
      out.lengths = ser(parseFF('?ff=' + ['ab', 'a'.repeat(16), 'a'.repeat(17), '_' + 'b'.repeat(15), '_' + 'b'.repeat(16), '_' + 'b'.repeat(17)].join(','), s));
      parseFF('?ff=poll', s); out.cleared = [ser(parseFF('?ff=', s)), s.m.has('wgb_ff'), ser(parseFF('', s))];
      parseFF('?ff=poll', s); out.cleared2 = [ser(parseFF('?ff=%20%20', s)), s.m.has('wgb_ff'), ser(parseFF('', s))];
      parseFF('?ff=poll', s); out.first = ser(parseFF('?ff=bingo&ff=poll', s)); out.noQ = ser(parseFF('ff=bingo', s));
      out.nothing = [ser(parseFF('', mem())), ser(parseFF('?other=1', mem())), ser(parseFF(undefined, mem())), ser(parseFF('?ff=poll', null)), ser(parseFF('', null))];
      const bad = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() { throw new Error('denied'); } };
      out.denied = [ser(parseFF('?ff=poll', bad)), ser(parseFF('', bad)), ser(parseFF('?ff=', bad))];
      const f1 = parseFF('?ff=poll', mem()); f1.on.add('hacked'); out.fresh = ser(parseFF('?ff=poll', mem()));
      out.types = [parseFF('?ff=poll', mem()).on instanceof Set, parseFF('?ff=poll', mem()).off instanceof Set];
      // 진짜 sessionStorage (두 번째 인자 생략)
      sessionStorage.removeItem('wgb_ff');
      out.real = [ser(parseFF('?ff=poll,-bgm')), sessionStorage.getItem('wgb_ff'), ser(parseFF('')), (parseFF('?ff='), sessionStorage.getItem('wgb_ff')), ser(parseFF(''))];
      return out;
    });
    const E = { all: false, none: false, on: [], off: [] }, ON = on => ({ ...E, on }), OFF = off => ({ ...E, off });
    h.eq('?ff=poll,bingo → on {bingo, poll}, remembered as typed in the tab', [r.basic, r.mem1], [ON(['bingo', 'poll']), 'poll,bingo']);
    h.eq('no ?ff= → the remembered value (even with other parameters)', [r.remembered, r.remembered2], [ON(['bingo', 'poll']), ON(['bingo', 'poll'])]);
    h.eq('a new ?ff= replaces the memory (it does not merge)', [r.minus, r.mem2, r.replaced], [OFF(['bgm']), '-bgm', OFF(['bgm'])]);
    h.eq('all · none · all with an exception · case does not matter', [r.all, r.none, r.allMinus, r.upper],
      [{ ...E, all: true }, { ...E, none: true }, { ...E, all: true, off: ['bgm'] }, { all: true, none: false, on: ['poll'], off: ['bgm'] }]);
    h.eq('+poll is poll (a "+" in a url is a space; %2B too; a leading "+" on each token)', r.plus, [ON(['poll']), ON(['poll']), ON(['bingo', 'poll']), { ...E, on: ['poll'], off: [] }]);
    h.eq('junk tokens are dropped, valid ones kept (_selftest is valid; "__x", "_", "x", "1ab", "a-b", "a_b", "po_ll", "po ll", "Poll!" are not)', r.junk, ON(['_selftest', 'poll']));
    h.eq('ids are 2–16 letters/digits starting with a letter, plus one optional leading _', r.lengths, ON(['_' + 'b'.repeat(15), '_' + 'b'.repeat(16), 'a'.repeat(16), 'ab']));
    h.eq('?ff= (empty) forgets the tab memory and returns nothing', r.cleared, [ON([]), false, ON([])]);
    h.eq('?ff=%20%20 (blank) is the same as empty', r.cleared2, [ON([]), false, ON([])]);
    h.eq('the first ?ff= of the url counts; a search string without "?" works', [r.first, r.noQ], [ON(['bingo']), ON(['bingo'])]);
    h.eq('nothing anywhere → nothing (also when the storage is null)', r.nothing, [ON([]), ON([]), ON([]), ON(['poll']), ON([])]);
    h.eq('a storage that throws never breaks parsing (the url value is still honoured)', r.denied, [ON(['poll']), ON([]), ON([])]);
    h.eq('every call returns fresh objects; on/off are Sets', [r.fresh, r.types], [ON(['poll']), [true, true]]);
    h.eq('default storage = sessionStorage["wgb_ff"] (written, read back, cleared by ?ff=)', r.real, [{ ...E, on: ['poll'], off: ['bgm'] }, 'poll,-bgm', { ...E, on: ['poll'], off: ['bgm'] }, null, ON([])]);
  });

  // ================================================================ ② 부팅 인자 · featureStates 모양
  await h.step('bootFeatures: wrong arguments reject with a TypeError and create nothing; a second call returns the first promise; featureStates() has the documented shape', async () => {
    const p = await lpage('ld-boot', { phase: 'live' });
    const r = await inPage(p, async () => {
      const F = await import('/js/core/features.js'), L = window.__L, out = {};
      const how = async fn => { try { await fn(); return 'resolved'; } catch (e) { return e?.constructor?.name + ': ' + String(e.message).slice(0, 60); } };
      const api = { forFeature: () => ({}) };
      out.before = [F.featureStates(), F.trip('uxa'), F.SETUP_TIMEOUT_MS, F.SLOTS];
      out.bad = [await how(() => F.bootFeatures('nope', api)), await how(() => F.bootFeatures('Guest', api)), await how(() => F.bootFeatures(undefined, api)),
        await how(() => F.bootFeatures('guest')), await how(() => F.bootFeatures('guest', {})), await how(() => F.bootFeatures('guest', { forFeature: 5 })), await how(() => F.bootFeatures('guest', null))];
      out.afterBad = F.featureStates().length;                               // 거부된 호출은 로더를 만들지 않음 → 올바른 호출이 아직 가능
      const t0 = performance.now();
      const entries = [L.entry('uxa', async () => {}), L.entry('uxb', async () => {}, { status: 'planned' }), L.entry('uxc', async () => {}, { pages: ['village'] }), L.entry('uxd', async () => {}, { phases: ['after'] })];
      entries.push(L.entry('uxa', async () => {}, { status: 'planned' }));      // 같은 id 가 또 나오면 → 첫 항목만 (두 번째는 planned 라서 덮어쓰면 uxa 의 source 가 달라짐)
      const p1 = F.bootFeatures('guest', { forFeature: () => ({}) }, { manifest: entries });
      const p2 = F.bootFeatures('village', { forFeature: () => { throw new Error('never'); } }, { manifest: [] });
      out.same = p1 === p2; out.isPromise = p1 instanceof Promise;
      out.resolved = await p1; out.bootMs = performance.now() - t0;
      const sts = F.featureStates();
      out.ids = sts.map(s => s.id);
      out.keys = Object.keys(sts[0]).sort(); out.liveKeys = Object.keys(sts[0].live).sort();
      out.rows = sts.map(s => [s.id, s.on, s.source, s.tripped, s.errors, s.lastError, s.status]);
      out.name = sts[0].name;
      const g0 = performance.now(); await F.whenGateReady(2000); out.gateMs = performance.now() - g0;
      out.trip = [F.trip('nope'), F.trip(''), F.trip(undefined)];
      return out;
    });
    h.eq('before boot: no states, trip() is false, SETUP_TIMEOUT_MS is 3000, the one-feature slots of 02 §7.8', r.before, [[], false, 3000, ['presence', 'tickerExtra', 'tickerPrefix', 'coupleSprites']]);
    h.eq('unknown / lower-case-violating / missing page, missing / empty / wrong pageApi → TypeError', r.bad.map(x => x.split(':')[0]), Array(7).fill('TypeError'));
    h.eq('…and each message says what is wrong', r.bad.map(x => x.replace(/^TypeError: /, '')), ['bootFeatures: unknown page "nope"', 'bootFeatures: unknown page "Guest"', 'bootFeatures: unknown page "undefined"',
      'bootFeatures: pageApi.forFeature(scope) is required', 'bootFeatures: pageApi.forFeature(scope) is required', 'bootFeatures: pageApi.forFeature(scope) is required', 'bootFeatures: pageApi.forFeature(scope) is required']);
    h.eq('a rejected call creates no loader (featureStates() stays empty)', r.afterBad, 0);
    h.check('a second call (any page, any arguments) returns the very same promise; boot resolves (never rejects)', r.same && r.isPromise && r.resolved === undefined);
    h.check('boot resolves quickly when there is nothing to load', r.bootMs < 2500, r.bootMs.toFixed(0) + ' ms');
    h.eq('one record per manifest id, in manifest order (a repeated id is ignored — the FIRST entry of an id wins, see the uxa row below)', r.ids, ['uxa', 'uxb', 'uxc', 'uxd']);
    h.eq('state fields', [r.keys, r.liveKeys], [['errors', 'id', 'lastError', 'live', 'name', 'on', 'source', 'status', 'tripped'], ['bus', 'listeners', 'raf', 'timers', 'watchers']]);
    h.eq('beta without a flag → off/beta · planned → off/planned · wrong page → off/page · wrong phase → off/phase (nothing tripped, no errors)', r.rows,
      [['uxa', false, 'beta', false, 0, null, 'beta'], ['uxb', false, 'planned', false, 0, null, 'planned'], ['uxc', false, 'page', false, 0, null, 'beta'], ['uxd', false, 'phase', false, 0, null, 'beta']]);
    h.eq('the manifest name is passed through', r.name, { ko: 'uxa', en: 'uxa' });
    h.check('whenGateReady() with no gate feature resolves as soon as the settings have arrived (no waiting for anyone)', r.gateMs < 800, r.gateMs.toFixed(0) + ' ms');
    h.eq('trip(unknown id) is false', r.trip, [false, false, false]);
  });

  // ================================================================ ③ 진짜 _selftest
  await h.step('the real _selftest feature: ?ff=_selftest loads it (style.css, root class, timer, listener, bus, frame, document watch, text override) — and nothing else', async () => {
    const p = await lpage('ld-selftest', { phase: 'live', ff: '_selftest' });
    const r = await inPage(p, async () => {
      const F = await import('/js/core/features.js'), L = window.__L, I = await import('/js/i18n.js'), out = {};
      await L.rec(['feature:state', 'feature:error', 'lang']);
      const probeBefore = I.t('_selftest_probe');
      const con = L.con();
      await L.boot('guest');                                                  // 진짜 매니페스트
      await L.sleep(700);
      const badge = document.querySelector('[data-st="badge"]'), st = await L.state('_selftest'), all = F.featureStates();
      out.on = all.filter(s => s.on).map(s => [s.id, s.source]);
      out.others = all.filter(s => s.id !== '_selftest').map(s => s.source).filter((v, i, a) => a.indexOf(v) === i).sort();
      out.badge = badge && { page: badge.dataset.page, text: badge.textContent, display: getComputedStyle(badge).display, df: badge.getAttribute('data-f'), flags: badge.dataset.flags, raf: badge.dataset.raf, db: badge.dataset.db, ticks: +badge.dataset.ticks };
      out.text = [I.t('_selftest_badge'), probeBefore, I.t('_selftest_probe')];
      out.html = L.html(); out.link = [...document.querySelectorAll('link[data-f="_selftest"]')].map(l => [l.getAttribute('href'), !!l.sheet]);
      out.trace = L.trace('_selftest');
      out.live = st.live; out.state = [st.on, st.source, st.tripped, st.errors, st.lastError, st.status];
      out.refresh = window.__stub.refresh; out.api = window.__stub.apis._selftest;
      out.events = { state: window.__ev['feature:state'], error: window.__ev['feature:error'], lang: window.__ev.lang.length };
      out.con = { warn: con.warn.length, error: con.error.length };
      window.dispatchEvent(new Event('resize'));
      out.resized = badge.dataset.resized;
      return out;
    });
    h.eq('only _selftest is on, because the url asked for it', r.on, [['_selftest', 'url']]);
    h.eq('every other feature is off for a plain reason (planned / wrong page / wrong phase), none tripped', r.others, ['page', 'phase', 'planned']);
    h.eq('the marker node: page, text from i18n (ko), hidden by style.css, tagged data-f, setup ran its probes (settings replay, frame, document watch)',
      [r.badge?.page, r.badge?.text, r.badge?.display, r.badge?.df, r.badge?.flags, r.badge?.raf, r.badge?.db], ['guest', '코어 자체 점검', 'none', '_selftest', '0', '1', '1']);
    h.check('the 200 ms timer keeps running (≥ 3 ticks in 0.7 s)', r.badge?.ticks >= 3, String(r.badge?.ticks));
    h.eq('ctx.texts: the feature’s own key is overridden while it is on', r.text, ['코어 자체 점검', '_selftest_probe', '덮어쓴 점검 문구']);
    h.eq('ctx.rootClass puts f-_selftest-on on <html>; the <link data-f> exists and its sheet loaded', [r.html, r.link], ['f-_selftest-on', [['js/features/_selftest/style.css', true]]]);
    h.eq('footprint while on: 1 node, 1 link, 2 elements with an f-_selftest- class (<html> and the node)', r.trace, { nodes: 1, links: 1, classes: 2 });
    h.eq('counters: resize listener 1 · interval 1 · frame 0 (stopped itself) · doc watcher 1 · bus 1 (settings)', [r.live.listeners, r.live.timers, r.live.raf, r.live.watchers, r.live.bus], [1, 1, 0, 1, 1]);
    h.eq('state: on, from the url, no errors', r.state, [true, 'url', false, 0, null, 'planned']);
    h.eq('the page API got the scope and its answer became ctx.guest', r.api, { guest: { id: '_selftest', page: 'guest' } });
    h.eq('ctx.texts called the page’s refreshTexts exactly once (and never emitted a "lang" event)', [r.refresh, r.events.lang], [1, 0]);
    h.eq('one feature:state event {on: true, source: "url"}, no feature:error', [r.events.state, r.events.error], [[{ id: '_selftest', on: true, source: 'url' }], []]);
    h.eq('nothing was printed as a warning or an error', r.con, { warn: 0, error: 0 });
    h.eq('the resize listener works', r.resized, '1');
  });

  await h.step('the real _selftest feature: without ?ff= (or with ?ff=-_selftest, ?ff=all, ?ff=none) it never loads and leaves no trace; on another page and in another phase too', async () => {
    const cases = [['plain', {}, 'guest'], ['minus', { ff: '-_selftest' }, 'guest'], ['all', { ff: 'all' }, 'guest'], ['none', { ff: 'none' }, 'guest'], ['minus-wins', { ff: '_selftest,-_selftest' }, 'guest'],
      ['village', { ff: '_selftest' }, 'village'], ['kiosk', { ff: '_selftest' }, 'kiosk'], ['admin', { ff: '_selftest' }, 'admin']];
    const out = [];
    for (const [tag, params, page] of cases) {
      const p = await lpage('ld-st-' + tag, { phase: 'after', ...params });
      out.push([tag, ...(await inPage(p, async pg => {
        const F = await import('/js/core/features.js'), L = window.__L;
        const con = L.con();
        await L.boot(pg);
        const st = await L.state('_selftest'), api = window.__stub.apis._selftest;
        return [[st.on, st.source], L.trace('_selftest'), L.html(), document.querySelector('[data-st="badge"]')?.dataset.page ?? null, F.featureStates().filter(s => s.on).length, con.error.length, api ? Object.keys(api) : null];
      }, page))]);
    }
    const get = tag => out.find(o => o[0] === tag).slice(1);
    const none = { nodes: 0, links: 0, classes: 0 };
    h.eq('no ?ff= → off (planned), no trace, nothing else loaded (the real manifest is all planned)', get('plain'), [[false, 'planned'], none, '', null, 0, 0, null]);
    h.eq('?ff=-_selftest → off (url)', get('minus').slice(0, 5), [[false, 'url'], none, '', null, 0]);
    // ?ff=all loads every real feature that has code and covers (guest, after) — 2026-10: wall — and those must cope with this stub page API
    const { FEATURES } = await import(pathToFileURL(path.join(h.publicDir, 'js/features/index.js')).href);
    const withCode = FEATURES.filter(f => f.id[0] !== '_' && f.pages.includes('guest') && f.phases.includes('after') && fs.existsSync(path.join(h.publicDir, 'js/features', f.id, 'index.js'))).length;
    h.eq(`?ff=all does not load _selftest — the planned features without a folder only warn, the ${withCode} with code load quietly (no error)`, get('all'), [[false, 'planned'], none, '', null, withCode, 0, null]);
    h.eq('?ff=none → off (url)', get('none').slice(0, 5), [[false, 'url'], none, '', null, 0]);
    h.eq('-_selftest beats _selftest', get('minus-wins').slice(0, 5), [[false, 'url'], none, '', null, 0]);
    h.eq('village (phase after: _selftest runs in every phase) → on, page village, ctx.v from the page API', [get('village')[0], get('village')[3], get('village')[6]], [[true, 'url'], 'village', ['v']]);
    h.eq('kiosk → on, page kiosk, ctx.guest', [get('kiosk')[0], get('kiosk')[3], get('kiosk')[6]], [[true, 'url'], 'kiosk', ['guest']]);
    h.eq('admin → on, page admin, ctx.admin', [get('admin')[0], get('admin')[3], get('admin')[6]], [[true, 'url'], 'admin', ['admin']]);
  });

  // ================================================================ ④ 핫 토글 · 흔적 0 (A7)
  await h.step('A7 hot toggle: an admin flag turns a feature on and off without a reload — "off" leaves no node, link, class, listener, timer, frame, subscription or text override (checked in the browser, not only by the loader’s counters)', async () => {
    const p = await lpage('ld-hot', { phase: 'live' });
    const r = await inPage(p, async () => {
      const L = window.__L, T = window.__T, out = { stages: {} };
      const S = L.spy(); T.actor('admin');
      const st = await import('/js/core/settings.js'), bus = await import('/js/core/bus.js'), I = await import('/js/i18n.js'), db = await T.db();
      await L.rec(['feature:state', 'feature:error', 'lang']);
      const con = L.con();
      const titleBefore = I.t('title');
      await L.boot('guest', [L.sink('uxsink', { claim: 'presence' }), L.ctl('uxctl')]);
      const waitOn = id => L.until(async () => (await L.state(id)).on), waitOff = id => L.until(async () => !(await L.state(id)).on);
      const shot = async (name, id = 'uxsink') => {
        const s = await L.state(id), R = L.rec2(id);
        out.stages[name] = { on: s.on, source: s.source, live: s.live, trace: L.trace(id), spy: S.active(), html: L.html(), bus: bus.count(id), calls: { ...R.calls }, setups: R.setups, cleanups: R.cleanups,
          title: I.t('title'), refresh: window.__stub.refresh, ctlEvery: L.rec2('uxctl').calls.every || 0, ctlNodes: document.querySelectorAll('[data-f="uxctl"]').length };
      };
      await shot('boot');
      await st.setFeature('uxctl', true); await waitOn('uxctl'); await L.sleep(120); await shot('ctl', 'uxctl');
      const base = { ...out.stages.ctl.spy };
      await st.setFeature('uxsink', true); out.on1 = await waitOn('uxsink'); await L.sleep(250); await shot('on1');
      // 켜져 있는 동안 모든 등록이 실제로 일한다
      const R = window.__sink.uxsink, c0 = { ...R.calls };
      R.node.click(); window.dispatchEvent(new Event('resize')); document.dispatchEvent(new Event('visibilitychange'));
      R.ctx.bus.emit('uxsink:ping', 1);
      await st.setLive({ quiet: true });
      await db.doc('polls/p1').set({ q: { ko: '가', en: 'a' }, kind: 'choice', options: ['x', 'y'], open: true, order: 1, createdAt: db.ts(), updatedAt: db.ts() });
      await st.setFeature('zzz', true);
      await L.sleep(200);
      out.worked = Object.fromEntries(Object.keys(R.calls).map(k => [k, R.calls[k] - (c0[k] || 0)]));
      out.rafArgs = R.rafArgs; out.perfNow = performance.now() / 1000;
      await shot('on1b');
      // 끄기
      await st.setFeature('uxsink', false); out.off1 = await waitOff('uxsink'); await shot('off1');
      const callsOff = { ...window.__sink.uxsink.calls };
      R.node.click(); window.dispatchEvent(new Event('resize')); document.dispatchEvent(new Event('visibilitychange'));
      bus.emit('uxsink:ping', 2);
      await st.setLive({ quiet: false });
      await db.doc('polls/p2').set({ q: { ko: '나', en: 'b' }, kind: 'choice', options: ['x', 'y'], open: true, order: 2, createdAt: db.ts(), updatedAt: db.ts() });
      await st.setFeature('zzz2', true);
      await L.sleep(450);
      await shot('off1b');
      out.afterOffCalls = callsOff; out.afterOffCalls2 = { ...window.__sink.uxsink.calls };
      out.ctxAfterOff = (() => {                                                // 죽은 ctx 는 아무 것도 새로 등록하지 않는다
        const x = R.ctx, b = L.trace('uxsink'), a0 = S.active(), n0 = bus.count('uxsink');
        x.every(10, () => {}); x.after(987654, () => {}); x.listen(window, 'resize', () => {}); x.raf(() => {}); x.bus.on('live', () => {}); x.rootClass('late'); x.texts({ ko: { title: 'LATE' } }); x.db.doc('app/live').watch(() => {});
        return { trace: L.trace('uxsink'), spy: S.active(), same: JSON.stringify(a0) === JSON.stringify(S.active()), bus: bus.count('uxsink') - n0, html: L.html(), title: I.t('title'), alive: window.__stub.scopes.uxsink.alive() };
      })();
      let cb = 0; R.ctx.onCleanup(() => { cb++; }); out.lateCleanup = cb;       // 이미 꺼졌으면 onCleanup 은 곧바로 실행
      // 다시 켜기 (setup 이 두 번째로 불림 — 자리 claim 도 다시 성공해야 함)
      await st.setFeature('uxsink', true); out.on2 = await waitOn('uxsink'); await L.sleep(250); await shot('on2');
      // 본식 안전 모드: liveSafe 가 아닌 기능만 꺼진다
      await st.setSafe(true); out.safeOff = await waitOff('uxsink'); await L.sleep(100); await shot('safe');
      const ctlDuringSafe = await L.state('uxctl');
      await st.setSafe(false); out.safeOn = await waitOn('uxsink'); await shot('unsafe');
      // 관리자가 기본값으로 되돌림 (null) → beta 라 꺼짐
      await st.setFeature('uxsink', null); out.nullOff = await waitOff('uxsink'); await shot('null');
      out.ctlDuringSafe = [ctlDuringSafe.on, ctlDuringSafe.source];
      out.events = window.__ev['feature:state'].map(e => `${e.id}:${e.on ? 'on' : 'off'}:${e.source}`);
      out.errors = window.__ev['feature:error'].length; out.lang = window.__ev.lang.length;
      out.con = { warn: con.warn.length, error: con.error.length };
      out.base = base; out.titleBefore = titleBefore;
      return out;
    });
    const S = r.stages, ZERO = { listeners: 0, timers: 0, raf: 0, watchers: 0, bus: 0 }, NO = { nodes: 0, links: 0, classes: 0 };
    h.eq('boot: both features are off (beta, no flag) and nothing is registered anywhere', [S.boot.on, S.boot.source, S.boot.live, S.boot.trace, S.boot.spy, S.boot.html, S.boot.bus],
      [false, 'beta', ZERO, NO, { intervals: 0, timeouts: 0, raf: 0, listeners: 0 }, '', 0]);
    h.eq('the control feature comes on from an admin flag (hot, no reload) and registers exactly one interval', [S.ctl.on, S.ctl.spy, S.ctl.ctlNodes], [true, { intervals: 1, timeouts: 0, raf: 0, listeners: 0 }, 1]);
    h.check('ON: the flag turned the feature on, source "admin"', r.on1 && S.on1.on && S.on1.source === 'admin');
    h.eq('ON: the loader’s counters = what setup registered (3 listeners incl. the node’s click · 2 timers [the 30 ms one already fired and let go] · 1 frame loop · 2 doc watchers · 5 bus handlers)',
      S.on1.live, { listeners: 3, timers: 2, raf: 1, watchers: 2, bus: 5 });
    h.eq('ON: …and the browser agrees (control + sink: 2 intervals, 1 pending long timeout, 1 frame loop, 3 listeners)', S.on1.spy, { intervals: 2, timeouts: 1, raf: 1, listeners: 3 });
    h.eq('ON: DOM — the node and its child carry data-f, <html> and the node carry f-uxsink- classes (mode once although asked twice), no link (no css)', [S.on1.trace, S.on1.html], [{ nodes: 2, links: 0, classes: 2 }, 'f-uxsink-mode f-uxsink-other']);
    h.eq('ON: the text override is live, the page was asked to repaint once, no "lang" event was sent', [S.on1.title, S.on1.refresh, r.lang], ['SINK-uxsink', 1, 0]);
    h.check('ON: every registration kind worked on its own (click, resize, visibilitychange, bus ping, settings, live, onSettings, onLive, doc watch, collection watch, interval, frame, the early timer once)',
      r.worked.click === 1 && r.worked.resize === 1 && r.worked.vis === 1 && r.worked.ping === 1 && r.worked.settings >= 1 && r.worked.onSettings >= 1 && r.worked.live >= 1 && r.worked.onLive >= 1 &&
      r.worked.docwatch >= 1 && r.worked.colwatch >= 1 && r.worked.every >= 1 && r.worked.raf >= 3 && S.on1.calls.afterFast === 1 && !S.on1.calls.after, JSON.stringify(r.worked));
    h.check('ctx.raf: the first frame has dt 0, later ones 0 < dt ≤ 0.1 (seconds), and "now" is in seconds on the page’s performance.now() clock (never later than the page’s own clock, never more than 2 minutes before it)',
      r.rafArgs[0][0] === 0 && r.rafArgs.slice(1).every(a => a[0] > 0 && a[0] <= 0.1) && r.rafArgs.every(a => a[1] > 0 && a[1] <= r.perfNow && r.perfNow - a[1] < 120), JSON.stringify([r.rafArgs.slice(0, 3), r.perfNow]));
    h.check('OFF: the flag turned it off', r.off1 && !S.off1.on && S.off1.source === 'admin');
    h.eq('OFF: loader counters all zero, bus subscriptions zero', [S.off1.live, S.off1.bus], [ZERO, 0]);
    h.eq('OFF: the browser agrees — back to the control feature’s single interval; no node, link, class on <html> or elsewhere (A7)', [S.off1.spy, S.off1.trace, S.off1.html], [{ intervals: 1, timeouts: 0, raf: 0, listeners: 0 }, NO, '']);
    h.eq('OFF: the text override is gone (original title again) and the page was asked to repaint once more', [S.off1.title, S.off1.refresh, S.off1.title === r.titleBefore], [r.titleBefore, 2, true]);
    h.eq('OFF: onCleanup callbacks ran exactly once; the feature’s setup ran once', [S.off1.cleanups, S.off1.setups], [1, 1]);
    h.eq('OFF: after 0.45 s of clicks, resize, visibilitychange, a bus ping, live/poll/settings writes — not one callback ran', r.afterOffCalls2, r.afterOffCalls);
    h.eq('OFF: nothing changed in the 0.45 s either (counters, browser, DOM)', [S.off1b.live, S.off1b.spy, S.off1b.trace, S.off1b.bus, S.off1b.html], [S.off1.live, S.off1.spy, S.off1.trace, S.off1.bus, S.off1.html]);
    h.eq('a dead ctx registers nothing: no timer, listener, frame, bus handler, root class, watcher or text override; the scope is not alive', [r.ctxAfterOff.trace, r.ctxAfterOff.same, r.ctxAfterOff.bus, r.ctxAfterOff.html, r.ctxAfterOff.title === r.titleBefore, r.ctxAfterOff.alive], [NO, true, 0, '', true, false]);
    h.eq('…and ctx.onCleanup on a dead ctx runs the function at once', r.lateCleanup, 1);
    h.eq('the control feature kept working through all of it: its interval ticked on, its node stayed (exactly one)', [S.off1b.ctlEvery > S.on1.ctlEvery, S.off1b.ctlNodes, S.null.ctlNodes], [true, 1, 1]);
    h.check('ON again: setup ran a second time and gave the same counters, the same single set of nodes (no duplicates), and the claim on "presence" worked again', r.on2 && S.on2.setups === 2 && JSON.stringify(S.on2.live) === JSON.stringify(S.on1.live) && JSON.stringify(S.on2.trace) === JSON.stringify(S.on1.trace) && S.on2.html === S.on1.html && S.on2.source === 'admin');
    h.eq('ON again: the browser sees the same registrations as the first time', S.on2.spy, S.on1.spy);
    h.eq('safe mode (demo): a feature that is not liveSafe goes off (source "safe"), a liveSafe one stays on — and the sink leaves no trace again', [r.safeOff, S.safe.on, S.safe.source, S.safe.live, S.safe.trace, S.safe.spy, r.ctlDuringSafe], [true, false, 'safe', ZERO, NO, { intervals: 1, timeouts: 0, raf: 0, listeners: 0 }, [true, 'admin']]);
    h.check('…leaving safe mode brings it back (the flag is still true): third setup', r.safeOn && S.unsafe.on && S.unsafe.setups === 3);
    h.eq('the admin resets the flag to null (= manifest default → beta = off): off, source "beta", nothing left', [r.nullOff, S.null.on, S.null.source, S.null.live, S.null.trace, S.null.spy, S.null.html, S.null.title === r.titleBefore], [true, false, 'beta', ZERO, NO, { intervals: 1, timeouts: 0, raf: 0, listeners: 0 }, '', true]);
    h.eq('feature:state events: ctl on · sink on · off · on · off (safe) · on · off — each with its source', r.events,
      ['uxctl:on:admin', 'uxsink:on:admin', 'uxsink:off:admin', 'uxsink:on:admin', 'uxsink:off:safe', 'uxsink:on:admin', 'uxsink:off:beta']);
    h.eq('through six toggles: no feature:error, no "lang" event, nothing printed as warning or error', [r.errors, r.lang, r.con], [0, 0, { warn: 0, error: 0 }]);
  });

  // ================================================================ ⑤ 서킷 브레이커 (A8)
  await h.step('A8 circuit breaker: ?fcrash=<id> → 5 forced errors → the feature is tripped for the session and torn down completely; the other feature and the page go on; a flag cannot revive it; a new session is fine', async () => {
    const p = await lpage('ld-breaker', { phase: 'live', fcrash: 'uxbad', ff: 'uxbad,uxgood' });
    const r = await inPage(p, async () => {
      const L = window.__L, T = window.__T, out = {};
      const S = L.spy(), con = L.con(); T.actor('admin');
      await L.rec(['feature:state', 'feature:error']);
      const st = await import('/js/core/settings.js'), bus = await import('/js/core/bus.js');
      await L.boot('guest', [L.bad('uxbad'), L.ctl('uxgood')]);
      out.tripped = await L.until(async () => (await L.state('uxbad')).tripped, 5000);
      await L.sleep(100);
      const goodAt = L.rec2('uxgood').calls.every;
      await L.sleep(300);
      out.goodTicks = [goodAt, L.rec2('uxgood').calls.every];
      const a = await L.state('uxbad'), g = await L.state('uxgood');
      out.bad = [a.on, a.source, a.tripped, a.errors, a.lastError, a.live, L.trace('uxbad'), bus.count('uxbad')];
      out.good = [g.on, g.source, g.tripped, g.errors, g.lastError];
      out.spy = S.active(); out.html = L.html();
      out.calls = { ...L.rec2('uxbad').calls };
      out.alive = window.__stub.scopes.uxbad.alive(); out.cleanups = L.rec2('uxbad').cleanups;
      out.errEvents = window.__ev['feature:error'].map(e => [e.id, e.count, e.tripped, e.message.replace(/ in uxbad$/, '')]);
      out.stateEvents = window.__ev['feature:state'].map(e => `${e.id}:${e.on ? 'on' : 'off'}:${e.source}`).sort();
      out.con = { error: con.error.slice(), warn: con.warn.length };
      // 관리자 플래그로도, ?ff 로도 되살릴 수 없음
      for (const v of [true, false, true]) { await st.setFeature('uxbad', v); await L.sleep(80); }
      const b = await L.state('uxbad'); out.revive = [b.on, b.source, b.tripped, L.rec2('uxbad').setups, L.trace('uxbad')];
      // 이미 죽은 ctx 로 guard 한 함수도 아무 일 안 함
      out.deadGuard = [L.rec2('uxbad').guarded(), L.rec2('uxbad').calls.guarded || 0];
      out.page = !!document.querySelector('[data-st="ctl"]');
      return out;
    });
    h.check('five forced errors tripped it', r.tripped);
    h.eq('uxbad: off · source "tripped" · tripped · 5 errors · last message names the forced error · counters 0 · no node/link/class · no bus handler',
      r.bad, [false, 'tripped', true, 5, '[fcrash] forced error 5/5 in uxbad', { listeners: 0, timers: 0, raf: 0, watchers: 0, bus: 0 }, { nodes: 0, links: 0, classes: 0 }, 0]);
    h.eq('the browser agrees: only the good feature’s interval remains; <html> has no class left', [r.spy, r.html], [{ intervals: 1, timeouts: 0, raf: 0, listeners: 0 }, '']);
    h.eq('uxbad’s callbacks never ran their bodies (the forced error comes first) and its onCleanup/scope are done', [r.calls, r.alive], [{}, false]);
    h.eq('uxgood is untouched: on, no errors — and its interval kept ticking through and after the trip', [r.good, r.goodTicks[1] > r.goodTicks[0]], [[true, 'url', false, 0, null], true]);
    h.eq('feature:error events: counts 1…5, only the last has tripped: true', r.errEvents, [1, 2, 3, 4, 5].map(n => ['uxbad', n, n === 5, `[fcrash] forced error ${n}/5`]));
    h.eq('feature:state events: both on at boot, then uxbad off with source "tripped"', r.stateEvents, ['uxbad:off:tripped', 'uxbad:on:url', 'uxgood:on:url']);
    h.eq('the console shows exactly the five forced errors (and nothing else)', [r.con.error.length, r.con.error.every(m => /^\[f:uxbad\] \[fcrash\] forced error \d\/5 in uxbad$/.test(m)), r.con.warn], [5, true, 0]);
    h.eq('an admin flag (true, false, true) cannot revive a tripped feature in this session: still off/tripped, setup never ran again, no trace', r.revive, [false, 'tripped', true, 1, { nodes: 0, links: 0, classes: 0 }]);
    h.eq('a guarded function kept by a dead feature does nothing (returns undefined, body not run)', r.deadGuard, [undefined, 0]);
    h.check('the page itself is fine (the other feature’s node is there, no uncaught error — the harness would have failed)', r.page);

    // 새 세션(새 페이지, ?fcrash 없음) → 같은 기능이 정상. 트립은 저장되지 않는다
    const p2 = await lpage('ld-breaker-new', { phase: 'live', ff: 'uxbad' });
    const r2 = await inPage(p2, async () => {
      const L = window.__L; await L.boot('guest', [L.bad('uxbad')]); await L.sleep(250);
      const s = await L.state('uxbad'); return [s.on, s.source, s.tripped, s.errors, L.rec2('uxbad').calls.every > 3];
    });
    h.eq('a new session without ?fcrash: the same feature is on, its interval runs, no errors (a trip is never stored)', r2, [true, 'url', false, 0, true]);
  });

  await h.step('circuit breaker: 5 errors within 60 s — slow errors never add up; the same error object counts once; errors come from guarded callbacks, bus handlers, node handlers and scope.report; trip() trips at once', async () => {
    const p = await lpage('ld-win', { phase: 'live', ff: 'uxwin,uxwin2,uxwin3,uxwin4,uxwin5,uxwin6,uxwin7,uxwin8' });
    const r = await inPage(p, async () => {
      const L = window.__L, F = await import('/js/core/features.js'), bus = await import('/js/core/bus.js'), out = {};
      const n0 = Date.now.bind(Date); window.__skew = 0; window.__fix = null; Date.now = () => (window.__fix ?? (n0() + window.__skew));      // 시계를 앞으로 돌리거나(__skew) 딱 고정(__fix)할 수 있게
      L.con(); await L.rec(['feature:error', 'feature:state']);
      await L.boot('guest', ['uxwin', 'uxwin2', 'uxwin3', 'uxwin4', 'uxwin5', 'uxwin6', 'uxwin7', 'uxwin8'].map(id => L.bad(id, { quiet: true })));
      await L.sleep(100);
      const state = async id => { const s = await L.state(id); return [s.errors, s.tripped, s.on]; };
      const boom = id => { try { L.rec2(id).boom(); } catch (e) { out.threw = String(e); } };
      // uxwin: 느린 오류 — 4개 → 61 초 뒤 4개 → 모두 합쳐 8개지만 60 초 안에는 4개뿐
      for (let i = 0; i < 4; i++) boom('uxwin'); out.w1 = await state('uxwin');
      window.__skew = 61000; for (let i = 0; i < 4; i++) boom('uxwin'); out.w2 = await state('uxwin');
      boom('uxwin'); out.w3 = await state('uxwin');
      // uxwin2: 4개, 59 초 뒤 1개 → 60 초 안에 5개 → 트립
      window.__skew = 0;
      for (let i = 0; i < 4; i++) boom('uxwin2'); window.__skew = 59000; out.w4a = await state('uxwin2'); boom('uxwin2'); out.w4 = await state('uxwin2');
      // uxwin3: 같은 오류 객체를 여러 번 알려도 1번 (scope.report)
      window.__skew = 0;
      const sc = window.__stub.scopes.uxwin3, e = new Error('same'); for (let i = 0; i < 10; i++) sc.report(e); out.same = await state('uxwin3');
      sc.report('a string error'); sc.report(null); sc.report(undefined); out.kinds = await state('uxwin3');
      // uxwin4: 버스 핸들러 · 노드 핸들러 오류도 집계 (bus.emit 은 핸들러 오류를 삼킴)
      const R4 = L.rec2('uxwin4');
      for (let i = 0; i < 3; i++) bus.emit('uxwin4:boom', i); out.b1 = await state('uxwin4');
      document.querySelector('[data-f="uxwin4"]').click(); document.querySelector('[data-f="uxwin4"]').click(); out.b2 = await state('uxwin4');
      // uxwin5: trip() 는 5개를 기다리지 않는다
      out.t1 = [F.trip('uxwin5', 'manual stop'), await state('uxwin5')];
      const s5 = await L.state('uxwin5'); out.t2 = [s5.source, s5.lastError, s5.live, L.trace('uxwin5'), L.rec2('uxwin5').cleanups];
      out.t3 = [F.trip('uxwin5'), (await L.state('uxwin5')).errors];                                 // 두 번째 trip: 아무 일도 다시 하지 않음
      // uxwin6 · uxwin7: 창의 경계 — 정확히 60 000 ms 뒤의 5번째 오류는 "60초 안"(포함), 1 ms 더 늦으면 아님 (시계를 고정해서 ms 단위로 잰다)
      window.__fix = 5e12; for (let i = 0; i < 4; i++) boom('uxwin6'); out.e0 = await state('uxwin6'); window.__fix = 5e12 + 60000; boom('uxwin6'); out.e1 = await state('uxwin6');
      window.__fix = 6e12; for (let i = 0; i < 4; i++) boom('uxwin7'); window.__fix = 6e12 + 60001; boom('uxwin7'); out.e2 = await state('uxwin7');
      window.__fix = null;
      // uxwin8: 이미 꺼진(트립된) 기능의 늦은 오류는 세지 않고 feature:error 도 내지 않는다 (scope.report · 가드된 콜백 모두)
      for (let i = 0; i < 3; i++) boom('uxwin8'); out.l1 = await state('uxwin8');
      const sc8 = window.__stub.scopes.uxwin8, evN = () => window.__ev['feature:error'].filter(x => x.id === 'uxwin8').length;
      F.trip('uxwin8', 'late test'); const evTrip = evN();                                             // trip() 자신의 feature:error 1개는 센다
      sc8.report(new Error('late 0')); L.rec2('uxwin8').boom();                                        // 같은 틱 — 이미 dead 이지만 아직 정리 전
      out.l2 = await state('uxwin8');
      out.l3 = [(await L.state('uxwin8')).errors, evN() - evTrip];
      await L.sleep(50); sc8.report(new Error('late 2')); sc8.report('late 3'); out.l4 = [(await L.state('uxwin8')).errors, evN() - evTrip, L.rec2('uxwin8').n];   // 정리가 끝난 뒤
      out.ev = window.__ev['feature:error'].filter(x => x.id === 'uxwin5').map(x => [x.message, x.tripped]);
      out.ev2 = window.__ev['feature:error'].filter(x => x.id === 'uxwin').map(x => [x.count, x.tripped]).slice(-2);
      out.threw = out.threw || null;
      return out;
    });
    h.eq('4 errors: not tripped; 61 s later 4 more (8 in all but 4 in any 60 s): still not tripped; the next one makes 5 within 60 s → tripped', [r.w1, r.w2, r.w3], [[4, false, true], [8, false, true], [9, true, false]]);
    h.eq('the boundary: 4 errors, then one 59 s later = 5 within 60 s → tripped (and not before)', [r.w4a, r.w4], [[4, false, true], [5, true, false]]);
    h.eq('reporting the very same Error object ten times counts once; a string, null and undefined each count', [r.same, r.kinds], [[1, false, true], [4, false, true]]);
    h.eq('errors thrown by bus handlers (3 emits) and by a node click handler (2) are counted too → 5 → tripped (and the emit/click themselves never throw)', [r.b1, r.b2, r.threw], [[3, false, true], [5, true, false], null]);
    h.eq('trip(id, reason): immediate, tripped on the first call; the reason is the message; everything torn down; the second call does nothing more', [r.t1, r.t2, r.t3], [[true, [1, true, false]], ['tripped', 'manual stop', { listeners: 0, timers: 0, raf: 0, watchers: 0, bus: 0 }, { nodes: 0, links: 0, classes: 0 }, 0], [true, 2]]);
    h.eq('trip() sends feature:error { tripped: true, message: reason } (once per call)', r.ev, [['manual stop', true], ['tripped', true]]);
    h.eq('the 9th error of uxwin reports count 9 and tripped: true; the one before it count 8, not tripped', r.ev2, [[8, false], [9, true]]);
    h.eq('the window is inclusive: 4 errors, the 5th exactly 60 000 ms later still counts as "within 60 s" → tripped', [r.e0, r.e1], [[4, false, true], [5, true, false]]);
    h.eq('…and 60 001 ms later it does not: the first four have left the window (5 errors in all, but 1 in the last 60 s) → not tripped', r.e2, [5, false, true]);
    h.eq('errors from a feature that is already off are ignored: 3 errors, then trip() (4th, tripped) …', [r.l1, r.l2], [[3, false, true], [4, true, false]]);
    h.eq('…a late scope.report or guarded callback adds nothing and sends no feature:error — in the same tick as the trip (not torn down yet) and after the teardown (3 guarded runs happened, the late one did not)', [r.l3, r.l4], [[4, 0], [4, 0, 3]]);
  });

  await h.step('dispose: cleanups run in reverse order of registration, a cleanup that throws is reported but never stops the others, a bus subscription owned by the feature (made outside ctx) is swept too, ctx.onCleanup after the end runs at once', async () => {
    const p = await lpage('ld-dispose', { phase: 'live' });
    const r = await inPage(p, async () => {
      const L = window.__L, T = window.__T, st = await import('/js/core/settings.js'), bus = await import('/js/core/bus.js'), out = {};
      T.actor('admin'); const con = L.con(); await L.rec(['feature:state']);
      const R = L.rec2('uxdis'); R.order = []; R.orphan = 0;
      const mark = k => () => R.order.push(k);
      await L.boot('guest', [L.entry('uxdis', async ctx => {
        R.ctx = ctx; R.setups++;
        ctx.onCleanup(mark('c1'));
        ctx.every(50, () => {});
        ctx.onCleanup(mark('c2'));
        window.__stub.scopes.uxdis.add(mark('s3'));
        ctx.onCleanup(() => { R.order.push('c4-throws'); throw new Error('cleanup boom'); });
        ctx.onCleanup(mark('c5'));
        ctx.rootClass('mode');
        document.body.appendChild(ctx.el('div', { text: 'x' }));
        bus.on('uxdis:orphan', () => { R.orphan++; }, { owner: 'uxdis' });                      // 기능 대신 페이지(00c)가 만들어 주는 구독 — owner 만 같음
      })]);
      await st.setFeature('uxdis', true); out.on = await L.until(async () => (await L.state('uxdis')).on, 3000);
      out.during = [L.trace('uxdis'), L.html(), bus.count('uxdis'), L.rec2('uxdis').order.length];
      bus.emit('uxdis:orphan', 1); out.orphanBefore = R.orphan;
      await st.setFeature('uxdis', false); await L.until(async () => !(await L.state('uxdis')).on, 3000); await L.sleep(60);
      out.order = R.order.slice();
      out.errors = con.error.map(m => m.slice(0, 80));
      const s = await L.state('uxdis');
      out.after = [L.trace('uxdis'), L.html(), bus.count('uxdis'), s.live, s.tripped, s.errors];
      bus.emit('uxdis:orphan', 2); out.orphanAfter = R.orphan;
      out.events = window.__ev['feature:state'].map(e => e.on);
      let late = 0, lateThrow = 0;
      R.ctx.onCleanup(() => { late++; }); R.ctx.onCleanup(() => { lateThrow++; throw new Error('late boom'); });          // 이미 꺼진 뒤: 바로 실행, 오류는 삼킴
      out.late = [late, lateThrow, con.error.length];
      return out;
    });
    h.eq('on: one node, one root class, one swept-able bus subscription; no cleanup has run yet', [r.on, r.during], [true, [{ nodes: 1, links: 0, classes: 1 }, 'f-uxdis-mode', 1, 0]]);
    h.eq('the orphan subscription works while the feature is on', r.orphanBefore, 1);
    h.eq('cleanups run in REVERSE order of registration — ctx.onCleanup and scope.add interleaved (c5, c4, s3, c2, c1) — and the one that throws did not stop the rest', r.order, ['c5', 'c4-throws', 's3', 'c2', 'c1']);
    h.eq('the throwing cleanup is reported once as "[f:uxdis] cleanup failed: cleanup boom" — and nothing else is printed', r.errors, ['[f:uxdis] cleanup failed: cleanup boom']);
    h.eq('afterwards: no node, no root class, no bus subscription of the owner (the orphan too), zero live counters, not tripped, not counted as an error', r.after,
      [{ nodes: 0, links: 0, classes: 0 }, '', 0, { listeners: 0, timers: 0, raf: 0, watchers: 0, bus: 0 }, false, 0]);
    h.eq('the orphan subscription is gone: emitting again calls nothing', r.orphanAfter, 1);
    h.eq('feature:state was announced on, then off — once each', r.events, [true, false]);
    h.eq('ctx.onCleanup after the end runs the function at once; a throwing one is swallowed (no new console error)', r.late, [1, 1, 1]);
  });

  await h.step('a re-evaluation that throws (a damaged manifest entry) is logged and never escapes; the loader works again as soon as the entry is repaired', async () => {
    h.allowErrors({ tag: 'ld-reeval', re: /\[features\] re-evaluation failed/ });
    const p = await lpage('ld-reeval', { phase: 'live' });
    const r = await inPage(p, async () => {
      const L = window.__L, T = window.__T, st = await import('/js/core/settings.js'), out = {};
      T.actor('admin'); const con = L.con();
      const ok = L.entry('uxreok', async () => {}), bad = L.entry('uxrebad', async () => {});
      await L.boot('guest', [ok, bad]);                                                                     // 순서: 멀쩡한 것이 먼저
      const logged = () => con.error.filter(m => /re-evaluation failed/.test(m)).length;
      await st.setFeature('uxreok', true); out.on1 = await L.until(async () => (await L.state('uxreok')).on, 3000); out.log1 = logged();
      const saved = bad.pages; bad.pages = null;                                                            // 항목이 망가짐 → 다음 판정이 throw
      await st.setFeature('uxreok', false); out.off = await L.until(async () => !(await L.state('uxreok')).on, 3000); await L.sleep(100);
      out.log2 = [logged(), con.error.find(m => /re-evaluation failed/.test(m)) || null];
      await st.setFeature('uxreok', true); await L.sleep(300);
      out.log3 = logged();
      bad.pages = saved;                                                                                    // 고침
      await st.setFeature('uxreok', false); await L.until(async () => !(await L.state('uxreok')).on, 3000);
      await st.setFeature('uxreok', true); out.on2 = await L.until(async () => (await L.state('uxreok')).on, 3000); out.log4 = logged();
      return out;
    });
    h.eq('healthy at first: switched on by a flag, nothing logged', [r.on1, r.log1], [true, 0]);
    h.eq('a damaged entry: the evaluation that reaches it throws → logged once as "[features] re-evaluation failed …"; what was evaluated before it (the first feature) still switched off', [r.off, r.log2[0], /^\[features\] re-evaluation failed /.test(r.log2[1])], [true, 1, true]);
    h.eq('every settings change logs once more (the loader is not stuck, not flooding)', r.log3, 2);
    h.eq('repaired: evaluation works again (off and on follow the flag), nothing more is logged (still the 2 from before)', [r.on2, r.log4], [true, 2]);
  });

  await h.step('a switch back on while the off hook of the previous cycle is still running: the feature comes back right after the hook ends (the work loop looks again)', async () => {
    const p = await lpage('ld-loop', { phase: 'live' });
    await p.route('**/js/features/uxloop/off.js', async route => {
      await new Promise(r => setTimeout(r, 700));
      await route.fulfill({ contentType: 'text/javascript', body: "export async function off() { localStorage.setItem('t_loop_off', String(+(localStorage.getItem('t_loop_off') || 0) + 1)); }" });
    });
    const r = await inPage(p, async () => {
      const L = window.__L, T = window.__T, st = await import('/js/core/settings.js'), out = {};
      T.actor('admin'); L.con(); localStorage.removeItem('t_loop_off');
      await L.boot('guest', [L.entry('uxloop', async ctx => { L.rec2('uxloop').setups++; ctx.markOffHook(); })]);
      await st.setFeature('uxloop', true); await L.until(async () => (await L.state('uxloop')).on, 3000);
      await st.setFeature('uxloop', false);                                                                  // dispose → off hook starts (off.js arrives after 0.7 s)
      await L.until(async () => !(await L.state('uxloop')).on, 3000); await L.sleep(100);
      out.hookRunning = [L.rec2('uxloop').setups, localStorage.getItem('wgb_f_uxloop__offhook'), +(localStorage.getItem('t_loop_off') || 0)];
      await st.setFeature('uxloop', true);                                                                   // 훅이 도는 중에 다시 켠다
      await L.sleep(250); out.stillOff = (await L.state('uxloop')).on;
      out.back = await L.until(async () => (await L.state('uxloop')).on, 4000);
      out.end = [L.rec2('uxloop').setups, +(localStorage.getItem('t_loop_off') || 0)];
      return out;
    });
    h.eq('off: the hook is running (marker still there, off() not called yet)', r.hookRunning, [1, '1', 0]);
    h.eq('switched on again meanwhile: it waits for the hook (still off 0.25 s later) …', r.stillOff, false);
    h.eq('… and comes back on right after the hook ended: a 2nd setup, the hook ran exactly once', [r.back, r.end], [true, [2, 1]]);
  });

  // ================================================================ ⑤ 실패 · 제한 시간
  await h.step('failures: setup throws / rejects / hangs (3 s limit), module without setup or i18n, load fails / hangs, missing file (planned = quiet) — each feature is tripped, torn down, and the healthy ones are untouched', async () => {
    const p = await lpage('ld-fail', { phase: 'live', ff: 'uxthrow,uxreject,uxhang,uxnosetup,uxnoi18n,uxnull,uxloadfail,uxloadhang,uxmissing,uxplanned,uxpbad,uxpsetup,uxok,uxsync' });
    const r = await inPage(p, async () => {
      const L = window.__L, F = await import('/js/core/features.js'), out = {};
      const S = L.spy(), con = L.con(); await L.rec(['feature:error', 'feature:state']);
      const mk = (id, how) => L.entry(id, async ctx => {
        const R = L.rec2(id); R.setups++; R.ctx = ctx;
        document.body.appendChild(ctx.el('div', { text: id })); ctx.rootClass('x'); ctx.every(30, () => {}); ctx.listen(window, 'resize', () => {});
        await how(ctx);
      });
      const entries = [
        mk('uxthrow', () => { throw new Error('boom-sync'); }),
        mk('uxreject', async () => { await L.sleep(20); throw new Error('boom-async'); }),
        mk('uxhang', () => new Promise(() => {})),
        L.entry('uxnosetup', null, { noSetup: true }),
        L.entry('uxnoi18n', async () => {}, { noI18n: true }),
        L.entry('uxnull', null, { load: async () => null }),
        L.entry('uxloadfail', null, { load: async () => { throw new Error('load-boom'); } }),
        L.entry('uxloadhang', null, { load: () => new Promise(() => {}) }),
        L.entry('uxmissing', null, { load: () => import('/js/features/uxmissing/index.js') }),
        L.entry('uxplanned', null, { status: 'planned', load: () => import('/js/features/uxplanned/index.js') }),
        L.entry('uxpbad', null, { status: 'planned', load: async () => { throw new Error('planned-load-boom'); } }),             // planned 라도 "폴더가 아직 없음" 이 아닌 실패는 조용하지 않음
        Object.assign(mk('uxpsetup', () => { throw new Error('planned-setup-boom'); }), { status: 'planned' }),
        L.ctl('uxok'),
        L.entry('uxsync', () => { L.rec2('uxsync').setups++; }),                     // setup 이 async 가 아니어도 됨
      ];
      const t0 = performance.now();
      await L.boot('guest', entries, { setupTimeoutMs: 250, loadTimeoutMs: 250 });
      out.bootMs = performance.now() - t0;
      await L.sleep(150);
      const all = F.featureStates();
      out.rows = Object.fromEntries(all.map(s => [s.id, [s.on, s.source, s.tripped, s.errors, s.lastError, s.live.listeners + s.live.timers + s.live.raf + s.live.watchers + s.live.bus]]));
      out.trace = Object.fromEntries(all.map(s => [s.id, L.trace(s.id)])); out.nonZero = all.filter(s => !s.on && out.trace[s.id].nodes + out.trace[s.id].links + out.trace[s.id].classes).map(s => s.id);
      out.spy = S.active(); out.html = L.html();
      out.alive = Object.fromEntries(['uxthrow', 'uxreject', 'uxhang'].map(id => [id, window.__stub.scopes[id].alive()]));
      out.scopes = Object.keys(window.__stub.scopes).sort();                       // forFeature 는 setup 까지 간 기능에만 불림
      out.events = window.__ev['feature:error'].map(e => [e.id, e.count, e.tripped]).sort((a, b) => a[0].localeCompare(b[0]));
      out.con = { error: con.error.map(m => m.slice(0, 60)).sort(), warn: con.warn.map(m => m.slice(0, 100)) };
      out.okTicks = L.rec2('uxok').calls.every; out.syncSetups = L.rec2('uxsync').setups;
      return out;
    });
    const T = (m, n = 1) => [false, 'tripped', true, n, m, 0];
    h.eq('healthy features are on: the control feature and a feature whose setup is a plain (non-async) function', [r.rows.uxok.slice(0, 4), r.rows.uxsync.slice(0, 4), r.syncSetups], [[true, 'url', false, 0], [true, 'url', false, 0], 1]);
    h.eq('setup throws → "setup: <message>", tripped for the session', r.rows.uxthrow, T('setup: boom-sync'));
    h.eq('setup rejects → same', r.rows.uxreject, T('setup: boom-async'));
    h.eq('setup never finishes → "setup timed out after N ms" (the limit is a loader option — 250 here, 3000 by default)', r.rows.uxhang, T('setup: setup timed out after 250 ms'));
    h.eq('module without setup()', r.rows.uxnosetup, T('module: features/uxnosetup/index.js must export an async setup(ctx)'));
    h.eq('module without i18n', r.rows.uxnoi18n, T('module: features/uxnoi18n/index.js must export i18n (the dictionary from i18n.js)'));
    h.eq('module that is null', r.rows.uxnull, T('module: features/uxnull/index.js must export an async setup(ctx)'));
    h.eq('load() rejects', r.rows.uxloadfail, T('load: load-boom'));
    h.eq('load() never finishes → "load timed out"', r.rows.uxloadhang, T('load: load timed out after 250 ms'));
    h.check('a file that does not exist (a beta feature) → "load: Failed to fetch dynamically imported module…"', r.rows.uxmissing[1] === 'tripped' && /^load: Failed to fetch dynamically imported module/.test(r.rows.uxmissing[4] || '') && r.rows.uxmissing[3] === 1, JSON.stringify(r.rows.uxmissing));
    h.eq('a planned feature without a folder → quiet "no code yet" (this is what ?ff=all does in development)', r.rows.uxplanned, T('load: no code yet (planned)'));
    h.eq('…but a planned feature that fails for any other reason is as loud as any other (load() rejects · setup throws)', [r.rows.uxpbad, r.rows.uxpsetup], [T('load: planned-load-boom'), T('setup: planned-setup-boom')]);
    h.eq('every failed feature left nothing behind: no node, link or class, no timer, listener, frame; <html> has no class', [r.nonZero, r.spy, r.html], [[], { intervals: 1, timeouts: 0, raf: 0, listeners: 0 }, '']);
    h.eq('the scopes of features that failed in setup are dead', r.alive, { uxthrow: false, uxreject: false, uxhang: false });
    h.eq('one feature:error per failure with tripped: true and count 1 (the quiet planned one too)', r.events, ['uxhang', 'uxloadfail', 'uxloadhang', 'uxmissing', 'uxnoi18n', 'uxnosetup', 'uxnull', 'uxpbad', 'uxplanned', 'uxpsetup', 'uxreject', 'uxthrow'].map(id => [id, 1, true]));
    h.eq('console: 11 loud errors "[f:<id>] …" (the quiet planned feature is not among them) and exactly 1 warning, the quiet planned one', [r.con.error.length, r.con.error.every(m => /^\[f:ux\w+\] /.test(m)) && !r.con.error.some(m => m.startsWith('[f:uxplanned]')), r.con.warn],
      [11, true, ['[features] uxplanned: planned and features/uxplanned/index.js does not exist yet — skipped']]);
    h.check('the loader waited for the slow ones (≥ 250 ms) but never for the 3 s default', r.bootMs >= 240 && r.bootMs < 2500, r.bootMs.toFixed(0) + ' ms');
    h.eq('scopes exist exactly for the features that got as far as setup (+ the healthy ones)', r.scopes, ['uxhang', 'uxok', 'uxpsetup', 'uxreject', 'uxsync', 'uxthrow']);
  });

  // ================================================================ ⑤ style.css · 제한 시간
  await h.step('style.css: css:true → <link data-f> in <head>, setup runs after it loaded; a 404 only warns, a stylesheet that never answers is given up on after the css limit (2 s by default); off removes the link', async () => {
    const p = await lpage('ld-css', { phase: 'live' });
    await p.route('**/js/features/uxcssok/style.css', route => route.fulfill({ contentType: 'text/css', body: '.f-uxcssok-a { display: none }' }));
    await p.route('**/js/features/uxcsshang/style.css', () => {});                // 영원히 답하지 않음
    const r = await inPage(p, async () => {
      const L = window.__L, T = window.__T, out = {};
      T.actor('admin');
      const st = await import('/js/core/settings.js'), con = L.con(), t0 = performance.now();
      const mk = id => L.entry(id, async ctx => {
        const R = L.rec2(id); R.setups++; R.at = performance.now();
        const link = document.querySelector(`link[data-f="${id}"]`);
        R.link = link && { rel: link.rel, href: link.getAttribute('href'), inHead: link.parentNode === document.head, sheet: !!link.sheet };
      }, { css: true });
      await L.boot('guest', [mk('uxcssok'), mk('uxcss404'), mk('uxcsshang'), L.entry('uxnocss', async () => {})], { cssTimeoutMs: 1200 });
      const t1 = performance.now();
      for (const id of ['uxcssok', 'uxcss404', 'uxcsshang', 'uxnocss']) await st.setFeature(id, true);
      out.ok = await L.until(async () => (await L.state('uxcsshang')).on, 6000);
      await L.sleep(100);
      out.rows = Object.fromEntries(['uxcssok', 'uxcss404', 'uxcsshang', 'uxnocss'].map(id => [id, { on: null, link: L.rec2(id).link ?? null, at: Math.round(L.rec2(id).at - t1) }]));
      for (const id of Object.keys(out.rows)) out.rows[id].on = (await L.state(id)).on;
      out.links = Object.fromEntries(['uxcssok', 'uxcss404', 'uxcsshang', 'uxnocss'].map(id => [id, L.trace(id).links]));
      out.warn = con.warn.slice(); out.error = con.error.slice();
      for (const id of ['uxcssok', 'uxcss404', 'uxcsshang', 'uxnocss']) await st.setFeature(id, false);
      await L.until(async () => !(await L.state('uxcsshang')).on, 2000);
      out.after = Object.fromEntries(['uxcssok', 'uxcss404', 'uxcsshang', 'uxnocss'].map(id => [id, L.trace(id).links]));
      out.headLinks = document.head.querySelectorAll('link[data-f]').length;
      return out;
    });
    h.eq('a stylesheet that loads: the link is <link rel="stylesheet" href="js/features/<id>/style.css" data-f="<id>"> in <head>, already loaded when setup runs', r.rows.uxcssok.link, { rel: 'stylesheet', href: 'js/features/uxcssok/style.css', inHead: true, sheet: true });
    h.eq('a stylesheet that is a 404 does not stop the feature: it is on, setup saw the <link>, exactly one warning', [r.rows.uxcss404.on, r.rows.uxcss404.link.inHead, r.warn.filter(w => w.includes('uxcss404'))], [true, true, ['[features] uxcss404: style.css did not load']]);
    h.check('a stylesheet that never answers: setup starts after the css limit (1200 ms here), not at once and not never', r.rows.uxcsshang.on && r.rows.uxcsshang.at >= 1150 && r.rows.uxcsshang.at < 2600, JSON.stringify(r.rows.uxcsshang));
    h.check('a stylesheet that answers (loaded or 404) does not make setup wait for the limit: setup runs right after the answer', r.rows.uxcssok.at < 900 && r.rows.uxcss404.at < 900, JSON.stringify([r.rows.uxcssok.at, r.rows.uxcss404.at]));
    h.eq('a feature without css gets no link', [r.rows.uxnocss.on, r.rows.uxnocss.link, r.links.uxnocss], [true, null, 0]);
    h.eq('while on: one link per css feature', r.links, { uxcssok: 1, uxcss404: 1, uxcsshang: 1, uxnocss: 0 });
    h.eq('off removes every link, even the one that never loaded; <head> has no data-f link left', [r.after, r.headLinks], [{ uxcssok: 0, uxcss404: 0, uxcsshang: 0, uxnocss: 0 }, 0]);
    h.eq('no error was printed (only the one warning)', [r.error, r.warn.length], [[], 1]);
  });

  await h.step('switched off while still starting: a feature whose module import or stylesheet is still on its way never runs setup, one whose setup is running is torn down when it ends — and "on" is never reported; switching it on again works', async () => {
    const p = await lpage('ld-stale', { phase: 'live' });
    await p.route('**/js/features/uxstc/style.css', async route => { await new Promise(r => setTimeout(r, 700)); await route.fulfill({ contentType: 'text/css', body: '.f-uxstc-a { display: none }' }); });
    const r = await inPage(p, async () => {
      const L = window.__L, T = window.__T, st = await import('/js/core/settings.js'), out = {};
      T.actor('admin'); L.con(); await L.rec(['feature:state', 'feature:error']);
      const mkSetup = id => async ctx => {
        const R = L.rec2(id); R.setups++;
        document.body.appendChild(ctx.el('div', { text: id })); ctx.rootClass('x'); ctx.every(40, () => {}); ctx.listen(window, 'resize', () => {}); ctx.texts({ ko: { title: id }, en: { title: id } });
        if (id === 'uxsts') { R.running = true; await L.sleep(600); R.finished = true; }
      };
      const slowLoad = id => async () => { L.rec2(id).loading = true; await L.sleep(600); return { i18n: { ko: { [id + '_a']: 'a' }, en: { [id + '_a']: 'a' } }, css: false, setup: mkSetup(id) }; };
      await L.boot('guest', [L.entry('uxsl', null, { load: slowLoad('uxsl') }), L.entry('uxstc', mkSetup('uxstc'), { css: true }), L.entry('uxsts', mkSetup('uxsts'))]);
      const ids = ['uxsl', 'uxstc', 'uxsts'], evs = id => window.__ev['feature:state'].filter(e => e.id === id).map(e => e.on);
      for (const id of ids) await st.setFeature(id, true);
      out.reached = [await L.until(() => L.rec2('uxsl').loading, 3000), await L.until(() => !!document.querySelector('link[data-f="uxstc"]'), 3000), await L.until(() => L.rec2('uxsts').running, 3000)];
      out.starting = ids.map(id => L.rec2(id).setups);                                     // 아직 setup 까지 못 간 것 · 간 것
      for (const id of ids) await st.setFeature(id, false);                                // 시작하는 도중에 끈다
      await L.sleep(1100);                                                                 // 가장 느린 단계(0.6~0.7 s)가 끝날 때까지
      out.after = ids.map(id => { const s = L.rec2(id); return [s.setups, !!s.finished]; });
      out.states = await Promise.all(ids.map(async id => { const s = await L.state(id); return [s.on, s.source, s.tripped, s.errors, s.live.listeners + s.live.timers + s.live.watchers + s.live.bus]; }));
      out.events = ids.map(evs);
      out.traces = ids.map(id => L.trace(id)); out.html = L.html();
      out.refresh = window.__stub.refresh;
      out.errs = [L.con().error.length, window.__ev['feature:error'].length];
      // 다시 켜면 정상: 새 setup 으로 켜지고, 이번에는 끝까지 간다
      await st.setFeature('uxsts', true); out.again = await L.until(async () => (await L.state('uxsts')).on, 3000);
      out.again2 = [L.rec2('uxsts').setups, evs('uxsts'), L.trace('uxsts').nodes];
      return out;
    });
    h.eq('the three were really in the middle of starting when they were switched off: import running · stylesheet requested · setup running (and only the third had reached setup)', [r.reached, r.starting], [[true, true, true], [0, 0, 1]]);
    h.eq('import and stylesheet: setup never ran (0) · the setup that was running finished (1 run, finished) but the feature was torn down right after', r.after, [[0, false], [0, false], [1, true]]);
    h.eq('all three are off (the admin said so), not tripped, no errors, nothing left behind (no listener · timer · subscription)', r.states, [[false, 'admin', false, 0, 0], [false, 'admin', false, 0, 0], [false, 'admin', false, 0, 0]]);
    h.eq('"on" was never reported for any of them (a feature that did not get to run is not announced as on, nor as off)', r.events, [[], [], []]);
    h.eq('no node, link or class remains; <html> carries no class', [r.traces, r.html], [[{ nodes: 0, links: 0, classes: 0 }, { nodes: 0, links: 0, classes: 0 }, { nodes: 0, links: 0, classes: 0 }], '']);
    h.eq('the text override of the setup that did run was undone again (the page was repainted twice: once for the override, once for the undo)', r.refresh, 2);
    h.eq('nothing was printed as an error and no feature:error was sent', r.errs, [0, 0]);
    h.eq('switching it on again: a fresh setup (the 2nd) runs to the end and is announced once', [r.again, r.again2], [true, [2, [true], 1]]);
  });

  await h.step('limits: setup has 3 s (not 2.9 s, not 3.1 s) and boot waits for it only up to readyTimeoutMs (3 s by default); readyTimeoutMs can be shorter and the feature still comes on afterwards', async () => {
    const [pa, pb] = await Promise.all([lpage('ld-limits-a', { phase: 'live', ff: 'uxok25,uxhang' }), lpage('ld-limits-b', { phase: 'live', ff: 'uxslow' })]);
    const [a, b] = await Promise.all([
      inPage(pa, async () => {
        const L = window.__L, out = {}; L.con(); await L.rec(['feature:error']);
        const entries = [L.entry('uxok25', async ctx => { await L.sleep(2500); L.rec2('uxok25').at = performance.now(); }), L.entry('uxhang', async ctx => { await new Promise(() => {}); })];
        const t0 = performance.now();
        const watch = (async () => { for (;;) { const s = await L.state('uxhang'); if (s && s.tripped) return performance.now() - t0; await L.sleep(20); } })();
        await L.boot('guest', entries);                                     // 기본값: setup 3000 ms · ready 3000 ms
        out.bootMs = performance.now() - t0;
        out.tripMs = await Promise.race([watch, L.sleep(5000).then(() => -1)]);
        const s25 = await L.state('uxok25'), sh = await L.state('uxhang');
        out.rows = [[s25.on, s25.source, s25.errors], [sh.on, sh.source, sh.errors, sh.lastError]];
        out.at25 = L.rec2('uxok25').at - t0;
        return out;
      }),
      inPage(pb, async () => {
        const L = window.__L, out = {}; L.con();
        const t0 = performance.now();
        await L.boot('guest', [L.entry('uxslow', async ctx => { await L.sleep(1500); })], { readyTimeoutMs: 400 });
        out.bootMs = performance.now() - t0;
        out.onAtBoot = (await L.state('uxslow')).on;
        out.comesOn = await L.until(async () => (await L.state('uxslow')).on, 3000);
        out.onMs = performance.now() - t0;
        return out;
      }),
    ]);
    h.check('a setup that takes 2.5 s is fine (on, no error) and the boot promise waited for it', a.rows[0][0] === true && a.rows[0][2] === 0 && a.at25 >= 2400 && a.at25 < 3300 && a.bootMs >= 2400, JSON.stringify([a.rows[0], Math.round(a.at25), Math.round(a.bootMs)]));
    h.check('a setup that never ends is cut off at 3 s: tripped between 2.9 s and 4.5 s, message "setup timed out after 3000 ms"', a.tripMs >= 2900 && a.tripMs < 4500 && a.rows[1][3] === 'setup: setup timed out after 3000 ms', JSON.stringify([Math.round(a.tripMs), a.rows[1]]));
    h.check('boot never waits longer than readyTimeoutMs (3 s) for anybody', a.bootMs < 3800, Math.round(a.bootMs) + ' ms');
    h.check('readyTimeoutMs: 400 → boot resolves at ≈ 0.4 s while the 1.5 s setup is still running…', b.bootMs >= 350 && b.bootMs < 1200 && b.onAtBoot === false, JSON.stringify([Math.round(b.bootMs), b.onAtBoot]));
    h.check('…and the feature comes on when its setup ends (≈ 1.5 s)', b.comesOn && b.onMs >= 1400 && b.onMs < 3000, Math.round(b.onMs) + ' ms');
  });

  // ================================================================ ⑤ 제한 시간의 계약 값 (가짜 시계)
  await h.step('limits at their contract values (fake clock): a stylesheet that never answers is given up after 2 s, an off hook (its import and its off()) after 3 s, a module import that never ends after 10 s — each exactly there, not before', async () => {
    const p = await fakePage('ld-limits-default', { ff: 'uxld,uxcd' }, '2027-04-10T09:00:00-04:00', { pause: true });
    const asked = new Set();
    await p.route('**/js/features/uxcd/style.css', () => { asked.add('css'); });                       // 영원히 답하지 않음
    await p.route('**/js/features/uxoh/off.js', () => { asked.add('oh'); });                           // 영원히 답하지 않음
    await p.route('**/js/features/uxoh2/off.js', route => route.fulfill({ contentType: 'text/javascript', body: "export function off() { localStorage.setItem('t_oh2_called', '1'); return new Promise(() => {}); }" }));
    await inPage(p, async () => {
      const L = window.__L, m = await import('/js/core/docdb.js'); await L.ready;
      m.registerBackend('demo', () => ({ kind: 'demo', admin: () => false, read: async () => null, list: async () => [], write: async () => {}, watchList: () => () => {},
        watchDoc: (path, fn) => { Promise.resolve().then(() => fn(null)); return () => {}; } }));       // 설정 문서가 (없는 채로) 곧바로 도착 — 타이머가 필요 없음
      localStorage.setItem('wgb_f_uxoh__offhook', '1'); localStorage.setItem('wgb_f_uxoh2__offhook', '1'); localStorage.removeItem('t_oh2_called');
      L.con(); window.__ld = { loadCalls: 0 };
      L.bootNow('guest', [
        L.entry('uxld', async () => {}, { load: () => { window.__ld.loadCalls++; return new Promise(() => {}); } }),
        L.entry('uxcd', async () => { L.rec2('uxcd').setups++; }, { css: true }),
        L.entry('uxoh', async () => {}), L.entry('uxoh2', async () => {}),
      ]);
    });
    const probe = () => inPage(p, async () => {
      const L = window.__L, ld = await L.state('uxld'), cd = await L.state('uxcd');
      return { loadCalls: window.__ld.loadCalls, link: !!document.querySelector('link[data-f="uxcd"]'), oh2: localStorage.getItem('t_oh2_called') === '1',
        ld: [ld.on, ld.tripped, ld.lastError], cd: [cd.on, L.rec2('uxcd').setups], marks: ['uxoh', 'uxoh2'].map(id => localStorage.getItem(`wgb_f_${id}__offhook`)),
        warn: window.__con.warn.filter(w => /off hook/.test(w)).sort() };
    });
    let ready = false;                                                                                  // 모두 "기다리는 중" 이 될 때까지 실제 시간으로 기다림 (그 뒤에는 시계가 멈춰 있음)
    for (let i = 0; i < 300 && !ready; i++) { const s = await probe(); ready = s.loadCalls === 1 && s.link && s.oh2 && asked.has('css') && asked.has('oh'); if (!ready) await h.wait(25); }
    const at = {};
    at.t0 = await probe();
    await p.clock.runFor(1900); at.t19 = await probe();
    await p.clock.runFor(200); at.t21 = await probe();
    await p.clock.runFor(800); at.t29 = await probe();
    await p.clock.runFor(200); at.t31 = await probe();
    await p.clock.runFor(6700); at.t98 = await probe();
    await p.clock.runFor(300); at.t101 = await probe();
    h.check('everything is waiting at t = 0 (module import pending, stylesheet requested, both off hooks running — the clock is frozen)', ready && at.t0.cd[0] === false && at.t0.ld[1] === false && at.t0.marks.join() === '1,1', JSON.stringify(at.t0));
    h.eq('1.9 s: the stylesheet is still awaited (setup has not run) · off hooks still running · import still pending', [at.t19.cd, at.t19.marks, at.t19.ld], [[false, 0], ['1', '1'], [false, false, null]]);
    h.eq('2.1 s: the 2 s css limit has passed → the feature is on, setup ran once (a stylesheet that does not answer never blocks a feature for long)', [at.t21.cd, at.t21.marks, at.t21.ld], [[true, 1], ['1', '1'], [false, false, null]]);
    h.eq('2.9 s: the off hooks are still given their time (markers kept)', [at.t29.marks, at.t29.warn], [['1', '1'], []]);
    h.eq('3.1 s: the 3 s off-hook limit has passed → both markers are gone, one warning each (the import of off.js that never answered, the off() that never ends)', [at.t31.marks, at.t31.warn],
      [[null, null], ['[features] uxoh2: off hook failed — off hook timed out after 3000 ms', '[features] uxoh: off hook failed — off hook (load) timed out after 3000 ms']]);
    h.eq('9.8 s: the module import is still waited for (10 s limit) — not tripped', at.t98.ld, [false, false, null]);
    h.eq('10.1 s: the 10 s limit has passed → tripped, "load timed out after 10000 ms"', at.t101.ld, [false, true, 'load: load timed out after 10000 ms']);
  });

  // ================================================================ ⑤½ 실서버 모드 (DEMO = false)
  // 다른 시험은 전부 ?demo=1 입니다. 실서버에서만 달라지는 동작 — 안전 모드와 관리자 "끄기"가 ?ff= 링크보다 우선 · `_` 로 시작하는 기능은 로드 안 됨 · ?fcrash 무시 ·
  // ctx.demo = false · ctx.log 는 ?debug=1 일 때만 — 을 로더가 정말 DEMO 값으로 판단하는지 확인합니다.
  // Firebase 에는 접속하지 않습니다: 바깥 주소는 전부 차단, store.js 의 getStore() 만 가짜로 바꾸고 'firebase' 백엔드 자리에 가짜 문서 저장소를 끼웁니다 (로더 코드는 그대로).
  await h.step('production mode (DEMO = false): safe mode and an admin "off" beat ?ff= links, "_" features never load, ?fcrash is ignored, ctx.demo is false, ctx.log is silent without ?debug=1 — all switching live', async () => {
    const mk = async (tag, params) => {
      const p = await h.page('desktop', { tag });
      await p.route(UNIT_PAGE, r => r.fulfill({ contentType: 'text/html', body: BLANK }));
      await p.route(/^https?:\/\/(?!(127\.0\.0\.1|localhost)[:/])/, r => r.abort());                      // 바깥으로는 아무것도 나가지 않음
      await p.route('**/js/store.js', async route => {
        const src = fs.readFileSync(path.join(h.publicDir, 'js/store.js'), 'utf8'), anchor = 'export function getStore() {';
        await route.fulfill({ contentType: 'text/javascript', body: src.split(anchor).length === 2 ? src.replace(anchor, anchor + " return Promise.resolve({ backend: { kind: 'firebase' } });") : 'throw new Error("store.js: the getStore() anchor was not found exactly once");' });
      });
      await p.goto(h.url('__units.html', { phase: 'live', demo: '0', ...params }));
      await p.evaluate(LH); await p.evaluate(PROD_STUB);
      return p;
    };
    const IDS = ['uxbeta', 'uxbeta2', 'uxoff', 'uxplan', '_uxself', 'uxsafe', 'uxlive', 'uxcrash', 'uxready'];
    const p = await mk('ld-prod', { ff: 'uxbeta,uxoff,uxplan,_uxself,uxsafe,uxlive,uxcrash', fcrash: 'uxcrash' });
    const r = await inPage(p, async ids => {
      const L = window.__L, F = await import('/js/core/features.js'), cfg = await import('/js/config.js'), out = { logs: [] };
      const ol = console.log; console.log = (...a) => { out.logs.push(a.map(String).join(' ')); ol(...a); };
      L.con(); await L.rec(['feature:error']);
      const doc = (features, safe) => window.__doc('app/settings', { id: 'settings', features, safe, phase: 'auto', cfg: {}, updatedAt: 1 });
      doc({ uxoff: false }, false);
      const E = (id, o) => L.entry(id, async ctx => { const R = L.rec2(id); R.setups++; R.ctx = ctx; R.guarded = ctx.guard(() => 'ok'); ctx.log('hello', id); }, o);
      await L.boot('guest', [E('uxbeta'), E('uxbeta2'), E('uxoff'), E('uxplan', { status: 'planned' }), E('_uxself'), E('uxsafe'), E('uxlive', { liveSafe: true }), E('uxcrash'), E('uxready', { status: 'ready', default: true })]);
      const rows = async () => Object.fromEntries(await Promise.all(ids.map(async id => { const s = await L.state(id); return [id, `${s.on ? 'on' : 'off'}:${s.source}`]; })));
      const until = async (id, want) => L.until(async () => { const s = await L.state(id); return `${s.on ? 'on' : 'off'}:${s.source}` === want; }, 3000);
      out.demoFlag = cfg.DEMO;
      out.boot = await rows();
      out.ctxDemo = [L.rec2('uxbeta').ctx.demo, L.rec2('uxbeta').ctx.page];
      out.setups = Object.fromEntries(ids.map(id => [id, L.rec2(id).setups]));
      out.crash = []; for (let i = 0; i < 7; i++) out.crash.push(L.rec2('uxcrash').guarded());
      const sc = await L.state('uxcrash'); out.crashState = [sc.errors, sc.tripped, sc.on];
      // ① 본식 안전 모드를 켠다: liveSafe 가 아닌 것은 ?ff= 로 켜 있어도 꺼진다 (실서버에서는 URL 이 안전 모드를 못 이긴다)
      doc({ uxoff: false }, true);
      out.safeOk = await until('uxsafe', 'off:safe'); await L.until(async () => (await L.state('uxready')).source === 'safe'); await L.sleep(150);
      out.safe = await rows();
      // ② 안전 모드를 끄고 관리자가 uxsafe 를 끈다: ?ff=uxsafe 가 있어도 꺼짐 (링크로 되살릴 수 없다)
      doc({ uxoff: false, uxsafe: false }, false);
      out.adminOk = await until('uxsafe', 'off:admin'); await until('uxbeta', 'on:url'); await L.sleep(150);
      out.admin = await rows();
      // ③ 관리자가 uxoff 를 켜고 uxsafe 의 끄기를 풀면: URL 이 켠다
      doc({ uxoff: true }, false);
      out.backOk = await until('uxoff', 'on:url'); await until('uxsafe', 'on:url'); await L.sleep(150);
      out.back = await rows();
      out.setups2 = Object.fromEntries(ids.map(id => [id, L.rec2(id).setups]));
      out.errors = L.con().error.length; out.events = window.__ev['feature:error'].length;
      return out;
    }, IDS);
    h.eq('this really is production mode: config.DEMO is false', r.demoFlag, false);
    h.eq('at boot: ?ff= turns a beta feature on (url) · no ?ff= → beta · an admin "off" beats ?ff= · planned never loads · a "_" id never loads (even beta + ?ff=) · ready/default on', r.boot,
      { uxbeta: 'on:url', uxbeta2: 'off:beta', uxoff: 'off:admin', uxplan: 'off:planned', _uxself: 'off:planned', uxsafe: 'on:url', uxlive: 'on:url', uxcrash: 'on:url', uxready: 'on:default' });
    h.eq('the features that are on were set up once; the others never loaded', r.setups, { uxbeta: 1, uxbeta2: 0, uxoff: 0, uxplan: 0, _uxself: 0, uxsafe: 1, uxlive: 1, uxcrash: 1, uxready: 1 });
    h.eq('ctx.demo is false in production (ctx.page is the page)', r.ctxDemo, [false, 'guest']);
    h.eq('?fcrash=uxcrash is ignored outside the demo: seven guarded calls all work, no error, not tripped', [r.crash, r.crashState], [Array(7).fill('ok'), [0, false, true]]);
    h.eq('safe mode switches off every feature that is not liveSafe — ?ff= or not, admin flag or not, ready/default or not (planned stays planned) — and only the liveSafe one stays (production: the url loses to safe mode)', [r.safeOk, r.safe],
      [true, { uxbeta: 'off:safe', uxbeta2: 'off:safe', uxoff: 'off:safe', uxplan: 'off:planned', _uxself: 'off:planned', uxsafe: 'off:safe', uxlive: 'on:url', uxcrash: 'off:safe', uxready: 'off:safe' }]);
    h.eq('safe mode off + an admin "off" for uxsafe → it stays off although ?ff=uxsafe is in the address (nobody revives it with a link); the others come back', [r.adminOk, r.admin],
      [true, { uxbeta: 'on:url', uxbeta2: 'off:beta', uxoff: 'off:admin', uxplan: 'off:planned', _uxself: 'off:planned', uxsafe: 'off:admin', uxlive: 'on:url', uxcrash: 'on:url', uxready: 'on:default' }]);
    h.eq('the admin turns uxoff on and withdraws the "off" for uxsafe → ?ff= works again; each came back with a fresh setup', [r.backOk, r.back, r.setups2],
      [true, { uxbeta: 'on:url', uxbeta2: 'off:beta', uxoff: 'on:url', uxplan: 'off:planned', _uxself: 'off:planned', uxsafe: 'on:url', uxlive: 'on:url', uxcrash: 'on:url', uxready: 'on:default' },
        { uxbeta: 2, uxbeta2: 0, uxoff: 1, uxplan: 0, _uxself: 0, uxsafe: 2, uxlive: 1, uxcrash: 2, uxready: 2 }]);
    h.eq('ctx.log prints nothing in production without ?debug=1 · no errors, no feature:error events', [r.logs, r.errors, r.events], [[], 0, 0]);

    // ?debug=1 → ctx.log prints in production too (with the feature's prefix)
    const pd = await mk('ld-prod-debug', { ff: 'uxlog', debug: '1' });
    const d = await inPage(pd, async () => {
      const L = window.__L, logs = [], ol = console.log; console.log = (...a) => { logs.push(a.map(String).join(' ')); ol(...a); };
      await L.boot('guest', [L.entry('uxlog', async ctx => { ctx.log('hello', 1, { a: 2 }); })]);
      return logs;
    });
    h.eq('?debug=1: ctx.log prints "[f:<id>] …" in production too', d, ['[f:uxlog] hello 1 [object Object]']);
  });

  // ================================================================ ⑥ gate (whenGateReady)
  await h.step('gate: whenGateReady waits for the real first settings and for the gate feature’s setup (success or failure) — not for anybody else, not for a feature that is off', async () => {
    const run = async (tag, params, entriesSrc, opts = {}) => {
      const p = await lpage('ld-gate-' + tag, { phase: 'live', ...params });
      return inPage(p, async ([src, opts]) => {
        const L = window.__L, out = {}; await L.ready; L.con();
        const gate = (setup, o = {}) => L.entry('uxg', setup, { gate: true, ...o });
        const entries = (0, eval)('(' + src + ')')(L, gate);
        const t0 = performance.now();
        const bp = L.bootNow('guest', entries, opts);                         // await しない — ゲートは「ページが先へ進む前に」待つもの
        await L.F.whenGateReady();
        out.gateMs = performance.now() - t0;
        const g = await L.state('uxg'), s = await L.state('uxslow');
        out.atGate = { g: g && [g.on, g.tripped, g.lastError], slow: s && s.on, doneAt: L.rec2('uxg').doneAt ? L.rec2('uxg').doneAt - t0 : null };
        await bp;
        out.end = { g: (await L.state('uxg'))?.on ?? null, slow: s ? await L.until(async () => (await L.state('uxslow')).on, 3000) : null };
        return out;
      }, [entriesSrc.toString(), opts]);
    };
    const [on, off, other, fail, hang, selftest, plainSelftest] = await Promise.all([
      run('on', { ff: 'uxg' }, (L, gate) => [gate(async () => { await L.sleep(1000); L.rec2('uxg').doneAt = performance.now(); })]),
      run('off', { ff: '-uxg' }, (L, gate) => [gate(async () => { await L.sleep(1000); })]),
      run('other', { ff: 'uxg,uxslow' }, (L, gate) => [gate(async () => { await L.sleep(100); L.rec2('uxg').doneAt = performance.now(); }), L.entry('uxslow', async () => { await L.sleep(1500); })]),
      run('fail', { ff: 'uxg' }, (L, gate) => [gate(async () => { await L.sleep(100); throw new Error('gate boom'); })]),
      run('hang', { ff: 'uxg' }, (L, gate) => [gate(() => new Promise(() => {}))], { setupTimeoutMs: 500 }),
      run('st', { ff: '_selftest', st: 'gate' }, L => [L.entry('_selftest', async () => { await L.sleep(1000); L.rec2('uxg').doneAt = performance.now(); }, { status: 'planned' })]),
      run('st-plain', { ff: '_selftest' }, L => [L.entry('_selftest', async () => { await L.sleep(1000); }, { status: 'planned' })]),
    ]);
    h.check('a gate feature that is on, setup 1 s: the gate opens after ≈ 1 s — and after setup finished (the feature is on when it opens)', on.gateMs >= 950 && on.gateMs < 2500 && on.atGate.g[0] === true && on.atGate.doneAt !== null && on.atGate.doneAt <= on.gateMs, JSON.stringify([Math.round(on.gateMs), on.atGate]));
    h.check('a gate feature that is OFF (?ff=-uxg): the gate opens as soon as the settings have arrived (< 0.6 s), nothing to wait for', off.gateMs < 600 && off.atGate.g[0] === false, JSON.stringify([Math.round(off.gateMs), off.atGate]));
    h.check('a slow feature that is not a gate is not waited for: the gate opens after the gate feature (≈ 0.1 s), while the 1.5 s feature has not finished — it comes on later', other.gateMs < 900 && other.atGate.slow === false && other.end.slow === true, JSON.stringify([Math.round(other.gateMs), other.atGate, other.end]));
    h.check('a gate feature whose setup fails: the gate opens right after the failure (≈ 0.1 s) — failure is not a reason to hold up the village', fail.gateMs >= 90 && fail.gateMs < 900 && fail.atGate.g[1] === true && /gate boom/.test(fail.atGate.g[2]), JSON.stringify([Math.round(fail.gateMs), fail.atGate]));
    h.check('a gate feature whose setup hangs: the gate opens when the setup limit cuts it off (500 ms here)', hang.gateMs >= 450 && hang.gateMs < 1500 && hang.atGate.g[1] === true, JSON.stringify([Math.round(hang.gateMs), hang.atGate]));
    h.check('?st=gate (demo only) makes _selftest a gate: the gate waits for its setup (1 s)…', selftest.gateMs >= 950 && selftest.gateMs < 2500, Math.round(selftest.gateMs) + ' ms');
    h.check('…and without ?st=gate it does not (< 0.6 s)', plainSelftest.gateMs < 600, Math.round(plainSelftest.gateMs) + ' ms');
  });

  await h.step('gate: the 8 s ceiling and "the real first value" — settings that never arrive keep the gate shut until timeoutMs (8000 by default) even after the 2 s defaults were used; late real settings that switch a gate feature on are waited for too (fake clock)', async () => {
    const mkPage = (tag, params, time) => fakePage(tag, params, time);
    // ① 설정이 영영 안 옴: gate 기능은 ?ff 로 켜져 있어 2초 기본값 판정에서 이미 setup 이 끝나지만, 문은 8초에야 열린다
    const p1 = await mkPage('ld-gate-never', { ff: 'uxg' }, '2027-04-10T09:00:00-04:00');
    await inPage(p1, async () => {
      const L = window.__L, m = await import('/js/core/docdb.js'); await L.ready;
      m.registerBackend('demo', () => new Promise(() => {}));                    // 백엔드가 영영 안 만들어짐 = 설정 문서가 안 옴
      window.__gate = { settled: false, setups: 0 };
      L.bootNow('guest', [L.entry('uxg', async () => { window.__gate.setups++; }, { gate: true })]);
      L.F.whenGateReady().then(() => { window.__gate.settled = true; });
    });
    const probe = () => inPage(p1, async () => ({ ...window.__gate, on: (await window.__L.state('uxg'))?.on }));
    await p1.clock.runFor(1000); const t1 = await probe();
    await p1.clock.runFor(2500); const t3 = await probe();                       // 3.5 s: 기본값(2 s)으로 판정이 끝났고 기능은 켜졌지만…
    await p1.clock.runFor(4300); const t78 = await probe();                      // 7.8 s: …문은 아직 닫혀 있음
    await p1.clock.runFor(300); const t81 = await probe();                       // 8.1 s: 8 s 상한이 지남
    h.eq('1 s: nothing has happened yet', [t1.settled, t1.setups], [false, 0]);
    h.eq('3.5 s: the defaults were used (2 s) and the gate feature is on — but the gate stays shut: the settings document never really arrived', [t3.on, t3.setups, t3.settled], [true, 1, false]);
    h.eq('7.8 s: still shut', t78.settled, false);
    h.eq('8.1 s: opened by the 8 s ceiling (the default timeoutMs)', t81.settled, true);

    // ② 진짜 첫 값이 2.4 초에 도착하고 그 값이 gate 기능을 켠다 → 문은 그 기능의 setup(1 s)이 끝나는 3.4 초 뒤에 열린다
    const p2 = await mkPage('ld-gate-late', {}, '2027-04-10T09:00:00-04:00');
    await inPage(p2, async () => {
      const L = window.__L, m = await import('/js/core/docdb.js'); await L.ready;
      m.registerBackend('demo', () => ({
        kind: 'demo', admin: () => false, read: async () => null, list: async () => [], write: async () => {}, watchList: () => () => {},
        watchDoc: (path, fn) => { const h = setTimeout(() => fn(path === 'app/settings' ? { id: 'settings', features: { uxg: true, uxlate: true }, safe: false, phase: 'auto', cfg: {}, updatedAt: 1 } : null), path === 'app/settings' ? 2400 : 0); return () => clearTimeout(h); },
      }));
      window.__gate = { settled: false, setups: 0, doneAt: null };
      L.bootNow('guest', [L.entry('uxg', async () => { window.__gate.setups++; await L.sleep(1000); window.__gate.doneAt = Date.now(); }, { gate: true }), L.entry('uxlate', async () => {})]);
      L.F.whenGateReady().then(() => { window.__gate.settled = Date.now(); });
    });
    const probe2 = () => inPage(p2, async () => ({ ...window.__gate, on: (await window.__L.state('uxg'))?.on, late: (await window.__L.state('uxlate'))?.on }));
    await p2.clock.runFor(2300); const l1 = await probe2();                         // 2.3 s: 기본값(2 s) 판정 — uxg 는 beta·플래그 없음 → 꺼짐, 문은 닫힘 (진짜 값이 아직 안 왔으므로)
    await p2.clock.runFor(200); const l2 = await probe2();                          // 2.5 s: 진짜 값(2.4 s)이 와서 켜지는 중 — setup 은 2.4 s 에 시작해 3.4 s 에 끝남
    await p2.clock.runFor(800); const l3 = await probe2();                          // 3.3 s: setup 이 아직 안 끝남
    await p2.clock.runFor(200); const l4 = await probe2();                          // 3.5 s: 끝남 → 문 열림
    h.eq('2.3 s: the 2 s defaults were used and the gate feature is off — the gate is shut anyway (a default is not the real value)', [l1.on, l1.setups, l1.settled], [false, 0, false]);
    h.eq('2.5 s: the real value arrived (uxg: true) → the gate feature starts its setup; the gate still waits for it', [l2.on, l2.setups, l2.settled], [false, 1, false]);
    h.eq('3.3 s: setup not finished → still shut', [l3.on, l3.settled], [false, false]);
    h.eq('3.5 s: setup finished → the feature is on and the gate opens (after the setup finished)', [l4.on, l4.settled !== false, l4.settled >= l4.doneAt], [true, true, true]);
    h.eq('a feature that is not a gate feature is never waited for: off on the 2 s defaults (2.3 s), on as soon as the real settings arrive (2.5 s — one second before the gate opens), still on at 3.5 s', [l1.late, l2.late, l2.settled, l4.late], [false, true, false, true]);
  });

  // ================================================================ ⑥ claim
  await h.step('scope.claim (02 §7.8): one feature per slot — the second gets owner-conflict and a feature:error for ITSELF; free again when the owner is off, tripped or lets go; a stale release cannot steal the slot', async () => {
    const p = await lpage('ld-claim', { phase: 'live' });
    const r = await inPage(p, async () => {
      const L = window.__L, T = window.__T, out = {};
      T.actor('admin'); L.con(); await L.rec(['feature:error', 'feature:state']);
      const st = await import('/js/core/settings.js'), F = await import('/js/core/features.js');
      await L.boot('guest', [L.claimer('uxa', 'presence', { keep: true }), L.claimer('uxb2', 'presence', { keep: true }), L.claimer('uxb1', 'presence'), L.claimer('uxc', 'tickerExtra', { keep: true }), L.claimer('uxd', 'tickerExtra', { keep: true })]);
      const on = async id => { await st.setFeature(id, true); return L.until(async () => { const s = await L.state(id); return s.on || s.tripped; }); };
      const R = id => L.rec2(id);
      await on('uxa'); out.a = [R('uxa').got, R('uxa').err];
      await on('uxb2'); out.b2 = [R('uxb2').got, R('uxb2').err?.code, /slot "presence" is already used by feature "uxa"/.test(R('uxb2').err?.message || ''), (await L.state('uxb2')).on, (await L.state('uxb2')).errors];
      await on('uxb1'); const b1 = await L.state('uxb1'); out.b1 = [b1.on, b1.tripped, b1.errors, b1.lastError];
      await on('uxc'); out.c = [R('uxc').got, F.SLOTS.includes('tickerExtra')];
      out.errEvents = window.__ev['feature:error'].map(e => [e.id, e.count, e.tripped]);
      out.aClean = (await L.state('uxa')).errors;
      out.badName = [R('uxa').try('nope').code, R('uxa').try('').code, R('uxa').try(undefined).code, R('uxa').try('Presence').code];
      const same = R('uxa').try('presence'); out.sameOwnerAgain = [same.ok, typeof same.off];                  // 자기 자리를 또 차지해도 충돌 아님
      const oldRelease = R('uxa').release;
      // 주인이 꺼지면 자리가 풀린다
      await st.setFeature('uxa', false); await L.until(async () => !(await L.state('uxa')).on);
      out.afterOff = [R('uxb2').try('presence').ok];                                                             // b2 가 차지함 (이제 b2 가 주인)
      out.deadScopeClaim = (() => { const x = R('uxa').scopes[0].claim('presence'); return typeof x; })();         // 죽은 scope 의 claim: 아무 일도 안 함 (던지지 않음)
      oldRelease();                                                                                              // 옛 release 가 b2 의 자리를 풀면 안 됨
      out.staleRelease = R('uxc').try('presence').code;                                                          // c 가 시도 → 아직 b2 가 주인이라 충돌
      // 놓아주면 다른 기능이 차지
      const holder = R('uxb2').try('presence'); holder.off && holder.off();                                      // (이미 차지한 자리를 다시 차지 → 같은 주인이라 성공 → 해제)
      out.afterRelease = R('uxc').try('presence').ok;
      // trip 도 자리를 푼다: c 가 tickerExtra 주인, d 는 충돌 → c trip → d 성공
      await on('uxd'); out.dConflict = [R('uxd').got, R('uxd').err?.code];
      F.trip('uxc', 'test'); await L.until(async () => !(await L.state('uxc')).on);
      out.dAfterTrip = R('uxd').try('tickerExtra').ok;
      return out;
    });
    h.eq('the first feature gets the slot', r.a, [true, null]);
    h.eq('the second gets code owner-conflict naming slot and owner; because it caught the error it stays on, with 1 error counted', r.b2, [false, 'owner-conflict', true, true, 1]);
    h.eq('a third that does not catch it fails in setup: tripped, 1 error (the same error object is not counted twice)', r.b1, [false, true, 1, 'setup: slot "presence" is already used by feature "uxa"']);
    h.eq('another slot is free at the same time', r.c, [true, true]);
    h.eq('feature:error goes to the claimant: uxb2 once (count 1, not tripped), uxb1 twice (the claim itself, then the setup failure with tripped: true) — never to the owner', r.errEvents,
      [['uxb2', 1, false], ['uxb1', 1, false], ['uxb1', 1, true]]);
    h.eq('the owner has no errors', r.aClean, 0);
    h.eq('unknown slot names are bad-name (missing, empty, wrong case)', r.badName, ['bad-name', 'bad-name', 'bad-name', 'bad-name']);
    h.eq('claiming your own slot again is fine and returns a release function', r.sameOwnerAgain, [true, 'function']);
    h.eq('when the owner is switched off the slot is free at once: the next feature gets it', r.afterOff, [true]);
    h.eq('a dead scope’s claim() does nothing (no throw, no slot taken)', r.deadScopeClaim, 'function');
    h.eq('a stale release from the first owner cannot free the slot the second one holds (still a conflict)', r.staleRelease, 'owner-conflict');
    h.eq('releasing the slot (the returned function) lets the next one in', r.afterRelease, true);
    h.eq('a second claimant of tickerExtra conflicts…', r.dConflict, [false, 'owner-conflict']);
    h.eq('…until the owner is tripped (the breaker frees what the feature held)', r.dAfterTrip, true);
  });

  // ================================================================ ⑥ ctx.texts · ctx.t · ctx.rootClass · scope.add
  await h.step('ctx.texts: overrides core text while the feature is on (last one wins, a second call replaces the whole dictionary), repaints the page once per change and never emits "lang"; off restores and repaints; ctx.t finds the feature’s own strings and {vars}', async () => {
    h.allowErrors(/\[features\] refreshTexts failed/);
    const p = await lpage('ld-texts', { phase: 'live' });
    const r = await inPage(p, async () => {
      const L = window.__L, T = window.__T, out = {};
      T.actor('admin'); L.con();
      const st = await import('/js/core/settings.js'), I = await import('/js/i18n.js');
      await L.rec(['lang', 'feature:error']);
      const lang = I.getLang(), orig = I.t('title');
      const tx = (id, f) => L.entry(id, async ctx => { const R = L.rec2(id); R.ctx = ctx; R.setups++; if (f) f(ctx, R); });
      await L.boot('guest', [
        tx('uxt1', (ctx, R) => ctx.texts({ ko: { title: 'T1-ko', extra_a: 'A-ko' }, en: { title: 'T1-en', extra_a: 'A-en' } })),
        tx('uxt2', ctx => ctx.texts({ ko: { title: 'T2-ko' }, en: { title: 'T2-en' } })),
        tx('uxt3', (ctx, R) => { R.t = [ctx.t('uxt3_hello', { n: 3 }), ctx.t('uxt3_hello'), ctx.t('uxt3_missing'), ctx.t('title'), ctx.t('uxt3_hello', { x: 1 })]; }),
      ]);
      const on = async id => { await st.setFeature(id, true); await L.until(async () => (await L.state(id)).on); };
      const off = async id => { await st.setFeature(id, false); await L.until(async () => !(await L.state(id)).on); };
      const snap = () => ({ title: I.t('title'), extra: I.t('extra_a'), refresh: window.__stub.refresh });
      out.lang = lang; out.orig = orig; out.s0 = snap();
      await on('uxt1'); out.s1 = snap();
      await on('uxt2'); out.s2 = snap();
      L.rec2('uxt1').ctx.texts({ ko: { title: 'T1b-ko' }, en: { title: 'T1b-en' } }); out.s3 = snap();     // 같은 기능이 다시 부름: 통째로 교체 + 가장 최근
      await off('uxt1'); out.s4 = snap();
      L.rec2('uxt1').ctx.texts({ ko: { title: 'late' } }); out.deadTexts = snap();                           // 꺼진 기능의 texts: 아무 일 없음
      await off('uxt2'); out.s5 = snap();
      await on('uxt3'); out.t3 = L.rec2('uxt3').t; out.s6 = snap();
      out.hello = I.t('uxt3_hello', { n: 9 });
      await off('uxt3'); out.s7 = snap(); out.hello2 = I.t('uxt3_hello');
      out.langEvents = window.__ev.lang.length; out.errors = window.__ev['feature:error'].length;
      // 언어를 바꿔도 덮어쓰기는 언어별로
      await on('uxt2'); I.setLang('en'); out.en = [I.t('title'), L.rec2('uxt2').ctx.lang()]; I.setLang('ko'); out.ko = [I.t('title'), L.rec2('uxt2').ctx.lang()]; I.setLang(lang);
      return out;
    });
    const L2 = r.lang, ov = (name, v = L2) => `${name}-${v}`;
    h.check('before anything: the core text and no repaint (the page language is ko or en)', ['ko', 'en'].includes(L2) && r.s0.title === r.orig && r.s0.refresh === 0 && r.orig !== 'T1-' + L2, JSON.stringify(r.s0));
    h.eq('uxt1 on: its override wins; the page was told to repaint once', [r.s1.title, r.s1.extra, r.s1.refresh], [ov('T1'), ov('A'), 1]);
    h.eq('uxt2 on (registered later): it wins over uxt1; repaint 2', [r.s2.title, r.s2.extra, r.s2.refresh], [ov('T2'), ov('A'), 2]);
    h.eq('uxt1 calls ctx.texts again: its whole dictionary is replaced (extra_a gone) and it counts as the latest again → wins over uxt2; repaint 3', [r.s3.title, r.s3.extra, r.s3.refresh], [ov('T1b'), 'extra_a', 3]);
    h.eq('uxt1 off: falls back to uxt2’s override (not to the core text); repaint 4', [r.s4.title, r.s4.extra, r.s4.refresh], [ov('T2'), 'extra_a', 4]);
    h.eq('ctx.texts of a feature that is off does nothing (no override, no repaint)', [r.deadTexts.title, r.deadTexts.refresh], [ov('T2'), 4]);
    h.eq('uxt2 off: the original core text is back; repaint 5', [r.s5.title === r.orig, r.s5.refresh], [true, 5]);
    h.eq('ctx.t: own key with {n}, own key without vars (placeholder stays), a missing key (the key itself), a core key, vars that do not match', r.t3, [r.lang === 'ko' ? '안녕 3' : 'Hello 3', r.lang === 'ko' ? '안녕 {n}' : 'Hello {n}', 'uxt3_missing', r.orig, r.lang === 'ko' ? '안녕 {n}' : 'Hello {n}']);
    h.eq('a feature that never called ctx.texts causes no repaint (neither on nor off); its own strings exist only while it is on', [r.s6.refresh, r.s7.refresh, r.hello, r.hello2], [5, 5, r.lang === 'ko' ? '안녕 9' : 'Hello 9', 'uxt3_hello']);
    h.eq('"lang" was never emitted by any of it, and nothing failed', [r.langEvents, r.errors], [0, 0]);
    h.eq('overrides are per language, and ctx.lang() follows the page language', [r.en, r.ko], [['T2-en', 'en'], ['T2-ko', 'ko']]);

    // refreshTexts 가 없거나 던져도 기능은 멀쩡
    const p2 = await lpage('ld-texts2', { phase: 'live', ff: 'uxt1' });
    const r2 = await inPage(p2, async () => {
      const L = window.__L, con = L.con(); await L.rec(['feature:error']);
      const F = await import('/js/core/features.js');
      await F.bootFeatures('guest', { forFeature: () => ({}), refreshTexts: () => { throw new Error('repaint boom'); } }, { manifest: [L.entry('uxt1', async ctx => { ctx.texts({ ko: { title: 'X' }, en: { title: 'X' } }); L.rec2('uxt1').ok = true; })] });
      const s = await L.state('uxt1');
      return [s.on, s.errors, L.rec2('uxt1').ok, con.error.filter(m => /refreshTexts failed/.test(m)).length, window.__ev['feature:error'].length];
    });
    h.eq('a page whose refreshTexts throws: the failure is logged by the loader ("[features] refreshTexts failed"), the feature stays on and counts no error', r2, [true, 0, true, 1, 0]);
    const p3 = await lpage('ld-texts3', { phase: 'live', ff: 'uxt1' });
    const r3 = await inPage(p3, async () => {
      const L = window.__L, F = await import('/js/core/features.js'), I = await import('/js/i18n.js');
      await F.bootFeatures('guest', { forFeature: () => ({}) }, { manifest: [L.entry('uxt1', async ctx => ctx.texts({ ko: { title: 'X' }, en: { title: 'X' } }))] });
      return [(await L.state('uxt1')).on, I.t('title')];
    });
    h.eq('a page without refreshTexts at all is fine (the override still applies)', r3, [true, 'X']);
  });

  await h.step('ctx.rootClass: f-<id>-<name> on <html> (name ^[a-z0-9-]{1,20}$), counted per name, removed by its release function or by dispose, other <html> classes and attributes untouched; scope.add cleanups run once on dispose', async () => {
    const p = await lpage('ld-root', { phase: 'live' });
    const r = await inPage(p, async () => {
      const L = window.__L, T = window.__T, out = {};
      T.actor('admin'); L.con();
      const st = await import('/js/core/settings.js');
      document.documentElement.classList.add('keepme'); document.documentElement.setAttribute('data-keep', 'yes');
      const attrsBefore = [document.documentElement.lang, document.documentElement.getAttribute('data-keep')];
      const code = fn => { try { fn(); return null; } catch (e) { return e.code || e.name; } };
      const mk = id => L.entry(id, async ctx => {
        const R = L.rec2(id); R.setups++; R.ctx = ctx; R.scope = window.__stub.scopes[id];
        R.off1 = ctx.rootClass('mode'); R.off2 = ctx.rootClass('mode'); R.off3 = ctx.rootClass('a-b-9'); ctx.rootClass('a'.repeat(20)); ctx.rootClass('0');
        R.bad = ['', 'Bad', 'a b', 'a'.repeat(21), 'a_b', 'é', '.x', 'x:y', 5, null, undefined, {}].map(n => code(() => ctx.rootClass(n)));
        R.scope.add(() => { R.added = (R.added || 0) + 1; });
        R.scope.add(5); R.scope.add(null);                                  // 함수가 아니면 무시
      });
      await L.boot('guest', [mk('uxr'), mk('uxr2')]);
      const html = () => [...document.documentElement.classList].sort();
      await st.setFeature('uxr', true); await L.until(async () => (await L.state('uxr')).on);
      out.on = html();
      const R = L.rec2('uxr');
      out.bad = R.bad;
      R.off1(); out.afterOne = html().includes('f-uxr-mode');               // 두 번 요청했으므로 아직 있음
      R.off1(); out.afterOneAgain = html().includes('f-uxr-mode');          // 같은 release 를 또 불러도 한 번만 셈
      R.off2(); out.afterTwo = html().includes('f-uxr-mode');
      R.off2(); out.idem = html().includes('f-uxr-mode');
      const again = R.ctx.rootClass('mode'); out.again = html().includes('f-uxr-mode'); R.off1(); out.staleOff = html().includes('f-uxr-mode'); again(); out.againOff = html().includes('f-uxr-mode');
      R.ctx.rootClass('mode'); R.ctx.rootClass('late-1');
      await st.setFeature('uxr2', true); await L.until(async () => (await L.state('uxr2')).on);
      out.two = html();
      await st.setFeature('uxr', false); await L.until(async () => !(await L.state('uxr')).on);
      out.afterOff = html(); out.added = [R.added, L.rec2('uxr2').added];
      out.deadRoot = [code(() => R.ctx.rootClass('Bad')), typeof R.ctx.rootClass('late-2'), html().filter(c => c.startsWith('f-uxr-')).length];
      R.scope.add(() => { R.addedLate = true; }); out.deadAdd = R.addedLate === undefined;
      await st.setFeature('uxr', true); await L.until(async () => (await L.state('uxr')).on); out.reOn = html().filter(c => c.startsWith('f-uxr-'));
      out.attrs = [document.documentElement.lang, document.documentElement.getAttribute('data-keep'), document.documentElement.classList.contains('keepme')];
      out.attrsBefore = attrsBefore;
      return out;
    });
    const mine = a => a.filter(c => c.startsWith('f-uxr-')).sort();
    h.eq('on: one class per name (mode asked twice → once), digits/hyphens/20 characters are fine; the page’s own <html> classes stay', r.on, ['f-uxr-0', 'f-uxr-a-b-9', 'f-uxr-aaaaaaaaaaaaaaaaaaaa', 'f-uxr-mode', 'keepme']);
    h.eq('bad names (empty, upper case, space, 21 chars, underscore, non-ascii, dot, colon, number, null, undefined, object) → bad-name', r.bad, Array(12).fill('bad-name'));
    h.eq('refcount: after one release the class stays; the same release twice counts once; after the second release it is gone; releasing again is harmless', [r.afterOne, r.afterOneAgain, r.afterTwo, r.idem], [true, true, false, false]);
    h.eq('asking again re-adds it; a stale release does not remove the new request; its own release does', [r.again, r.staleOff, r.againOff], [true, true, false]);
    h.eq('another feature’s classes live side by side (f-uxr2-… : the same 4 names; f-uxr-late-1 is only the first one’s)', [mine(r.two).includes('f-uxr-late-1'), r.two.filter(c => c.startsWith('f-uxr2-')).sort()], [true, ['f-uxr2-0', 'f-uxr2-a-b-9', 'f-uxr2-aaaaaaaaaaaaaaaaaaaa', 'f-uxr2-mode']]);
    h.eq('off: only that feature’s f-uxr-* classes are removed — f-uxr2-* (4) and keepme remain', [r.afterOff.filter(c => c.startsWith('f-uxr-')), r.afterOff.filter(c => c.startsWith('f-uxr2-')).length, r.afterOff.includes('keepme')], [[], 4, true]);
    h.eq('scope.add: the cleanup ran exactly once on dispose (the other feature’s not at all); non-functions are ignored', r.added, [1, undefined]);
    h.eq('a dead ctx: bad names still throw, a good name returns a function but adds no class; scope.add after death is ignored', [r.deadRoot, r.deadAdd], [['bad-name', 'function', 0], true]);
    h.eq('on again: the classes come back (once each)', r.reOn, ['f-uxr-0', 'f-uxr-a-b-9', 'f-uxr-aaaaaaaaaaaaaaaaaaaa', 'f-uxr-mode']);
    h.eq('<html> lang and other attributes are untouched', r.attrs, [r.attrsBefore[0], 'yes', true]);
  });

  // ================================================================ ⑥ off hook (02 §3 규칙 6)
  await h.step('off hook: a feature that left something on the device (ctx.markOffHook) gets its features/<id>/off.js off() called once when it is later off at boot or switched off, then the marker is deleted; failures only warn', async () => {
    const reqs = [];
    const p = await lpage('ld-offhook', { phase: 'live' });
    p.on('request', r => { if (/\/off\.js$/.test(r.url())) reqs.push(r.url().replace(/^.*\/features\//, '')); });
    const offJs = id => `export async function off() { localStorage.setItem('t_off_${id}', String(+(localStorage.getItem('t_off_${id}') || 0) + 1)); }`;
    for (const id of ['uxoff', 'uxoff2', 'uxoff3', 'uxoff4']) await p.route(`**/js/features/${id}/off.js`, route => route.fulfill({ contentType: 'text/javascript', body: offJs(id) }));
    await p.route('**/js/features/uxoffbad/off.js', route => route.fulfill({ contentType: 'text/javascript', body: "export async function off() { throw new Error('off boom'); }" }));
    await p.route('**/js/features/uxoffnone/off.js', route => route.fulfill({ contentType: 'text/javascript', body: 'export const nothing = 1;' }));
    const KEY = id => `wgb_f_${id}__offhook`;
    // ① 켜 둔 적이 있는 기기(표식 있음)가 꺼진 채로 부팅 → off() 1번, 표식 삭제. 다시 부팅 → 부르지 않음
    await p.evaluate(ids => { for (const id of ids) localStorage.setItem(`wgb_f_${id}__offhook`, '1'); localStorage.removeItem('t_off_uxoff'); }, ['uxoff', 'uxoff3', 'uxoffbad', 'uxoffnone', 'uxoffmissing', 'uxoffpage']);   // uxoffclean: 표식 없음 (일부러)
    const boot = () => inPage(p, async () => {
      const L = window.__L, F = await import('/js/core/features.js'), con = L.con();
      await L.boot('guest', [L.entry('uxoff', async () => {}), L.entry('uxoff3', async () => {}, { pages: ['admin'] }), L.entry('uxoffbad', async () => {}), L.entry('uxoffnone', async () => {}), L.entry('uxoffmissing', async () => {}),
        L.entry('uxoffpage', async () => {}, { pages: ['admin'] }), L.entry('uxoffclean', async () => {})]);
      await L.sleep(300);
      const key = id => `wgb_f_${id}__offhook`, calls = id => +(localStorage.getItem('t_off_' + id) || 0);
      return { marks: Object.fromEntries(['uxoff', 'uxoff3', 'uxoffbad', 'uxoffnone', 'uxoffmissing', 'uxoffpage', 'uxoffclean'].map(id => [id, localStorage.getItem(key(id))])), calls: { uxoff: calls('uxoff'), uxoff3: calls('uxoff3') }, warn: con.warn.map(w => w.replace(/(Failed to fetch dynamically imported module).*/, '$1')).sort(), error: con.error };
    });
    const b1 = await boot();
    h.check('a feature that is OFF at boot with a marker: off() ran exactly once and the marker is gone — also when off() throws, exports no off(), or the file does not exist (those only warn)', b1.marks.uxoff === null && b1.marks.uxoffbad === null && b1.marks.uxoffnone === null && b1.marks.uxoffmissing === null && b1.calls.uxoff === 1, JSON.stringify([b1.marks, b1.calls]));
    h.eq('failures only warn (an off() that throws, a file that is not there); an off.js without off() is silent; nothing is an error', [b1.warn, b1.error], [['[features] uxoffbad: off hook failed — off boom', '[features] uxoffmissing: off hook failed — Failed to fetch dynamically imported module'], []]);
    h.eq('a feature that is off only because the page is not its page (pages: [admin]) is left alone: no call, marker kept — the page it belongs to will clean up', [b1.marks.uxoff3, b1.marks.uxoffpage, b1.calls.uxoff3], ['1', '1', 0]);
    h.eq('a feature without a marker costs nothing: off.js was never requested', reqs.filter(u => /uxoffclean/.test(u)), []);
    await reload(p, { phase: 'live' }); await p.evaluate(() => 0);
    const calls2 = await p.evaluate(() => +(localStorage.getItem('t_off_uxoff') || 0));
    h.eq('booting again does not call it again (the marker is gone)', calls2, 1);

    // ② 켜져 있다가 꺼질 때 (관리자 플래그) · 서킷 브레이커가 끌 때 → 그때 표식이 있으면 off()
    const r = await inPage(p, async () => {
      const L = window.__L, T = window.__T, F = await import('/js/core/features.js'), st = await import('/js/core/settings.js'), out = {};
      T.actor('admin'); L.con();
      const calls = id => +(localStorage.getItem('t_off_' + id) || 0), mark = id => localStorage.getItem(`wgb_f_${id}__offhook`);
      localStorage.removeItem('t_off_uxoff2'); localStorage.removeItem('t_off_uxoff4');
      await L.boot('guest', [L.entry('uxoff2', async ctx => { ctx.markOffHook(); }), L.entry('uxoff4', async ctx => { ctx.markOffHook(); }), L.entry('uxoff', async () => {})]);
      await st.setFeature('uxoff2', true); await st.setFeature('uxoff4', true);
      await L.until(async () => (await L.state('uxoff2')).on && (await L.state('uxoff4')).on);
      out.marked = [mark('uxoff2'), mark('uxoff4'), calls('uxoff2'), calls('uxoff4')];
      await st.setFeature('uxoff2', false); await L.until(async () => !(await L.state('uxoff2')).on); await L.sleep(150);
      out.afterOff = [mark('uxoff2'), calls('uxoff2'), calls('uxoff4')];
      F.trip('uxoff4', 'x'); await L.sleep(250);
      out.afterTrip = [mark('uxoff4'), calls('uxoff4')];
      await st.setFeature('uxoff2', true); await L.until(async () => (await L.state('uxoff2')).on); await st.setFeature('uxoff2', false); await L.until(async () => !(await L.state('uxoff2')).on); await L.sleep(150);
      out.noMark = [mark('uxoff2'), calls('uxoff2')];                          // 이번엔 표식을 다시 안 만들었다 → (setup 이 markOffHook 을 또 불렀으므로 다시 표식이 생기고 off 1번 더)
      return out;
    });
    h.eq('ctx.markOffHook() writes the marker wgb_f_<id>__offhook = "1"; nothing runs while the feature is on', r.marked, ['1', '1', 0, 0]);
    h.eq('switched off by the admin: off() ran once, marker gone', r.afterOff, [null, 1, 0]);
    h.eq('tripped by the breaker (trip): the same — off() once, marker gone', r.afterTrip, [null, 1]);
    h.eq('every on/off cycle that marks again runs the hook again (it is per cycle, not once per device)', r.noMark, [null, 2]);

    // ③ 부팅 뒤에 나타난 표식은 이 페이지가 건드리지 않는다 — 같은 기기의 다른 탭에서 켜 둔 기능이 남긴 것일 수 있다 (재판정이 여러 번 일어나도)
    const before3 = reqs.length;
    const r3 = await inPage(p, async () => {
      const L = window.__L, st = await import('/js/core/settings.js');
      localStorage.setItem('wgb_f_uxoff__offhook', '1'); localStorage.removeItem('t_off_uxoff');
      await st.setSafe(true); await L.sleep(150); await st.setSafe(false); await L.sleep(150); await st.setFeature('uxoff2', true); await L.sleep(150); await st.setFeature('uxoff2', null); await L.sleep(250);
      return [localStorage.getItem('wgb_f_uxoff__offhook'), +(localStorage.getItem('t_off_uxoff') || 0)];
    });
    h.eq('a marker that shows up after boot (another tab on the same device has the feature on) is left alone: four re-evaluations later it is still there, off() was not called and off.js was not even requested', [r3, reqs.slice(before3).filter(u => u === 'uxoff/off.js')], [['1', 0], []]);
  });

  await h.step('ctx.raf: a stalled frame is capped at dt 0.1 s · even if the platform’s cancelAnimationFrame does nothing, a switched-off feature’s frame loop ends by itself (one stray frame at most)', async () => {
    const p = await lpage('ld-raf', { phase: 'live' });
    const r = await inPage(p, async () => {
      const L = window.__L, T = window.__T, st = await import('/js/core/settings.js'), out = {};
      T.actor('admin');
      const dts = [], nows = []; let calls = 0, ticks = 0;
      const rq = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = fn => rq(t => { if (fn.name === 'tick') ticks++; return fn(t); });
      await L.boot('guest', [L.entry('uxraf', async ctx => { ctx.raf((dt, now) => { calls++; dts.push(dt); nows.push(now); }); })]);
      await st.setFeature('uxraf', true); await L.until(async () => (await L.state('uxraf')).on);
      await L.until(() => calls >= 3);
      const t0 = performance.now(); while (performance.now() - t0 < 300) { /* a stalled frame: the main thread is busy for 300 ms */ }
      const n0 = calls; await L.until(() => calls >= n0 + 3);
      out.dt = [dts[0], Math.max(...dts), dts.every(d => d >= 0 && d <= 0.1), nows.every((x, i) => i === 0 || x > nows[i - 1])];
      window.cancelAnimationFrame = () => {};                                       // a platform whose cancel does nothing
      await st.setFeature('uxraf', false); await L.until(async () => !(await L.state('uxraf')).on);
      const k0 = ticks, c0 = calls; await L.sleep(400);
      out.stop = [ticks - k0 <= 1, calls - c0, (await L.state('uxraf')).live.raf];
      return out;
    });
    h.eq('the first frame has dt 0, a 300 ms stall shows up as exactly 0.1 (capped, never more), every dt stays in [0, 0.1], and "now" (seconds) only grows', r.dt, [0, 0.1, true, true]);
    h.eq('after the switch-off the loop did not keep asking for frames: at most 1 more frame callback, the feature’s callback was not called again, 0 live frame loops', r.stop, [true, 0, 0]);
  });

  await h.step('robustness: a device that blocks localStorage for the loader (private mode) neither breaks markOffHook nor triggers off hooks; long error messages are cut to 200 characters everywhere', async () => {
    const p = await lpage('ld-robust', { phase: 'live', ff: 'uxsb1,uxlong,uxlongfail' });
    const asked = []; p.on('request', rq => { if (/\/off\.js$/.test(rq.url())) asked.push(rq.url()); });
    const r = await inPage(p, async () => {
      const L = window.__L, F = await import('/js/core/features.js'), out = {}, con = L.con(); await L.rec(['feature:error']);
      const get = Storage.prototype.getItem, set = Storage.prototype.setItem;
      Storage.prototype.getItem = function (k) { if (String(k).startsWith('wgb_f_')) throw new Error('storage blocked'); return get.call(this, k); };
      Storage.prototype.setItem = function (k, v) { if (String(k).startsWith('wgb_f_')) throw new Error('storage blocked'); return set.call(this, k, v); };
      const LONG = 'x'.repeat(500);
      await L.boot('guest', [
        L.entry('uxsb1', async ctx => { try { ctx.markOffHook(); L.rec2('uxsb1').marked = 'no throw'; } catch (e) { L.rec2('uxsb1').marked = 'threw ' + e.message; } }),
        L.entry('uxsb2', async () => {}),
        L.entry('uxlong', async ctx => { L.rec2('uxlong').boom = ctx.guard(() => { throw new Error(LONG); }); }),
        L.entry('uxlongfail', async () => { throw new Error(LONG); }),
      ]);
      await L.sleep(300);
      try { L.rec2('uxlong').boom(); out.threw = false; } catch { out.threw = true; }
      const s1 = await L.state('uxsb1'), s2 = await L.state('uxsb2');
      out.sb = [s1.on, L.rec2('uxsb1').marked, s2.on, s2.source, s2.tripped, con.warn, con.error.filter(m => !/^\[f:ux(long|longfail)\]/.test(m))];
      const lf = await L.state('uxlong'), ff = await L.state('uxlongfail');
      out.len = { state: [lf.lastError.length, ff.lastError.length], events: window.__ev['feature:error'].map(e => [e.id, e.message.length]), consoleLines: con.error.map(m => m.length) };
      out.starts = [lf.lastError.slice(0, 5), ff.lastError.slice(0, 13), ff.on, ff.source, ff.tripped];
      Storage.prototype.getItem = get; Storage.prototype.setItem = set;
      return out;
    });
    h.eq('blocked storage: ctx.markOffHook() does not throw · a feature that is off is simply off (no off hook, no warning, no error)', r.sb, [true, 'no throw', false, 'beta', false, [], []]);
    h.eq('…and off.js was never requested for anybody', asked, []);
    h.eq('a guarded callback that throws is absorbed (the caller sees nothing)', r.threw, false);
    h.eq('an error message of 500 characters is cut to 200 — in the state, in the feature:error event and in the console line alike (the console line adds its "[f:<id>] " prefix: 11 and 15 characters)', r.len,
      { state: [200, 200], events: [['uxlongfail', 200], ['uxlong', 200]], consoleLines: [215, 211] });
    h.eq('the two kinds of messages: a guarded callback keeps the text as is · a failed setup is prefixed "setup: " first, then cut — and that feature is tripped for the session', r.starts, ['xxxxx', 'setup: xxxxxx', false, 'tripped', true]);
  });

  // ================================================================ ⑦ ctx.el — 안전한 DOM 만들기
  await h.step('ctx.el: every node carries data-f; text goes in as text; forbidden tags, attributes and script URLs are refused (the URL filter is checked against the browser’s own URL parser); handlers are guarded and counted; a dead ctx stays safe', async () => {
    const p = await lpage('ld-el', { phase: 'live' });
    const r = await inPage(p, async A => {
      const L = window.__L, T = window.__T, st = await import('/js/core/settings.js'), out = {};
      T.actor('admin'); const con = L.con();
      const R = L.rec2('uxel');
      await L.boot('guest', [L.entry('uxel', async ctx => { R.setups++; R.ctx = ctx; R.scope = window.__stub.scopes.uxel; })]);
      await st.setFeature('uxel', true); await L.until(async () => (await L.state('uxel')).on);
      const ctx = R.ctx;
      const code = fn => { try { fn(); return null; } catch (e) { return e.code || e.name; } };
      const attrsOf = e => Object.fromEntries(e.getAttributeNames().sort().map(n => [n, e.getAttribute(n)]));

      // ---- 태그
      out.goodTags = A.goodTags.map(t => { try { const e = ctx.el(t); return [e.localName, e.getAttribute('data-f')]; } catch (x) { return x.code || x.name; } });
      out.badTags = [...A.badTags, 5, null, undefined, {}, ['div'], true].map(t => code(() => ctx.el(t)));

      // ---- 속성 이름
      out.badAttrs = A.badAttrs.map(n => code(() => ctx.el('div', { attrs: { [n]: 'x' } })));
      out.badAttrEmpty = [false, null, undefined, 0, ''].map(v => code(() => ctx.el('div', { attrs: { onclick: v } })));
      const good = ctx.el('div', { attrs: { id: 'f-uxel-a', title: 'T', 'data-x': '1', 'DATA-Y': '2', 'aria-label': 'L', role: 'button', tabindex: 0, hidden: true, draggable: false, 'xml:lang': 'ko', lang: null, dir: undefined, 'data-zero': 0, 'data-empty': '' } });
      out.goodAttrs = attrsOf(good);

      // ---- 주소 속성
      out.unsafeMissed = [];
      for (const name of A.urlAttrs) for (const v of A.unsafeUrls) { const c = code(() => ctx.el('a', { attrs: { [name]: v } })); if (c !== 'bad-name') out.unsafeMissed.push([name, v, c]); }
      out.unsafeChecked = A.urlAttrs.length * A.unsafeUrls.length;
      out.safeRejected = [];
      for (const name of A.urlAttrs) for (const v of A.safeUrls) {
        try { const e = ctx.el('a', { attrs: { [name]: v } }); if (e.getAttribute(name.toLowerCase()) !== v) out.safeRejected.push([name, v, 'changed:' + e.getAttribute(name.toLowerCase())]); }
        catch (x) { out.safeRejected.push([name, v, x.code || x.name]); }
      }
      const scary = 'javascript:alert(1)';
      const e0 = ctx.el('div', { attrs: { title: scary, alt: scary, 'data-url': scary, 'aria-label': scary, value: scary, placeholder: scary, id: scary } });
      out.scaryText = ['title', 'alt', 'data-url', 'aria-label', 'value', 'placeholder', 'id'].every(k => e0.getAttribute(k) === scary);

      // 독립 오라클: 브라우저의 URL 해석기가 "스크립트/HTML" 로 읽는 모든 변형이 막히는가 (여섯 기본 주소 × 열네 가지 끼워 넣기 × 모든 위치)
      const dangerous = v => {
        try {
          const u = new URL(v, 'https://x.test/a/');
          if (u.protocol === 'javascript:' || u.protocol === 'vbscript:') return true;
          if (u.protocol === 'data:') return /^(text\/html|application\/xhtml\+xml)(;|$)/.test(u.pathname.split(',')[0].trim().toLowerCase());
        } catch {}
        return false;
      };
      const noise = ['\t', '\n', '\r', ' ', '\u0000', '\u0001', '\u001f', '\u007f', '\u0080', '\u009f', ' ', ' ', '​', '﻿'];
      const bases = ['javascript:alert(1)', 'JaVaScRiPt:x', 'vbscript:x', 'data:text/html,x', 'data:text/html;base64,x', 'data:application/xhtml+xml,x'];
      let cases = 0, danger = 0; const missed = [];
      for (const b of bases) for (const n of noise) for (let i = 0; i <= b.length; i++) {
        const v = b.slice(0, i) + n + b.slice(i); cases++;
        if (!dangerous(v)) continue;
        danger++;
        if (code(() => ctx.el('a', { attrs: { href: v } })) !== 'bad-name') missed.push(JSON.stringify(v));
      }
      out.oracle = { cases, danger, missed: missed.slice(0, 8) };

      // ---- 글자 · 클래스 · 값 속 HTML 은 그대로 글자
      const e1 = ctx.el('div', { text: '<b>bold</b><img src=x onerror=window.__pwn=1>' });
      out.text = [e1.children.length, e1.textContent, e1.innerHTML];
      out.textEmpty = [0, '', null, undefined].map(v => ctx.el('p', { text: v }).textContent);
      const e2 = ctx.el('div', { cls: 'a b  c', attrs: { title: '"><script>window.__pwn=2</script>', 'data-x': "' onmouseover='window.__pwn=3" } });
      const e3 = ctx.el('div', { cls: 'x" onclick="window.__pwn=4' });
      document.body.append(e2, e3);
      out.cls = [...e2.classList];
      out.inject = [e2.children.length, e2.getAttributeNames().sort(), e3.getAttributeNames().sort(), window.__pwn === undefined, e2.getAttribute('title')];
      e2.remove(); e3.remove();

      // ---- 스타일 · 자식
      const es = ctx.el('div', { style: { color: 'red', '--f-uxel-gap': '5px', 'border-top-color': 'blue', width: '10px' } });
      out.style = [es.style.color, es.style.getPropertyValue('--f-uxel-gap'), es.style.borderTopColor, es.style.width];
      const raw = document.createElement('b');
      const ek = ctx.el('div', { kids: ['a', ctx.el('span', { text: 'k' }), '<i>raw</i>', raw] });
      out.kids = [...ek.childNodes].map(n => (n.nodeType === 3 ? 'T:' + n.data : n.localName + (n.getAttribute('data-f') ? ':' + n.getAttribute('data-f') : '')));

      // ---- 붙이기 전에는 문서에 없음 · data-f · scope.el 도 같은 규칙 · opts 가 null 이어도 됨
      const n0 = document.querySelectorAll('[data-f="uxel"]').length, ed = ctx.el('div');
      out.detached = [n0, ed.isConnected, document.querySelectorAll('[data-f="uxel"]').length, ed.getAttribute('data-f')];
      document.body.appendChild(ed);
      out.attached = [ed.isConnected, document.querySelectorAll('[data-f="uxel"]').length];
      ed.remove();
      out.scopeEl = [code(() => R.scope.el('script')), R.scope.el('div').getAttribute('data-f'), code(() => R.scope.el('div', { attrs: { onclick: 'x' } })), code(() => R.scope.el('a', { attrs: { href: 'java\tscript:x' } }))];
      out.nullOpts = [ctx.el('div', null).getAttribute('data-f'), ctx.el('div', undefined).getAttribute('data-f')];

      // ---- 핸들러: guard 됨 · 오류는 이 기능에 집계 · 개수 세기 · 함수가 아니면 만들 때 TypeError
      const calls = [];
      const s0 = await L.state('uxel');
      const btn = ctx.el('button', { text: 'go', on: { click: ev => { calls.push(ev.type); }, 'my-ev': () => { throw new Error('el boom'); } } });
      document.body.appendChild(btn);
      const s1 = await L.state('uxel');
      btn.click(); btn.dispatchEvent(new Event('my-ev')); btn.click();
      const s2 = await L.state('uxel');
      out.handlers = { calls: [...calls], listeners: s1.live.listeners - s0.live.listeners, errors: s2.errors - s1.errors, lastError: s2.lastError, tripped: s2.tripped };
      out.badHandler = [code(() => ctx.el('div', { on: { click: 5 } })), code(() => ctx.el('div', { on: { click: null } }))];

      // ---- 끄면: 노드는 사라지고 리스너 0 · 클릭해도 아무 일 없음
      await st.setFeature('uxel', false); await L.until(async () => !(await L.state('uxel')).on);
      const s3 = await L.state('uxel');
      btn.click();
      out.afterOff = [calls.length, s3.live.listeners, document.querySelectorAll('[data-f="uxel"]').length, btn.isConnected];

      // ---- 꺼진 ctx: 여전히 안전 규칙을 지키고, 핸들러는 잠들어 있음. 늦게 붙인 노드는 다음 dispose 때 치워짐
      const late = ctx.el('div', { text: 'late', on: { click: () => { calls.push('late'); } } });
      document.body.appendChild(late); late.click();
      out.dead = [late.getAttribute('data-f'), late.textContent, calls.length, code(() => ctx.el('script')), code(() => ctx.el('a', { attrs: { href: 'java\tscript:x' } }))];
      await st.setFeature('uxel', true); await L.until(async () => (await L.state('uxel')).on);
      await st.setFeature('uxel', false); await L.until(async () => !(await L.state('uxel')).on);
      out.swept = [late.isConnected, document.querySelectorAll('[data-f="uxel"]').length];
      out.errors = con.error;
      return out;
    }, { goodTags: EL_GOOD_TAGS, badTags: EL_BAD_TAGS, badAttrs: EL_BAD_ATTRS, urlAttrs: EL_URL_ATTRS, unsafeUrls: EL_UNSAFE_URLS, safeUrls: EL_SAFE_URLS });

    h.eq('tags: ordinary and custom element names work (case-insensitive, up to 31 characters) and carry data-f; "scripts" / "x-script" are fine — only the exact forbidden names are refused', r.goodTags, EL_GOOD_TAGS.map(t => [t.toLowerCase(), 'uxel']));
    h.eq('tags: script · iframe · frame · frameset · object · embed · base · meta · link · style (any case), malformed names (space, <>, digit first, é, underscore, trailing newline, 32 characters) and non-strings → bad-name', r.badTags, Array(EL_BAD_TAGS.length + 6).fill('bad-name'));
    h.eq('attribute names: on* · style · srcdoc · data-f (any case) and malformed names are refused, even when the value is empty/false/null', [r.badAttrs, r.badAttrEmpty], [Array(EL_BAD_ATTRS.length).fill('bad-name'), Array(5).fill('bad-name')]);
    h.eq('attribute values: true → empty attribute, false/null/undefined → not set, 0 → "0"; names are lower-cased; data-f is the feature id', r.goodAttrs,
      { 'aria-label': 'L', 'data-empty': '', 'data-f': 'uxel', 'data-x': '1', 'data-y': '2', 'data-zero': '0', hidden: '', id: 'f-uxel-a', role: 'button', tabindex: '0', title: 'T', 'xml:lang': 'ko' });
    h.eq(`script URLs: all ${r.unsafeChecked} combinations of (href · src · action · formaction · poster · data · xlink:href, any case) × (javascript: · vbscript: · data:text/html · data:application/xhtml+xml, any case, leading space/control characters, and tab/newline/CR inside the scheme) are refused`, r.unsafeMissed, []);
    h.eq('ordinary URLs pass untouched (#anchor, relative, https, mailto, tel, data:image, data:text/plain, look-alikes such as "xjavascript:", "?q=javascript:")', r.safeRejected, []);
    h.eq('the URL filter only looks at URL attributes — "javascript:…" as a title / alt / aria-label / value / id is just text', r.scaryText, true);
    h.eq(`the filter agrees with the browser’s own URL parser: of ${r.oracle.cases} generated variants (6 URLs × 14 inserted characters × every position) the ${r.oracle.danger} that the browser reads as javascript:/vbscript:/HTML data: are all refused — and the check was not vacuous`, [r.oracle.danger > 150, r.oracle.missed], [true, []]);
    h.eq('text is a text node: markup in it stays visible text (no child elements, innerHTML is escaped); 0 → "0", "" / null / undefined → empty', [r.text, r.textEmpty],
      [[0, '<b>bold</b><img src=x onerror=window.__pwn=1>', '&lt;b&gt;bold&lt;/b&gt;&lt;img src=x onerror=window.__pwn=1&gt;'], ['0', '', '', '']]);
    h.eq('class and attribute values with quotes / tags cannot break out: no extra attribute, no child element, nothing ran', [r.cls, r.inject],
      [['a', 'b', 'c'], [0, ['class', 'data-f', 'data-x', 'title'], ['class', 'data-f'], true, '"><script>window.__pwn=2</script>']]);
    h.eq('style: plain properties, --custom properties and dashed names are set through the style object', r.style, ['red', '5px', 'blue', '10px']);
    h.eq('kids: strings become text nodes (never parsed), nodes are appended; ctx.el children carry data-f, foreign nodes do not', r.kids, ['T:a', 'span:uxel', 'T:<i>raw</i>', 'b']);
    h.eq('a node is not in the document until the feature appends it; data-f marks it; scope.el follows the same rules; opts may be null/undefined', [r.detached, r.attached, r.scopeEl, r.nullOpts],
      [[0, false, 0, 'uxel'], [true, 1], ['bad-name', 'uxel', 'bad-name', 'bad-name'], ['uxel', 'uxel']]);
    h.eq('handlers: run with the event, two handlers = two counted listeners, a throwing handler is one error for this feature (message kept, not tripped); a non-function handler is a TypeError at creation', [r.handlers, r.badHandler],
      [{ calls: ['click', 'click'], listeners: 2, errors: 1, lastError: 'el boom', tripped: false }, ['TypeError', 'TypeError']]);
    h.eq('off: the nodes are gone, listeners 0, the old button no longer reacts', r.afterOff, [2, 0, 0, false]);
    h.eq('a dead ctx still builds nodes (late code does not crash) with the same safety rules; its handlers sleep; and a node that late code appended is swept by the next dispose', [r.dead, r.swept],
      [['uxel', 'late', 2, 'bad-name', 'bad-name'], [false, 0]]);
    h.eq('the only console errors were the feature’s own deliberate one', r.errors, ['[f:uxel] el boom']);
  });

  // ================================================================ ⑧ ctx.db — 래퍼 (가짜 백엔드로 구독·해제·전달을 정확히 셈)
  await h.step('ctx.db (stub backend): watchers are counted and auto-released (really unsubscribed at the backend), callbacks are guarded, errors reach onError, calls pass through while alive and do nothing after death', async () => {
    const p = await lpage('ld-dbstub', { phase: 'live', ff: 'uxdb' });
    const r = await inPage(p, async () => {
      const L = window.__L, D = await import('/js/core/docdb.js'), F = await import('/js/core/features.js'), out = {};
      const con = L.con();
      const code = fn => { try { fn(); return null; } catch (e) { return e.code || e.name; } };
      // 진짜 데모 백엔드 대신 기록하는 가짜 (페이지의 첫 docdb 사용 전에 등록해야 함)
      const S = window.__dbs = { watches: [], reads: [], lists: [], writes: [] };
      D.registerBackend('demo', () => ({
        kind: 'demo', admin: () => true,
        read: async path => { S.reads.push(path); return { id: path.split('/').pop(), v: 1 }; },
        list: async (name, q) => { S.lists.push([name, JSON.stringify(q)]); return [{ id: 'a' }, { id: 'b' }]; },
        write: async ops => { S.writes.push(ops.map(o => o.type + ':' + o.path)); },
        watchDoc(path, fn, onError) { const w = { kind: 'doc', path, fn, onError, unsubs: 0 }; S.watches.push(w); Promise.resolve().then(() => { if (!w.unsubs) w.fn(null); }); return () => { w.unsubs++; }; },
        watchList(name, q, fn, onError) { const w = { kind: 'list', path: name, fn, onError, unsubs: 0 }; S.watches.push(w); Promise.resolve().then(() => { if (!w.unsubs) w.fn([], []); }); return () => { w.unsubs++; }; },
      }));
      const R = L.rec2('uxdb');
      await L.boot('guest', [L.entry('uxdb', async ctx => { R.setups++; R.ctx = ctx; })]);
      await L.until(async () => (await L.state('uxdb'))?.on);
      const db = R.ctx.db, live = async () => (await L.state('uxdb')).live, errs = async () => (await L.state('uxdb')).errors;
      const coreN = S.watches.length;
      out.core = S.watches.map(w => w.path).sort();
      out.backend = [db.backend, db.ts(), db.inc(3)];

      // ---- 구독: 개수 · 자동 해제 · 두 번 해제해도 한 번 · 전달
      const got = [], w0 = (await live()).watchers;
      const offA = db.doc('translations/t1').watch(v => got.push(['A', v]), e => got.push(['A-err', e.code]));
      const offB = db.col('polls').where('open', '==', true).watch((docs, ch) => got.push(['B', docs.length, Array.isArray(ch)]));
      await L.sleep(30);
      out.watching = [(await live()).watchers - w0, S.watches.slice(coreN).map(w => [w.kind, w.path, w.unsubs]), got.map(g => JSON.stringify(g))];
      S.watches[coreN + 1].fn([{ id: 'x' }, { id: 'y' }], [{ type: 'added' }]);
      out.delivered = got.filter(g => g[0] === 'B').map(g => g[1]);
      offA(); offA(); offA();
      out.offA = [(await live()).watchers - w0, S.watches[coreN].unsubs, S.watches[coreN + 1].unsubs];

      // ---- 콜백이 던지면 이 기능의 오류로 집계 (콜백도 onError 도 guard) — 구독은 그대로
      const e0 = await errs();
      const offC = db.doc('translations/t2').watch(() => { throw new Error('cb boom'); }, () => { throw new Error('err boom'); });
      await L.sleep(30);
      const wC = S.watches.at(-1);
      wC.onError({ code: 'unavailable', message: 'x' });
      out.cbErrors = [(await errs()) - e0, (await L.state('uxdb')).tripped, wC.unsubs];

      // ---- 구독을 못 거는 경우: 동기 오류 → 등록도 개수도 없음 / 비동기(규칙) 거부 → onError 로 전달 (개수는 해제할 때까지 유지)
      const base = (await live()).watchers, n0 = S.watches.length;
      out.syncThrows = [
        code(() => db.doc('nope/x').watch(() => {})), code(() => db.col('nope').watch(() => {})),
        code(() => db.col('polls').where('open', '==', true).orderBy('order').watch(() => {})),
        code(() => db.doc('translations/t1').watch(5)),
        code(() => db.col('polls').where(5, '==', 1)), code(() => db.col('polls').limit(0)), code(() => db.col('polls').orderBy('x', 'up')),
      ];
      out.noRegistration = [(await live()).watchers - base, S.watches.length - n0];
      const seen = [];
      const offP = db.col('photos').watch(() => seen.push('data'), e => seen.push(e.code));
      await L.sleep(50);
      out.denied = [seen, (await live()).watchers - base, S.watches.length - n0];
      offP();
      out.deniedOff = (await live()).watchers - base;

      // ---- 살아 있는 동안은 그대로 통과 (질의 사슬 · 일괄 쓰기 · add)
      const rd = await db.doc('translations/t1').get();
      const ls = await db.col('translations').where('src', '==', 'ko').limit(5).get();
      await db.doc('translations/t1').set({ x: 1 }); await db.doc('translations/t1').update({ y: 2 }); await db.doc('translations/t1').create({ z: 3 }); await db.doc('translations/t1').delete();
      const id = await db.col('translations').add({ q: 1 });
      const bt = db.batch(); const chain = bt.set('translations/b1', { a: 1 }) === bt && bt.update('translations/b2', { b: 2 }) === bt && bt.delete('translations/b3') === bt;
      await bt.commit();
      out.alive = { rd, ls, chain, idLen: id.length, writes: S.writes.map(w => w.map(x => x.replace(id, '<id>'))), reads: [...S.reads], lists: [...S.lists] };
      out.paths = [db.doc('translations/t1').path, db.col('translations').name, db.col('translations').where('src', '==', 'ko').name];

      // ---- 끄기 전에 만들어 둔 일괄 쓰기 · 아직 구독 중인 것들을 기억 (끈 뒤의 "늦은 배달" 흉내)
      const lateBatch = db.batch().set('translations/late', { a: 1 });
      const mine = S.watches.slice(coreN).filter(w => w.unsubs === 0);
      out.beforeTrip = [mine.map(w => w.path).sort(), (await live()).watchers];
      F.trip('uxdb', 'test'); await L.until(async () => !(await L.state('uxdb')).on); await L.sleep(30);
      out.afterTrip = [mine.map(w => w.unsubs), (await L.state('uxdb')).live.watchers];
      const gotN = got.length, errN = (await L.state('uxdb')).errors;
      for (const w of mine) { w.fn(w.kind === 'list' ? [{ id: 'late' }] : { id: 'late' }, []); w.onError({ code: 'unavailable' }); }
      out.late = [got.length - gotN, (await L.state('uxdb')).errors - errN];

      // ---- 꺼진 뒤의 호출은 아무 일도 하지 않음 (백엔드에 닿지 않음)
      const before = [S.reads.length, S.lists.length, S.writes.length, S.watches.length];
      const x = v => (v === undefined ? '∅' : v);
      out.dead = [
        x(await db.doc('translations/t1').get()), x(await db.col('translations').get()), x(await db.col('translations').where('src', '==', 'ko').get()), x(await db.col('translations').add({ q: 1 })),
        x(await db.doc('translations/t1').set({ a: 1 })), x(await db.doc('translations/t1').update({ a: 1 })), x(await db.doc('translations/t1').create({ a: 1 })), x(await db.doc('translations/t1').delete()),
        x(await db.batch().set('translations/b', { a: 1 }).commit()), x(await lateBatch.commit()),
        typeof db.doc('translations/t1').watch(() => {}), typeof db.col('polls').watch(() => {}),
      ];
      out.deadNothing = [S.reads.length - before[0], S.lists.length - before[1], S.writes.length - before[2], S.watches.length - before[3]];
      out.console = con.error;
      return out;
    });

    h.eq('the core’s own two watchers (app/settings, app/live) went through the stub — a faithful stand-in for the page', r.core, ['app/live', 'app/settings']);
    h.eq('ctx.db.backend is the backend kind; ts() / inc(n) are the docdb markers', r.backend, ['demo', { $sv: 'ts' }, { $sv: 'inc', n: 3 }]);
    h.eq('doc.watch / col.watch: each one is counted as a watcher and reaches the backend once (initial value delivered)', r.watching,
      [2, [['doc', 'translations/t1', 0], ['list', 'polls', 0]], ['["A",null]', '["B",0,true]']]);
    h.eq('a list update from the backend reaches the callback with (docs, changes)', r.delivered, [0, 2]);
    h.eq('off(): the watcher count drops once, the backend is unsubscribed exactly once (also after off() three times); the other watcher is untouched', r.offA, [1, 1, 0]);
    h.eq('a callback or onError that throws = one counted error each for this feature (guarded, the subscription stays)', r.cbErrors, [2, false, 0]);
    h.eq('watch() refuses at once (no registration, no count) for unknown paths/collections, a query that needs a composite index, a non-function callback; bad where/limit/orderBy arguments throw from the query chain', [r.syncThrows, r.noRegistration],
      [['unknown-path', 'unknown-path', 'invalid-argument', 'TypeError', 'invalid-argument', 'invalid-argument', 'invalid-argument'], [0, 0]]);
    h.eq('a watch that the rules refuse (v3.2 collection) reaches onError with permission-denied and never touches the backend; it stays counted until released, then the count returns', [r.denied, r.deniedOff], [[['permission-denied'], 1, 0], 0]);
    h.eq('while alive, reads/lists/writes pass straight through: the query chain reaches the backend intact, set · update · create · delete · add · batch(set, update, delete) are real writes, add returns a 20-character id, doc/col keep path/name', [r.alive, r.paths],
      [{ rd: { id: 't1', v: 1 }, ls: [{ id: 'a' }, { id: 'b' }], chain: true, idLen: 20,
        writes: [['set:translations/t1'], ['update:translations/t1'], ['create:translations/t1'], ['delete:translations/t1'], ['create:translations/<id>'], ['set:translations/b1', 'update:translations/b2', 'delete:translations/b3']],
        reads: ['translations/t1'], lists: [['translations', '{"where":[["src","==","ko"]],"order":[],"limit":5}']] }, ['translations/t1', 'translations', 'translations']]);
    h.eq('off (here: the breaker): every feature watcher is unsubscribed at the backend exactly once and the counter is 0 — independent of the loader’s own bookkeeping', [r.beforeTrip, r.afterTrip],
      [[['polls', 'translations/t2'], 2], [[1, 1], 0]]);
    h.eq('a late delivery from the backend after the feature is gone (data and errors) reaches nobody and counts no error', r.late, [0, 0]);
    h.eq('after death: get → null, col.get → [], add → null, set/update/create/delete/batch.commit (even one started while alive) resolve without writing, watch returns a no-op', r.dead,
      [null, [], [], null, '∅', '∅', '∅', '∅', '∅', '∅', 'function', 'function']);
    h.eq('…and none of it reached the backend (no read, list, write or new subscription)', r.deadNothing, [0, 0, 0, 0]);
    h.eq('the only console errors were the feature’s own deliberate ones (cb boom, err boom, tripped)', r.console, ['[f:uxdb] cb boom', '[f:uxdb] err boom', '[f:uxdb] test']);
  });

  // ================================================================ ⑨ ctx.db — 진짜 데모 백엔드 (규칙 거울 · 질의 · 일괄 쓰기 · 실제 변경)
  await h.step('ctx.db (real demo backend): the rules mirror answers through the wrapper — admins write, guests are refused, v3.2 collections are closed — queries and batches work, watchers see real changes and fall silent at off', async () => {
    const p = await lpage('ld-db', { phase: 'live' });
    const r = await inPage(p, async () => {
      const L = window.__L, T = window.__T, st = await import('/js/core/settings.js'), out = {};
      const con = L.con();
      await T.reset(['g1']); T.actor('admin');
      const R = L.rec2('uxdb2');
      await L.boot('guest', [L.entry('uxdb2', async ctx => { R.setups++; R.ctx = ctx; })]);
      await st.setFeature('uxdb2', true); await L.until(async () => (await L.state('uxdb2')).on);
      const db = R.ctx.db;
      const rej = async pr => { try { await pr; return 'resolved'; } catch (e) { return e.code || e.name; } };
      const tr = { src: 'ko', ko: '안녕', en: 'Hello', engine: 'x' };

      // ---- 관리자: 쓰기 → 읽기 → 부분 수정
      await db.doc('translations/t1').set({ ...tr, updatedAt: db.ts() });
      const g1 = await db.doc('translations/t1').get();
      await L.sleep(5);
      await db.doc('translations/t1').update({ en: 'Hi', updatedAt: db.ts() });
      const g2 = await db.doc('translations/t1').get();
      out.roundTrip = [g1.id, g1.ko, g1.en, typeof g1.updatedAt, g2.en, g2.ko, g2.updatedAt > g1.updatedAt];

      // ---- add · 질의
      await L.sleep(5);
      const id2 = await db.col('translations').add({ ...tr, src: 'en', ko: '둘', en: 'Two', updatedAt: db.ts() });
      const all = await db.col('translations').get(), ko = await db.col('translations').where('src', '==', 'ko').get(), en = await db.col('translations').where('src', '==', 'en').get();
      const lim = await db.col('translations').limit(1).get(), ord = await db.col('translations').orderBy('updatedAt', 'desc').get();
      out.queries = [id2.length, all.length, ko.map(d => d.id), en.map(d => d.id === id2), lim.length, ord.map(d => d.id === id2 ? '<id>' : d.id)];

      // ---- 일괄 쓰기: 여러 문서를 한 번에 · 하나라도 틀리면 전부 취소 · 한 문서를 두 번 쓰면 거부
      await db.batch().set('translations/t2', { ...tr, updatedAt: db.ts() }).set('translations/t3', { ...tr, updatedAt: db.ts() }).commit();
      await db.batch().update('translations/t2', { en: 'Two!', updatedAt: db.ts() }).delete('translations/t3').commit();
      const t2 = await db.doc('translations/t2').get(), t3 = await db.doc('translations/t3').get();
      out.batch = [t2.en, t3];
      const bad = await rej(db.batch().set('translations/t5', { ...tr, updatedAt: db.ts() }).set('translations/t4', { ...tr, src: 'xx', updatedAt: db.ts() }).commit());
      out.atomic = [bad, await db.doc('translations/t5').get(), await db.doc('translations/t4').get()];
      out.twice = await rej(db.batch().set('translations/t6', { ...tr, updatedAt: db.ts() }).set('translations/t6', { ...tr, updatedAt: db.ts() }).commit());

      // ---- inc / ts 는 서버가 해석 (merge 로 두 번 → 2)
      await db.doc('app/live').set({ cue: 'c1', cueSeq: db.inc(1), updatedAt: db.ts() }, { merge: true });
      await db.doc('app/live').set({ cueSeq: db.inc(1), updatedAt: db.ts() }, { merge: true });
      const lv = await db.doc('app/live').get();
      out.inc = [lv.cue, lv.cueSeq, typeof lv.updatedAt];
      out.values = [await rej(db.doc('translations/t1').set({ ...tr, d: new Date(), updatedAt: db.ts() })), await rej(db.doc('translations/t1').set({ ...tr, d: undefined, updatedAt: db.ts() })), await rej(db.doc('translations/t1').create({ ...tr, updatedAt: db.ts() }))];

      // ---- 하객: 읽기는 되고, 관리자 규칙은 막히고, v3.2 컬렉션은 닫혀 있음 · 하객이 해도 되는 쓰기는 됨
      T.actor('guest');
      out.guest = [
        await rej(db.doc('translations/t1').get()), await rej(db.col('translations').get()),
        await rej(db.doc('translations/t9').set({ ...tr, updatedAt: db.ts() })), await rej(db.doc('translations/t1').update({ en: 'x', updatedAt: db.ts() })), await rej(db.doc('translations/t1').delete()),
        await rej(db.doc('app/settings').set({ features: {}, updatedAt: db.ts() })), await rej(db.col('thanks').get()),
        await rej(db.doc('photos/x').get()), await rej(db.col('photos').get()), await rej(db.doc('photos/x').set({ a: 1 })),
        await rej(db.doc('nope/x').get()), await rej(db.col('nope').get()),
        await rej(db.col('translations').where('src', '==', 'ko').orderBy('updatedAt').get()),
        await rej(db.batch().set('translations/g1', { ...tr, updatedAt: db.ts() }).commit()),
      ];
      out.guestOk = [await rej(db.doc('checkins/g1').set({ via: 'phone', createdAt: db.ts() })), await rej(db.doc('checkins/g1').set({ via: 'kiosk', createdAt: db.ts() })), await rej(db.doc('checkins/g1').create({ via: 'phone', createdAt: db.ts() })), (await db.doc('checkins/g1').get())?.via, await rej(db.doc('checkins/nobody').set({ via: 'phone', createdAt: db.ts() }))];

      // ---- 실제 변경이 구독자에게 전달됨 (문서 · 질의) · 해제하면 멈춤 · 꺼지면 조용
      T.actor('admin');
      const ev = [], phase = [];
      const mark = () => { phase.push(ev.splice(0).sort()); };
      const offDoc = db.doc('translations/w1').watch(v => ev.push(JSON.stringify(['doc', v ? v.en : null])), e => ev.push(JSON.stringify(['doc-err', e.code])));
      const offCol = db.col('translations').where('src', '==', 'ko').watch((docs, ch) => ev.push(JSON.stringify(['col', docs.map(d => d.id).sort().join(','), ch.map(c => c.type + ':' + c.id).sort().join(',')])), e => ev.push(JSON.stringify(['col-err', e.code])));
      await L.sleep(100); mark();
      out.watchersOn = (await L.state('uxdb2')).live.watchers;
      await db.doc('translations/w1').set({ ...tr, en: 'W1', updatedAt: db.ts() }); await L.sleep(100); mark();
      await db.doc('translations/w1').update({ en: 'W2', updatedAt: db.ts() }); await L.sleep(100); mark();
      offDoc();
      await db.doc('translations/w1').delete(); await L.sleep(100); mark();
      offCol();
      await db.doc('translations/w1').set({ ...tr, en: 'W3', updatedAt: db.ts() }); await L.sleep(100); mark();
      out.phases = phase;
      out.watchersAfterOff = (await L.state('uxdb2')).live.watchers;

      // 끄기 직전에 다시 구독 → 끈 뒤 쓰기를 해도 콜백은 오지 않음
      const late = [];
      db.doc('translations/w1').watch(v => late.push('doc'), () => {});
      db.col('translations').watch(() => late.push('col'), () => {});
      await L.sleep(80); late.length = 0;
      await st.setFeature('uxdb2', false); await L.until(async () => !(await L.state('uxdb2')).on);
      await db.doc('translations/w1').update({ en: 'after-off', updatedAt: db.ts() }); await L.sleep(120);
      out.afterOff = [late.length, (await L.state('uxdb2')).live.watchers];
      out.console = con.error;
      return out;
    });

    h.eq('admin: set → get returns { id, …fields } with the server time as a number; update changes only the named fields', r.roundTrip, ['t1', '안녕', 'Hello', 'number', 'Hi', '안녕', true]);
    h.eq('add() makes a 20-character id; where / limit / orderBy(desc) answer like Firestore', r.queries, [20, 2, ['t1'], [true], 1, ['<id>', 't1']]);
    h.eq('batch: several documents in one commit, set + update + delete mix; one bad write cancels the whole batch; the same document twice is refused', [r.batch, r.atomic, r.twice],
      [['Two!', null], ['invalid-argument', null, null], 'invalid-argument']);
    h.eq('ctx.db.inc(1) twice with merge → 2, ts() becomes a time; unsupported values (Date, undefined) and a duplicate create come back as invalid-argument / already-exists', [r.inc, r.values],
      [['c1', 2, 'number'], ['invalid-argument', 'invalid-argument', 'already-exists']]);
    h.eq('a guest may read, but writing translations, updating/deleting them, writing app/settings, listing thanks, any v3.2 collection (photos) → permission-denied; unknown paths → unknown-path; a query needing a composite index → invalid-argument',
      r.guest, ['resolved', 'resolved', 'permission-denied', 'permission-denied', 'permission-denied', 'permission-denied', 'permission-denied', 'permission-denied', 'permission-denied', 'permission-denied', 'unknown-path', 'unknown-path', 'invalid-argument', 'permission-denied']);
    h.eq('…but what the rules allow a guest does work through ctx.db: a check-in for themselves is created once (a second write and a check-in for a stranger are refused, a duplicate create is already-exists) and reads back', r.guestOk,
      ['resolved', 'permission-denied', 'already-exists', 'phone', 'permission-denied']);
    h.eq('watchers see real changes: initial value, then created / modified / removed (a query reports added / modified / removed with the document ids); two watchers = 2 counted', [r.phases, r.watchersOn],
      [[
        ['["col","t1,t2","added:t1,added:t2"]', '["doc",null]'],
        ['["col","t1,t2,w1","added:w1"]', '["doc","W1"]'],
        ['["col","t1,t2,w1","modified:w1"]', '["doc","W2"]'],
        ['["col","t1,t2","removed:w1"]'],
        [],
      ], 2]);
    h.eq('after off() the watcher count is 0 (the doc watcher stopped delivering before the delete, the query watcher before the last write)', r.watchersAfterOff, 0);
    h.eq('a feature switched off by the admin flag: its watchers are gone — later writes reach no callback — and its counters are 0', r.afterOff, [0, 0]);
    h.eq('no console errors at all (a refused request is a rejected promise, not a log line)', r.console, []);
  });

  // ================================================================ ⑩ ctx 공통 API (02 §4) — 읽기 전용 값 · 설정 · 라이브 · 버스
  await h.step('ctx common API (02 §4): id / page / demo / entry are read-only; lang · phase · settings · cfg · live follow the real documents; onSettings / onLive / bus.on(replay) / bus.last / bus.emit rules; guard, log, store', async () => {
    const p = await lpage('ld-api', { phase: 'live' });
    const r = await inPage(p, async () => {
      const L = window.__L, T = window.__T, st = await import('/js/core/settings.js'), I = await import('/js/i18n.js'), out = {};
      const con = L.con();
      const logs = []; const origLog = console.log.bind(console); console.log = (...a) => { logs.push(a.map(String)); origLog(...a); };
      T.actor('admin');
      const R = L.rec2('uxapi'), Q = L.rec2('uxapi2');
      const code = fn => { try { fn(); return null; } catch (e) { return e.code || e.name; } };
      await L.boot('guest', [
        L.entry('uxapi', async ctx => {
          R.setups++; R.ctx = ctx; R.scope = window.__stub.scopes.uxapi;
          R.s = []; R.l = []; R.bS = []; R.bSR = []; R.bF = []; R.bFR = [];
          R.offS = ctx.onSettings(s => R.s.push(s)); R.offL = ctx.onLive(l => R.l.push(l));
          ctx.bus.on('settings', s => R.bS.push(s)); ctx.bus.on('settings', s => R.bSR.push(s), { replay: true });
          ctx.bus.on('feature:state', s => R.bF.push([s.id, s.on, s.source])); ctx.bus.on('feature:state', s => R.bFR.push(s), { replay: true });
          R.immediate = [R.s.length, R.l.length, R.bS.length, R.bSR.length, R.bF.length, R.bFR.length];
        }),
        L.entry('uxapi2', async ctx => {
          Q.setups++; Q.ctx = ctx; Q.got = []; Q.fs = [];
          ctx.bus.on('uxapi:ping', v => Q.got.push(v)); ctx.bus.on('feature:state', s => Q.fs.push([s.id, s.on, s.source]));
        }),
      ]);
      await st.setFeature('uxapi', true); await L.until(async () => (await L.state('uxapi')).on);
      out.ownOn = R.bF.slice();
      await st.setFeature('uxapi2', true); await L.until(async () => (await L.state('uxapi2')).on);
      const ctx = R.ctx, ctx2 = Q.ctx;

      // ---- 이름표와 읽기 전용
      out.id = [ctx.id, ctx.page, ctx.demo, ctx.entry.id, ctx.entry.status, ctx.entry.name, [...ctx.entry.pages], [...ctx.entry.phases], typeof ctx.entry.load];
      out.frozen = [Object.isFrozen(ctx.entry), Object.isFrozen(ctx.entry.name), Object.isFrozen(ctx.entry.pages), Object.isFrozen(ctx.entry.phases), Object.isFrozen(R.scope)];
      out.mutate = [code(() => ctx.entry.pages.push('x')), code(() => { 'use strict'; ctx.entry.status = 'x'; }), ctx.entry.status, code(() => { 'use strict'; R.scope.id = 'x'; }), R.scope.id];
      out.scope = [Object.keys(R.scope).sort(), R.scope.entry === ctx.entry, R.scope.alive()];

      // ---- 언어 · 페이즈
      I.setLang('en'); const en = ctx.lang(); I.setLang('ko'); out.lang = [en, ctx.lang()];
      out.phase = [ctx.phase(), ctx.bus.last('phase')];

      // ---- 처음 상태: 켜지는 순간의 즉시 전달 (onSettings / onLive 는 바로 1번, bus.on 은 replay 일 때만)
      out.immediate = R.immediate;
      out.cfg0 = [JSON.stringify(ctx.cfg()), Object.isFrozen(ctx.cfg()), ctx.cfg() === ctx.cfg(), JSON.stringify(ctx.live()), Object.isFrozen(ctx.live()), ctx.settings() === st.getSettings(), ctx.settings().features.uxapi];

      // ---- 관리자가 저장하면 ctx.cfg() / ctx.settings() / ctx.live() 가 따라옴 · 다른 기능의 cfg 는 섞이지 않음
      await st.saveCfg('uxapi', { a: 1, nested: { b: 2 } }); await st.saveCfg('other', { z: 9 });
      await L.until(() => ctx.settings().cfg.other !== undefined);
      out.cfg1 = [JSON.stringify(ctx.cfg()), Object.isFrozen(ctx.cfg()), Object.isFrozen(ctx.cfg().nested), JSON.stringify(ctx.settings().cfg.other), ctx.cfg() === ctx.settings().cfg.uxapi];
      await st.setLive({ cue: 'c1', cueSeq: 3 }); await L.until(() => ctx.live().cue === 'c1');
      out.live1 = [ctx.live().cue, ctx.live().cueSeq, ctx.live() === st.getLive()];
      out.counts1 = [R.s.length, R.l.length, R.bS.length, R.bSR.length];
      out.last = [ctx.bus.last('settings') === ctx.settings(), ctx.bus.last('live') === ctx.live(), ctx.bus.last('feature:state'), ctx.bus.last('nothing')];

      // ---- off() 로 그 구독만 멈춤 (두 번 불러도 괜찮음)
      R.offS(); R.offS();
      const nS = R.s.length, nL = R.l.length;
      await st.saveCfg('uxapi', { a: 2 }); await L.until(() => ctx.cfg().a === 2);
      await st.setLive({ cueSeq: 4 }); await L.until(() => ctx.live().cueSeq === 4);
      out.counts2 = [R.s.length - nS, R.l.length - nL, ctx.cfg().a];
      out.badSub = [code(() => ctx.onSettings(5)), code(() => ctx.onLive(null)), code(() => ctx.bus.on('x', 5))];

      // ---- ctx.listen: 대상 검사 · 정상 동작
      const et = new EventTarget(), seen = [], listeners = async () => (await L.state('uxapi')).live.listeners;
      out.badListen = [null, undefined, 5, 'window', {}, { addEventListener: 5 }, [], () => {}].map(t => code(() => ctx.listen(t, 'x', () => {})));
      out.badListenFn = [code(() => ctx.listen(et, 'x', 5)), code(() => ctx.listen(et, 'x')), await listeners()];
      const offEt = ctx.listen(et, 'ping', () => seen.push(1)), during = await listeners();
      et.dispatchEvent(new Event('ping')); offEt(); offEt(); et.dispatchEvent(new Event('ping'));
      out.goodListen = [during, seen.length, typeof offEt, await listeners()];

      // ---- bus.emit 규칙: 자기 이름공간(<id>:…) 과 02 §5 의 자기 이벤트만
      const payload = { n: 1 };
      ctx.bus.emit('uxapi:ping', payload);
      out.emitOk = [Q.got.length, Q.got[0] === payload];
      const refused = ['settings', 'live', 'phase', 'lang', 'feature:state', 'feature:error', 'guest:screen', 'village:ready', 'uxapi2:x', 'uxapi', '', 'other:x', 'checkin:done', 'poll:result', 'live:cue', 'UXAPI:x', 'xuxapi:x', ' uxapi:x'];
      out.emitBad = [...refused, 5, null, undefined, {}].map(t => code(() => ctx.bus.emit(t, 1)));
      out.emitOther = [code(() => ctx2.bus.emit('uxapi:ping', 1)), code(() => ctx2.bus.emit('uxapi2:ok', 1)), Q.got.length];

      // ---- guard · log · store
      const g = ctx.guard(function (a, b, c) { return [this && this.tag, a, b, c]; });
      out.guard = [g.call({ tag: 'T' }, 1, 2, 3), g.name, code(() => ctx.guard(5)), code(() => ctx.guard()), code(() => ctx.guard('x'))];
      ctx.log('hello', 1, { a: 1 });
      out.log = logs.filter(l => l[0] === '[f:uxapi]');
      out.store = (await ctx.store()) === (await (await import('/js/store.js')).getStore());

      // ---- 끄면: 자기 off 는 듣지 못하고(구독이 먼저 풀림), 다른 기능은 들음 · 읽기 함수는 계속 동작 · 그 뒤 emit / onSettings 는 아무 일 없음
      await st.setFeature('uxapi', false); await L.until(async () => !(await L.state('uxapi')).on);
      out.fs = [R.bF, Q.fs];
      const pre = Q.got.length; ctx.bus.emit('uxapi:ping', 2);
      let late = 0; const offLate = ctx.onSettings(() => { late++; }); const offLateL = ctx.onLive(() => { late++; });
      await st.saveCfg('uxapi', { a: 3 }); await L.sleep(80);
      out.dead = [Q.got.length - pre, typeof offLate, typeof offLateL, late, typeof ctx.lang(), ctx.phase(), ctx.settings() === st.getSettings(), ctx.cfg().a, (await L.state('uxapi')).live.bus];
      out.errors = [con.error, (await L.state('uxapi')).errors, (await L.state('uxapi2')).errors];
      return out;
    });

    h.eq('identity: ctx.id / page / demo and the manifest entry (copied and frozen: name, pages, phases)', [r.id, r.frozen],
      [['uxapi', 'guest', true, 'uxapi', 'beta', { ko: 'uxapi', en: 'uxapi' }, ['guest', 'kiosk', 'village', 'admin'], ['pre', 'live', 'after', 'anniversary'], 'function'], [true, true, true, true, true]]);
    h.eq('read-only: pushing into entry.pages throws, assigning entry.status / scope.id throws in strict code and changes nothing; scope has exactly id · entry · alive · add · guard · el · report · claim and shares the frozen entry', [r.mutate, r.scope],
      [['TypeError', 'TypeError', 'beta', 'TypeError', 'uxapi'], [['add', 'alive', 'claim', 'el', 'entry', 'guard', 'id', 'report'], true, true]]);
    h.eq('ctx.lang() follows the page language at every call; ctx.phase() is the current phase and the sticky phase event carries { phase, source }', [r.lang, r.phase], [['en', 'ko'], ['live', { phase: 'live', source: 'url' }]]);
    h.eq('at the moment a feature turns on: onSettings / onLive call at once (1 each), bus.on without replay hears nothing yet, bus.on with replay of a sticky event gets one, replay of a non-sticky event gets nothing', r.immediate, [1, 1, 0, 1, 0, 0]);
    h.eq('a feature hears its own "on" (feature:state { id, on, source }) after setup', r.ownOn, [['uxapi', true, 'admin']]);
    h.eq('before anything is saved: cfg() is the one shared frozen {} (same object every call), live() the frozen defaults, settings() the loader’s own frozen object with this feature’s flag', r.cfg0,
      ['{}', true, true, '{"cue":null,"cueSeq":0,"cueAt":null,"quiet":false,"poll":null,"msg":null,"updatedAt":null}', true, true, true]);
    h.eq('saveCfg(id) reaches ctx.cfg() only for this id (deep-frozen; other ids are in settings().cfg, not in cfg()); setLive reaches ctx.live()', [r.cfg1, r.live1],
      [['{"a":1,"nested":{"b":2}}', true, true, '{"z":9}', true], ['c1', 3, true]]);
    h.eq('every change reached the listeners: onSettings 1 + 3 changes (uxapi2 on, two saves) = 4 · onLive 1 + 1 = 2 · bus.on settings 3 · with replay 1 + 3 = 4', r.counts1, [4, 2, 3, 4]);
    h.eq('bus.last(sticky) is the very object ctx.settings() / ctx.live() return; a non-sticky event and an unknown event have none', r.last, [true, true, undefined, undefined]);
    h.eq('off() of onSettings stops that subscription only (twice is harmless): onSettings +0, onLive +1 after one more change each; the value itself is still current', r.counts2, [0, 1, 2]);
    h.eq('a callback that is not a function is a TypeError for onSettings / onLive / bus.on', r.badSub, ['TypeError', 'TypeError', 'TypeError']);
    h.eq('ctx.listen refuses a target that is not an EventTarget (null, undefined, a number, a string, a plain object, an object whose addEventListener is not a function, an array, a function) → bad-name; a callback that is not a function → TypeError; nothing was registered by those', [r.badListen, r.badListenFn],
      [Array(8).fill('bad-name'), ['TypeError', 'TypeError', 0]]);
    h.eq('ctx.listen on a real EventTarget: 1 live listener while it is on, the callback ran once, its off() (called twice) removed it → 0', r.goodListen, [1, 1, 'function', 0]);
    h.eq('bus.emit("uxapi:…") reaches other features with the very same payload object (no copy)', r.emitOk, [1, true]);
    h.eq('bus.emit refuses every core event, other ids’ events, look-alike names (uxapi2:, xuxapi:, UXAPI:, leading space), the bare id, empty and non-string types → bad-name', r.emitBad, Array(22).fill('bad-name'));
    h.eq('another feature cannot emit into uxapi’s namespace, but can emit its own (uxapi2:ok) — no extra delivery happened', r.emitOther, ['bad-name', null, 1]);
    h.eq('ctx.guard: runs fn with this and arguments, returns its value, is named "guarded" (the zero-trace spy relies on it), and refuses a non-function', r.guard, [['T', 1, 2, 3], 'guarded', 'TypeError', 'TypeError', 'TypeError']);
    h.eq('ctx.log prints "[f:<id>]" + arguments (demo mode)', r.log, [['[f:uxapi]', 'hello', '1', '[object Object]']]);
    h.eq('ctx.store() is the page’s own store instance', r.store, true);
    h.eq('off: the feature did not hear its own "off" (its subscriptions are released first) — the other feature did; both still saw the on events in order', r.fs,
      [[['uxapi', true, 'admin'], ['uxapi2', true, 'admin']], [['uxapi2', true, 'admin'], ['uxapi', false, 'admin']]]);
    h.eq('a dead ctx: bus.emit does nothing, onSettings / onLive return a function but never call back, the readers (lang, phase, settings, cfg) keep answering, 0 bus subscriptions remain', r.dead,
      [0, 'function', 'function', 0, 'string', 'live', true, 3, 0]);
    h.eq('nothing here counted as an error (console quiet, 0 errors for both features)', r.errors, [[], 0, 0]);
  });

  // ================================================================ ⑪ 이벤트 소유권 (02 §5) — 문서 표 ↔ EVENT_OWNERS ↔ 실제 emit 권한
  await h.step('event ownership (02 §5): the "기능 <id>" rows of the doc table are exactly EVENT_OWNERS; each owner can emit its events and nobody else can; every feature can emit its own "<id>:…" namespace and no other', async () => {
    const doc = fs.readFileSync(path.join(h.repo, 'docs/v4/02-contracts.md'), 'utf8');
    const rows = {};
    for (const line of doc.split('\n')) { const m = /^\|\s*`([a-z]+:[a-z]+)`\s*\|.*\|\s*기능 ([a-z_]+)\b/.exec(line); if (m) rows[m[1]] = m[2]; }
    const p = await lpage('ld-owners', { phase: 'live', ff: 'prereg,couple,bgm,poll,live,bingo,meter,uxother' });
    const r = await inPage(p, async A => {
      const L = window.__L, F = await import('/js/core/features.js'), bus = await import('/js/core/bus.js'), M = await import('/js/features/index.js'), out = {};
      const con = L.con();
      const ids = ['prereg', 'couple', 'bgm', 'poll', 'live', 'bingo', 'meter', 'uxother'], ctxs = {};
      await L.boot('guest', ids.map(id => L.entry(id, async ctx => { ctxs[id] = ctx; })));
      await L.until(async () => (await Promise.all(ids.map(id => L.state(id)))).every(s => s && s.on));
      out.allOn = (await Promise.all(ids.map(id => L.state(id)))).map(s => s.on);
      out.owners = Object.fromEntries(Object.entries(F.EVENT_OWNERS).sort());
      out.manifestHasOwners = Object.values(A.rows).every(o => M.FEATURES.some(f => f.id === o));
      const events = Object.keys(A.rows), seen = [];
      for (const e of events) bus.on(e, pl => seen.push(e + '>' + pl.from));
      out.matrix = events.map(e => ids.map(id => { try { ctxs[id].bus.emit(e, { from: id }); return 'ok'; } catch (x) { return x.code || x.name; } }));
      out.seen = seen.sort();
      out.ns = ids.map(id => ids.map(o => { try { ctxs[id].bus.emit(`${o}:custom`, {}); return 'ok'; } catch (x) { return x.code || x.name; } }));
      out.last = ['couple:sprites', 'bgm:state', 'live:cue', 'poll:result'].map(e => ctxs.uxother.bus.last(e)?.from ?? null);
      out.errors = con.error;
      return out;
    }, { rows });

    h.check('the doc table lists the eight events features emit (so this test is not vacuous)', Object.keys(rows).length === 8, JSON.stringify(rows));
    h.eq('EVENT_OWNERS in core/features.js is exactly the set of "기능 <id>" rows in 02 §5 (a new feature event needs the doc AND the loader changed together)', r.owners, Object.fromEntries(Object.entries(rows).sort()));
    h.eq('every owner named in the table is a feature of the manifest', r.manifestHasOwners, true);
    const ids = ['prereg', 'couple', 'bgm', 'poll', 'live', 'bingo', 'meter', 'uxother'];
    h.eq('all eight test features are on', r.allOn, Array(8).fill(true));
    h.eq('emit matrix: for each of the eight events, exactly the owner named in the doc may emit it — all other seven features get bad-name (rows = events in doc order, columns = prereg couple bgm poll live bingo meter uxother)',
      r.matrix, Object.keys(rows).map(e => ids.map(id => (rows[e] === id ? 'ok' : 'bad-name'))));
    h.eq('only the allowed emits were delivered, each with its owner as sender', r.seen, Object.keys(rows).map(e => `${e}>${rows[e]}`).sort());
    h.eq('namespaces: a feature can emit "<own id>:custom" and no other feature’s namespace (8 × 8)', r.ns, ids.map((id, i) => ids.map((o, j) => (i === j ? 'ok' : 'bad-name'))));
    h.eq('a sticky event emitted by its owner is what bus.last() shows other features', r.last, ['couple', 'bgm', 'live', null]);
    h.eq('no errors were counted or logged', r.errors, []);
  });

  // ================================================================ ⑫ 페이지 API (pageApi.forFeature) → ctx.guest / ctx.v / ctx.admin
  await h.step('pageApi.forFeature(scope): a fresh frozen scope per on-cycle (the old one is dead), guest / v / admin of the answer land on ctx (nothing else does), odd answers add nothing, a throwing forFeature is that feature’s setup failure only', async () => {
    const p = await lpage('ld-pageapi', { phase: 'live' });
    const r = await inPage(p, async () => {
      const L = window.__L, T = window.__T, F = await import('/js/core/features.js'), st = await import('/js/core/settings.js'), out = {};
      const con = L.con(); T.actor('admin');
      const answers = {
        uxp1: { guest: { id: 'g' } },
        uxp2: { guest: { id: 'g2' }, v: { id: 'v2' }, admin: { id: 'a2' }, foo: { id: 'ignored' } },
        uxp3: { guest: 0, v: null, admin: undefined, extra: 1 },
        uxp4: null, uxp5: undefined, uxp6: 'str', uxp7: 42, uxp8: [], uxp9: Promise.resolve({ guest: { id: 'late' } }),
      };
      const ids = [...Object.keys(answers), 'uxpbad', 'uxpok'];
      const calls = [], ctxs = {}, scopes = {};
      await F.bootFeatures('guest', {
        forFeature: scope => { calls.push([scope.id, scope.alive(), Object.isFrozen(scope), Object.keys(scope).sort().join(',')]); (scopes[scope.id] = scopes[scope.id] || []).push(scope); if (scope.id === 'uxpbad') throw new Error('forFeature boom'); return answers[scope.id]; },
        refreshTexts: () => {},
      }, { manifest: ids.map(id => L.entry(id, async ctx => { ctxs[id] = ctx; })) });
      for (const id of ids) await st.setFeature(id, true);
      await L.until(async () => (await Promise.all(ids.filter(i => i !== 'uxpbad').map(id => L.state(id)))).every(s => s.on));
      await L.until(async () => (await L.state('uxpbad')).tripped);
      const keys = id => ['guest', 'v', 'admin', 'foo', 'extra'].filter(k => k in ctxs[id]);
      out.keys = Object.fromEntries(Object.keys(answers).map(id => [id, keys(id)]));
      out.same = [ctxs.uxp1.guest === answers.uxp1.guest, ctxs.uxp2.guest === answers.uxp2.guest, ctxs.uxp2.v === answers.uxp2.v, ctxs.uxp2.admin === answers.uxp2.admin];
      out.calls = calls.filter(c => c[0] === 'uxp1');
      const bad = await L.state('uxpbad');
      out.bad = [bad.on, bad.tripped, bad.source, bad.lastError, bad.errors, 'uxpbad' in ctxs, (await L.state('uxpok')).on];
      // 다시 켜면 새 scope — 옛 scope 는 죽어 있음 (alive() = false)
      const first = scopes.uxp1[0];
      await st.setFeature('uxp1', false); await L.until(async () => !(await L.state('uxp1')).on);
      const deadAfterOff = first.alive();
      await st.setFeature('uxp1', true); await L.until(async () => (await L.state('uxp1')).on);
      out.cycles = [scopes.uxp1.length, scopes.uxp1[0] !== scopes.uxp1[1], deadAfterOff, first.alive(), scopes.uxp1[1].alive(), ctxs.uxp1 !== undefined];
      out.errors = con.error;
      return out;
    });
    h.eq('guest / v / admin of the answer are copied onto ctx when truthy (the same objects), in no other key; falsy parts, null / undefined / string / number / array / promise answers add nothing', r.keys,
      { uxp1: ['guest'], uxp2: ['guest', 'v', 'admin'], uxp3: [], uxp4: [], uxp5: [], uxp6: [], uxp7: [], uxp8: [], uxp9: [] });
    h.eq('…and they are the very objects the page returned', r.same, [true, true, true, true]);
    h.eq('forFeature receives a frozen scope of exactly { id, entry, alive, add, guard, el, report, claim }, still alive at that moment', r.calls, [['uxp1', true, true, 'add,alive,claim,el,entry,guard,id,report']]);
    h.eq('forFeature throwing = setup failure of that feature alone: off, tripped, source "tripped", error "setup: forFeature boom", one error; its setup never ran; another feature next to it is on', r.bad, [false, true, 'tripped', 'setup: forFeature boom', 1, false, true]);
    h.eq('every on-cycle gets its own scope: 2 cycles → 2 different scopes; the old one is dead after off (and stays dead), the new one is alive', r.cycles, [2, true, false, false, true, true]);
    h.eq('the only console error is the deliberate one', r.errors, ['[f:uxpbad] setup: forFeature boom']);
  });

  // ================================================================ ⑬ 페이즈 핫 토글 (02 §2.2 2번 · 03 §1)
  await h.step('phase hot toggle: an admin phase override or the passing clock switches non-admin features live (a feature whose phases still include the new phase is not touched); ?phase= beats the override; the admin page ignores phases', async () => {
    // ① 관리자 비상 강제 (주소에 ?phase= 없음). 처음에 'after' 로 눌러 시작점을 고정 (시계에 의존하지 않음)
    const p = await lpage('ld-phase');
    const r = await inPage(p, async () => {
      const L = window.__L, T = window.__T, st = await import('/js/core/settings.js'), ph = await import('/js/core/phase.js'), out = {};
      const con = L.con(); T.actor('admin');
      const ev = []; (await import('/js/core/bus.js')).on('feature:state', e => ev.push(`${e.id}:${e.on ? 'on' : 'off'}:${e.source}`));
      const Rl = L.rec2('uxphl'), Rb = L.rec2('uxphb');
      await L.boot('guest', [
        L.entry('uxphl', async ctx => { Rl.setups++; Rl.ctx = ctx; }, { phases: ['live'] }),
        L.entry('uxphb', async ctx => { Rb.setups++; Rb.ctx = ctx; }, { phases: ['pre', 'live'] }),
      ]);
      await st.setPhaseOverride('after'); await L.until(() => ph.currentPhase() === 'after');
      await st.setFeature('uxphl', true); await st.setFeature('uxphb', true); await L.sleep(80);
      out.start = [ph.currentPhase(), (await L.state('uxphl')).on, (await L.state('uxphl')).source, (await L.state('uxphb')).on, (await L.state('uxphb')).source, ev.splice(0)];
      out.steps = [];
      for (const [phase, wl, wb] of [['pre', false, true], ['live', true, true], ['after', false, false], ['anniversary', false, false], ['live', true, true], ['pre', false, true]]) {
        await st.setPhaseOverride(phase);
        await L.until(async () => ph.currentPhase() === phase && (await L.state('uxphl')).on === wl && (await L.state('uxphb')).on === wb);
        await L.sleep(40);
        const a = await L.state('uxphl'), b = await L.state('uxphb');
        out.steps.push([phase, a.on, a.source, b.on, b.source, ev.splice(0).sort(), Rb.ctx.phase(), Rb.ctx.phase() === ph.currentPhase()]);
      }
      out.setups = [Rl.setups, Rb.setups];
      // 'auto' = 시계로 돌아감: 판정은 phaseAt(지금) 과 같아야 함
      await st.setPhaseOverride('auto'); await L.sleep(120);
      const clock = ph.phaseAt(Date.now());
      out.auto = [ph.currentPhase() === clock, (await L.state('uxphl')).on === (clock === 'live'), (await L.state('uxphb')).on === (clock === 'pre' || clock === 'live')];
      out.errors = [con.error, (await L.state('uxphl')).errors, (await L.state('uxphb')).errors];
      return out;
    });
    h.eq('start (override "after", flags on): both features are off, and the reason is the phase — not a flag', r.start, ['after', false, 'phase', false, 'phase', []]);
    h.eq('walking the phases pre → live → after → anniversary → live → pre: the live-only feature follows live; the pre+live feature stays on across pre → live and goes with after; nothing happens where nothing changes (anniversary); every event carries its reason (admin = flag decided, phase = the phase turned it off); ctx.phase() agrees', r.steps, [
      ['pre', false, 'phase', true, 'admin', ['uxphb:on:admin'], 'pre', true],
      ['live', true, 'admin', true, 'admin', ['uxphl:on:admin'], 'live', true],
      ['after', false, 'phase', false, 'phase', ['uxphb:off:phase', 'uxphl:off:phase'], 'after', true],
      ['anniversary', false, 'phase', false, 'phase', [], 'anniversary', true],
      ['live', true, 'admin', true, 'admin', ['uxphb:on:admin', 'uxphl:on:admin'], 'live', true],
      ['pre', false, 'phase', true, 'admin', ['uxphl:off:phase'], 'pre', true]]);
    h.eq('a phase change that keeps a feature enabled does not restart it: setups 2 (live twice) and 2 (pre, then live again after "after")', r.setups, [2, 2]);
    h.eq('override "auto" hands the decision back to the clock (phaseAt(now)) and both features follow it', r.auto, [true, true, true]);
    h.eq('no errors', r.errors, [[], 0, 0]);

    // ② ?phase= 는 관리자 비상 강제보다 위
    const pu = await lpage('ld-phase-url', { phase: 'pre' });
    const u = await inPage(pu, async () => {
      const L = window.__L, T = window.__T, st = await import('/js/core/settings.js'), ph = await import('/js/core/phase.js'), out = {};
      T.actor('admin');
      await L.boot('guest', [L.entry('uxphl', async () => {}, { phases: ['live'] })]);
      await st.setFeature('uxphl', true); await st.setPhaseOverride('live'); await L.sleep(150);
      out.live = [ph.currentPhase(), (await L.state('uxphl')).on, (await L.state('uxphl')).source];
      await st.setPhaseOverride('after'); await L.sleep(150);
      out.after = [ph.currentPhase(), (await L.state('uxphl')).on];
      return out;
    });
    h.eq('?phase=pre in the address: an admin override to live or after changes nothing — the page stays in "pre" and the live-only feature stays off (reason: phase)', u, { live: ['pre', false, 'phase'], after: ['pre', false] });

    // ③ 관리자 페이지는 페이즈를 보지 않음
    const pa = await lpage('ld-phase-admin');
    const a = await inPage(pa, async () => {
      const L = window.__L, T = window.__T, st = await import('/js/core/settings.js'), ph = await import('/js/core/phase.js'), out = {};
      T.actor('admin');
      const R = L.rec2('uxpha');
      await L.boot('admin', [L.entry('uxpha', async () => { R.setups++; }, { phases: ['live'] })]);
      await st.setPhaseOverride('after'); await st.setFeature('uxpha', true); await L.until(async () => (await L.state('uxpha')).on);
      out.after = [ph.currentPhase(), (await L.state('uxpha')).on, (await L.state('uxpha')).source];
      await st.setPhaseOverride('live'); await L.sleep(100); await st.setPhaseOverride('pre'); await L.sleep(100);
      out.stays = [(await L.state('uxpha')).on, R.setups];
      return out;
    });
    h.eq('the admin page ignores phases: a live-only feature is on in "after" (flag decides), and later phase changes never restart or stop it', a, { after: ['after', true, 'admin'], stays: [true, 1] });

    // ④ 시간이 흘러서: 결혼식 날 아침 5:59:40 → 06:00 을 지나 live → 다음날 06:00 을 지나 after (가짜 시계, 30 초마다 다시 계산)
    const pc = await h.page('desktop', { tag: 'ld-phase-clock' });
    await pc.route(UNIT_PAGE, r => r.fulfill({ contentType: 'text/html', body: BLANK }));
    await pc.addInitScript(HELPERS);
    await pc.clock.install({ time: new Date('2027-04-10T05:59:40-04:00') });
    await pc.goto(h.url('__units.html', { phase: null }));
    await pc.evaluate(LH);
    await inPage(pc, async () => {
      const L = window.__L, m = await import('/js/core/docdb.js'); await L.ready;
      m.registerBackend('demo', () => ({
        kind: 'demo', admin: () => false, read: async () => null, list: async () => [], write: async () => {}, watchList: () => () => {},
        watchDoc: (path, fn) => { const t = setTimeout(() => fn(path === 'app/settings' ? { id: 'settings', features: { uxtime: true }, safe: false, phase: 'auto', cfg: {}, updatedAt: 1 } : null), 0); return () => clearTimeout(t); },
      }));
      window.__t = { setups: 0, cleanups: 0 };
      L.bootNow('guest', [L.entry('uxtime', async ctx => { window.__t.setups++; ctx.onCleanup(() => { window.__t.cleanups++; }); }, { phases: ['live'] })]);
    });
    const probeT = () => inPage(pc, async () => { const s = await window.__L.state('uxtime'); return [(await import('/js/core/phase.js')).currentPhase(), s?.on, s?.source, window.__t.setups, window.__t.cleanups]; });
    await pc.clock.runFor(200); const c0 = await probeT();                        // 05:59:40 — 아직 pre
    await pc.clock.runFor(31000); await pc.clock.runFor(100); const c1 = await probeT();   // 06:00:11 — 30 초 점검이 live 를 알아챔
    await pc.clock.fastForward(24 * 3600 * 1000); await pc.clock.runFor(100); const c2 = await probeT();   // 다음날 06:00:11 — after
    h.eq('the wedding morning arrives by itself (fake clock 05:59:40 → 06:00:11): the live-only feature is off in "pre", comes on without anybody touching anything, and goes off again a day later in "after"', [c0, c1, c2],
      [['pre', false, 'phase', 0, 0], ['live', true, 'admin', 1, 0], ['after', false, 'phase', 1, 1]]);
  });

  // ================================================================ ⑭ 관리자 → 다른 탭 · tests/lib/v4.mjs 도우미 전수
  await h.step('cross-tab hot toggle through the tests/lib/v4.mjs helpers: an admin page on the same device flips a flag, safe mode, the phase, a cfg and a live cue — the loader in the other tab follows, leaves no trace, and every helper does what its comment promises', async () => {
    // ---- 순수 도우미: ?ff= 조각
    h.eq('on / off / ff build the pieces of ?ff= (empty parts are dropped)', [on('poll'), on('poll', 'bingo'), on(), off('bgm'), off('a', 'b'), ff(on('poll'), off('bgm')), ff(), ff('', null, undefined, 'x')], ['poll', 'poll,bingo', '', '-bgm', '-a,-b', 'poll,-bgm', '', 'x']);
    h.eq('h.url puts them in the address as ?ff= (and the loader’s parseFF reads them back)', new URL(h.url('index.html', { ff: ff(on('poll'), off('bgm')) })).searchParams.get('ff'), 'poll,-bgm');

    // ---- 부팅 전 · bootStub (진짜 매니페스트 + 가짜 페이지 API)
    const p0 = await lpage('ld-x-blank');
    h.eq('featureStates / featureState before any boot: [] and null', [await featureStates(p0), await featureState(p0, '_selftest')], [[], null]);
    for (const [pageName, key] of [['guest', 'guest'], ['village', 'v'], ['admin', 'admin']]) {
      const pb = await lpage('ld-x-stub-' + pageName, { phase: 'live', ff: on('_selftest') });
      const onIds = await bootStub(h, pb, pageName);
      const st = await featureState(pb, '_selftest');
      const info = await pb.evaluate(() => ({ stub: { refresh: window.__stub.refresh, page: window.__stub.pageName, scopes: Object.keys(window.__stub.scopes) }, badge: document.querySelector('[data-st="badge"]')?.dataset.page }));
      h.eq(`bootStub(${pageName}): the real _selftest comes on by ?ff=_selftest and gets the fake page API for "${key}"; refreshTexts was called once (its ctx.texts); every counter shows something running`,
        [onIds, st.on, st.source, st.tripped, info.stub, info.badge, st.live.listeners > 0 && st.live.timers > 0 && st.live.watchers > 0 && st.live.bus > 0],
        [['_selftest'], true, 'url', false, { refresh: 1, page: pageName, scopes: ['_selftest'] }, pageName, true]);
    }

    // ---- 같은 기기의 두 탭: 하객 탭(로더) + 관리자 탭 (진짜 admin.html)
    const ctx = await h.context('desktop');
    const p1 = await lpage('ld-xtab', {}, ctx);
    await inPage(p1, async () => {
      const L = window.__L;
      const mk = (id, o) => L.entry(id, async c => { const R = L.rec2(id); R.setups++; R.ctx = c; document.body.appendChild(c.el('div', { text: id, attrs: { 'data-st': id } })); c.rootClass('on'); }, o);
      await L.boot('guest', [mk('uxc1', {}), mk('uxc2', { liveSafe: true }), mk('uxc3', { phases: ['live'] })]);
    });
    const admin = await adminPage(h, ctx, { tag: 'ld-xtab-admin' });
    const settle = async (id, want, ms = 8000) => {              // 다른 탭의 효과는 BroadcastChannel 로 곧 도착 — 기다림
      const t0 = Date.now();
      for (;;) { const s = await featureState(p1, id); if (s && want(s)) return s; if (Date.now() - t0 > ms) return s; await h.wait(60); }
    };
    const brief = s => (s ? [s.on, s.source] : null);
    const clockPhase = await p1.evaluate(async () => (await import('/js/core/phase.js')).phaseAt(Date.now()));
    h.eq('all three start off with nothing saved: beta — except the live-only one, which the phase (the clock’s, no ?phase= in this tab) rules out first unless it happens to be the wedding day', (await featureStates(p1)).map(s => [s.id, s.on, s.source]),
      [['uxc1', false, 'beta'], ['uxc2', false, 'beta'], ['uxc3', false, clockPhase === 'live' ? 'beta' : 'phase']]);

    // 플래그
    await setFlag(h, admin, 'uxc1', true);
    h.eq('setFlag(true) on the admin page → the other tab turns it on (source admin) and it has put things on the page', [brief(await settle('uxc1', s => s.on)), await footprint(p1, 'uxc1')], [[true, 'admin'], { nodes: 1, links: 0, styles: 1 }]);
    const dirty = []; const fakeH = { check: (label, ok, detail) => { dirty.push([label, ok, detail]); return ok; } };
    const verdictOn = await expectClean(fakeH, p1, 'uxc1', 'while on');
    h.eq('expectClean reports a feature that is still on as NOT clean — with the numbers in the detail', [verdictOn, dirty[0][1], JSON.parse(dirty[0][2])], [false, false, { nodes: 1, links: 0, styles: 1 }]);
    await setFlag(h, admin, 'uxc1', false);
    h.eq('setFlag(false) → off (source admin)', brief(await settle('uxc1', s => !s.on && s.source === 'admin')), [false, 'admin']);
    await expectClean(h, p1, 'uxc1', 'cross-tab off');                                    // 기록되는 진짜 검사
    h.eq('footprint of an off feature is all zeros', await footprint(p1, 'uxc1'), { nodes: 0, links: 0, styles: 0 });
    await setFlag(h, admin, 'uxc1', null);
    h.eq('setFlag(null) → back to the manifest default (beta → off, source beta)', brief(await settle('uxc1', s => s.source === 'beta')), [false, 'beta']);

    // 안전 모드 (데모에서는 ?ff= 가 없을 때만 의미 있음: 관리자 플래그만으로 켠 기능)
    await setFlag(h, admin, 'uxc1', true); await setFlag(h, admin, 'uxc2', true);
    await settle('uxc1', s => s.on); await settle('uxc2', s => s.on);
    await setSafe(h, admin, true);
    const sf = [brief(await settle('uxc1', s => !s.on)), brief(await settle('uxc2', s => s.source === 'admin'))];
    await setSafe(h, admin, false);
    const sf2 = [brief(await settle('uxc1', s => s.on)), brief(await featureState(p1, 'uxc2'))];
    h.eq('setSafe(true): the feature that is not liveSafe goes off (source safe), the liveSafe one stays on; setSafe(false) brings it back', [sf, sf2], [[[false, 'safe'], [true, 'admin']], [[true, 'admin'], [true, 'admin']]]);

    // 페이즈 (이 탭 주소에는 ?phase= 가 없음)
    await setFlag(h, admin, 'uxc3', true);
    await setPhase(h, admin, 'pre');   const ph1 = brief(await settle('uxc3', s => s.source === 'phase'));
    await setPhase(h, admin, 'live');  const ph2 = brief(await settle('uxc3', s => s.on));
    await setPhase(h, admin, 'after'); const ph3 = brief(await settle('uxc3', s => !s.on));
    await setPhase(h, admin, 'auto');  await h.wait(300);
    const clockLive = await p1.evaluate(async () => (await import('/js/core/phase.js')).phaseAt(Date.now()) === 'live');
    h.eq('setPhase pre → live → after → auto: the live-only feature follows (off/phase, on/admin, off/phase); on "auto" it follows the clock', [ph1, ph2, ph3, (await featureState(p1, 'uxc3')).on === clockLive], [[false, 'phase'], [true, 'admin'], [false, 'phase'], true]);

    // cfg · live
    await setCfg(h, admin, 'uxc1', { k: 1 }); await setCfg(h, admin, 'uxc1', { j: 2 });
    const cfg = await (async () => { for (let i = 0; i < 100; i++) { const v = await p1.evaluate(() => JSON.stringify(window.__sink.uxc1.ctx.cfg())); if (v.includes('"j"')) return v; await h.wait(60); } return null; })();
    h.eq('setCfg merges into the feature’s own cfg and reaches ctx.cfg() in the other tab', cfg, '{"k":1,"j":2}');
    await setLive(h, admin, { cue: 'x1', cueSeq: 2, cueAt: { $sv: 'ts' } });
    const lv = await (async () => { for (let i = 0; i < 100; i++) { const v = await p1.evaluate(() => { const l = window.__sink.uxc1.ctx.live(); return [l.cue, l.cueSeq, typeof l.cueAt]; }); if (v[0] === 'x1') return v; await h.wait(60); } return null; })();
    h.eq('setLive reaches ctx.live() in the other tab — a { $sv: "ts" } value becomes a server time', lv, ['x1', 2, 'number']);

    // 데이터 도우미 (같은 기기의 같은 데모 세계 — 관리자는 쓰고, 하객 탭은 읽을 수만 있음)
    const doc = { src: 'ko', ko: '가', en: 'a', engine: 'e', updatedAt: { $sv: 'ts' } };
    const w1 = await dbSet(h, admin, 'translations/x1', doc);
    const w2 = await dbSet(h, p1, 'translations/x2', doc);
    const w3 = await dbSet(h, admin, 'translations/x3', { ...doc, src: 'xx' });
    const w4 = await dbSet(h, admin, 'translations/x1', { en: 'b', updatedAt: { $sv: 'ts' } }, { merge: true });
    const g1 = await dbGet(h, p1, 'translations/x1'), g0 = await dbGet(h, p1, 'translations/nothing');
    await dbSet(h, admin, 'translations/x4', { ...doc, src: 'en', ko: '나', en: 'n' });
    const c1 = await dbCol(h, p1, 'translations'), c2 = await dbCol(h, p1, 'translations', { where: [['src', '==', 'ko']], limit: 5 }), c3 = await dbCol(h, p1, 'translations', { orderBy: ['updatedAt', 'desc'], limit: 1 });
    h.eq('dbSet: { ok: true } for the admin tab, { ok: false, error } for the guest tab (permission-denied) and for a bad value (invalid-argument); merge works', [w1, w2, w3, w4], [{ ok: true }, { ok: false, error: 'permission-denied' }, { ok: false, error: 'invalid-argument' }, { ok: true }]);
    h.eq('dbGet returns { id, …fields } (ts as a number) or null; dbCol supports where / orderBy / limit', [g1.id, g1.ko, g1.en, typeof g1.updatedAt, g0, c1.length, c2.map(d => d.id), c3.map(d => d.id)], ['x1', '가', 'b', 'number', null, 2, ['x1'], ['x4']]);

    // 하객 코드 도우미
    const gc = await guestsWithCodes(h, p1, 3);
    h.eq('guestsWithCodes adds demo guests and returns { id, code } with the 4-character printed code (letters 0 O 1 I L never appear)', [gc.length, new Set(gc.map(g => g.id)).size, gc.every(g => /^[2-9A-HJKMNP-Z]{4}$/.test(g.code))], [3, 3, true]);
    const gc2 = await guestsWithCodes(h, p1, 1, 'VIP');
    h.eq('…with a name prefix and the same code for the same id every time', [gc2.length, await p1.evaluate(async id => (await import('/js/core/ui.js')).guestCode(id), gc2[0].id) === gc2[0].code], [1, true]);

    // 끝: 이 탭의 모든 기능이 정리됨
    await setFlag(h, admin, 'uxc1', false); await setFlag(h, admin, 'uxc2', false); await setFlag(h, admin, 'uxc3', false);
    await settle('uxc1', s => !s.on); await settle('uxc2', s => !s.on); await settle('uxc3', s => !s.on);
    for (const id of ['uxc1', 'uxc2', 'uxc3']) await expectClean(h, p1, id, 'S3 end of the cross-tab run');
  });
};

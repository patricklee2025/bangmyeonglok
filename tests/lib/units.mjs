// ============================================================
//  tests/lib/units.mjs — "빈 페이지 + 진짜 모듈" 단위 테스트 도구 (core-units · core-units-loader 가 함께 씁니다)
//    inPage(page, fn, arg)   함수를 페이지 안에서 실행 (바깥 변수를 쓰지 않는 자기완결 함수만, 인자는 JSON)
//    unitTools(h)            { open(page, params), unitPage(tag, ctx?, params?) } — /__units.html 은 서버에 없는 가짜 경로를 빈 문서로 응답
//    HELPERS                 페이지마다 주입 → window.__T (데모 IndexedDB 조작 · 규칙 표 실행 · 대기)
// ============================================================

/** 함수를 페이지 안에서 실행 (외부 변수를 쓰지 않는 자기완결 함수만). 인자는 JSON 으로 전달. */
export const inPage = (page, fn, arg) => page.evaluate(([src, a]) => (0, eval)('(' + src + ')')(a), [fn.toString(), arg ?? null]);

export const UNIT_PAGE = /\/__units\.html(\?|$)/;
export const BLANK = '<!doctype html><meta charset="utf-8"><title>units</title><body></body>';

/**
 * 2단계 페이지마다 주입하는 도우미 → window.__T (데모 IndexedDB 직접 조작 · 규칙 표 케이스 실행 · 짧은 대기).
 * addInitScript 는 함수의 "소스"를 넘기므로 바깥 변수를 쓰지 않는 자기완결 함수여야 합니다.
 */
export const HELPERS = () => {
  const T = (window.__T = {});
  const OLD_MS = Date.parse('2020-01-01T00:00:00Z');
  const open = () => new Promise((res, rej) => {
    const r = indexedDB.open('wgb-demo', 1);
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains('kv')) r.result.createObjectStore('kv'); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  const tx = async fn => {
    const db = await open();
    try {
      return await new Promise((res, rej) => {
        const t = db.transaction('kv', 'readwrite'), req = fn(t.objectStore('kv'));
        t.oncomplete = () => res(req ? req.result : undefined); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
      });
    } finally { db.close(); }
  };
  T.clear = () => tx(st => st.clear());
  T.put = entries => tx(st => { for (const [k, v] of entries) st.put(v, k); });
  T.get = k => tx(st => st.get(k));
  T.keys = prefix => tx(st => st.getAllKeys(IDBKeyRange.bound(prefix, prefix + '￿')));
  T.sleep = ms => new Promise(r => setTimeout(r, ms));
  T.until = async (cond, ms = 3000) => { const t0 = performance.now(); while (!cond()) { if (performance.now() - t0 > ms) return false; await T.sleep(10); } return true; };
  /** a promise → 'resolved' | the error's code (docdb errors are always rejections, never synchronous throws) */
  T.code = p => p.then(() => 'resolved', e => e?.code || String(e?.message || e));
  T.codeSync = fn => { try { fn(); return 'no throw'; } catch (e) { return e?.code || String(e?.message || e); } };
  T.guestRows = ids => ids.map(id => ({ id, name: 'Guest ' + id, side: 'both', message: '', avatar: {}, hidden: false, hasPhoto: false, createdAt: Date.now() }));
  /** a clean demo world: no v4 documents, the given guests (ids), nobody is admin */
  T.reset = async (guests = []) => {
    await T.clear();
    localStorage.removeItem('wgb_demo_snaps'); localStorage.removeItem('wgb_demo_pulse');
    localStorage.setItem('wgb_demo_guests', JSON.stringify(T.guestRows(guests)));
    document.body.classList.remove('admin');
  };
  T.actor = a => document.body.classList.toggle('admin', a === 'admin');
  T.db = async () => (await import('/js/core/docdb.js')).getDB();
  // ---- the case table (tests/rules/cases.mjs) ----
  T.typed = v => (Array.isArray(v) ? v.map(T.typed) : v && typeof v === 'object'
    ? ('@at' in v ? { $ts: v['@at'] === 'now' ? Date.now() : OLD_MS } : Object.fromEntries(Object.entries(v).map(([k, x]) => [k, T.typed(x)]))) : v);
  T.data = (v, db) => (v === '@ts' ? db.ts() : v === '@client' ? Date.now() : Array.isArray(v) ? v.map(x => T.data(x, db))
    : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, T.data(x, db)])) : v);
  T.seed = list => T.put((list || []).map(s => ['doc:' + s.path, T.typed(s.data)]));
  T.run = async (c, db) => {
    const data = c.data == null ? null : T.data(c.data, db);
    try {
      if (c.op === 'create') await db.doc(c.path).create(data);
      else if (c.op === 'set') await db.doc(c.path).set(data);
      else if (c.op === 'update') await db.doc(c.path).update(data);
      else if (c.op === 'delete') await db.doc(c.path).delete();
      else if (c.op === 'get') await db.doc(c.path).get();
      else if (c.op === 'list') await db.col(c.path).get();
      else return { ok: false, code: 'unsupported-op', msg: c.op };
      return { ok: true };
    } catch (e) { return { ok: false, code: e?.code ?? null, msg: String(e?.message ?? e).slice(0, 200) }; }
  };
  T.matrix = async cases => {
    const db = await T.db(), out = [];
    for (const c of cases) { await T.reset(c.guests); await T.seed(c.seed); T.actor(c.actor); out.push({ id: c.id, ...(await T.run(c, db)) }); }
    T.actor('admin');
    return out;
  };
};

/**
 * 빈 페이지를 만드는 도구. h.url 이 demo=1 & phase=live 를 붙이지만, 단위 테스트는 기본으로 phase 를 빼서 시계를 따릅니다 (open 의 params 로 바꿈).
 */
export function unitTools(h) {
  const open = async (page, params = {}) => { await page.goto(h.url('__units.html', { phase: null, ...params })); };
  /** 빈 페이지 + __T 도우미. ctx 를 주면 그 컨텍스트(= 같은 기기)의 두 번째 탭이 됩니다. */
  const unitPage = async (tag, ctx, params = {}) => {
    const p = await h.page(ctx || 'desktop', { tag });
    await p.route(UNIT_PAGE, r => r.fulfill({ contentType: 'text/html', body: BLANK }));
    await p.addInitScript(HELPERS);
    await open(p, params);
    return p;
  };
  return { open, unitPage };
}

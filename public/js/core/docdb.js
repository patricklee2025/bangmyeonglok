// ============================================================
//  core/docdb.js — the document database features use (docs/v4/02-contracts.md §9 · 03-data-and-rules.md §3)
//
//  One API, two backends that share the page's store instance (store.backend):
//    firebase : Firestore (the same instance as v3.2)          demo : IndexedDB `wgb-demo`/`kv`, keys "doc:<path>" (+ BroadcastChannel `wgb-docdb`)
//  Paths must be declared in core/schema.js (the JS mirror of firestore.rules). Every write is checked against it first:
//    demo     : the whole rule set, incl. who-may-write, guest existence, rate limits  → the demo answers like the real server
//    firebase : the shape rules only (keys, types, lengths, ts() fields)               → the server stays the authority
//  Errors carry `e.code`: permission-denied · already-exists · not-found · unknown-path · invalid-argument · unavailable · archived
//  Values: timestamps are plain ms numbers when read; write them with ctx.db.ts() (server time). Documents read back as { id, ...fields }.
//  Queries must work WITHOUT a composite index (one field only, or equality filters only) — otherwise production answers
//  `failed-precondition`; the demo refuses such a query too, so you find out in the demo.
// ============================================================
import { getStore, storeKind } from '../store.js';
import { check, matchPath, matchCollection, serverTs, increment, isServerTs, isIncrement, isStoredTs } from './schema.js';

export const ts = serverTs;
export const inc = increment;

// ---- errors ---------------------------------------------------------------------------------------
export const fail = (code, message, extra) => Object.assign(new Error(message), { code, docdb: true }, extra);
const FS_CODES = {
  'permission-denied': 'permission-denied', unauthenticated: 'permission-denied', 'already-exists': 'already-exists', 'not-found': 'not-found',
  'invalid-argument': 'invalid-argument', unavailable: 'unavailable', 'deadline-exceeded': 'unavailable', cancelled: 'unavailable',
  'resource-exhausted': 'unavailable', 'failed-precondition': 'invalid-argument' /* e.g. a query that needs an index */,
  aborted: 'unavailable', internal: 'unavailable', unknown: 'unavailable',
};
/** our own errors pass through; Firestore errors get one of the contract's codes (the original stays in `cause`); anything else is a bug and is left alone */
const toDocError = (e, path) => {
  if (!e || e.docdb) return e;
  const code = FS_CODES[String(e.code || '').replace(/^firestore\//, '')];
  return code ? fail(code, (e.message || code) + (path ? ` (${path})` : ''), { cause: e }) : e;
};
const violation = (r, path) => fail(r.code, `${r.reason} (${path})`, { path, reason: r.reason });

// ---- values ----------------------------------------------------------------------------------------
const isPlain = v => v !== null && typeof v === 'object' && !Array.isArray(v) && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
const isMapVal = v => isPlain(v) && !('$sv' in v) && !('$ts' in v);
const RESERVED_KEY = /^__.*__$/;

/** Validate user data and copy it (markers from ctx.db.ts()/inc() stay in place). Throws invalid-argument. */
export function encode(v, where = 'data', depth = 0, inList = false) {
  if (depth > 20) throw fail('invalid-argument', `${where} is nested deeper than 20 levels`);
  if (v === undefined) throw fail('invalid-argument', `${where} is undefined`);
  if (v === null || typeof v === 'boolean' || typeof v === 'string') return v;
  if (typeof v === 'number') { if (!Number.isFinite(v)) throw fail('invalid-argument', `${where} is not a finite number`); return v; }
  if (isServerTs(v)) { if (inList) throw fail('invalid-argument', `${where}: ctx.db.ts() cannot be inside a list`); return v; }
  if (isIncrement(v)) {
    if (inList) throw fail('invalid-argument', `${where}: ctx.db.inc() cannot be inside a list`);
    if (!Number.isFinite(v.n)) throw fail('invalid-argument', `${where}: ctx.db.inc(n) needs a finite number`);
    return v;
  }
  if (Array.isArray(v)) return v.map((x, i) => encode(x, `${where}[${i}]`, depth + 1, true));
  if (v instanceof Date) throw fail('invalid-argument', `${where} is a Date — use ctx.db.ts() for server time`);
  if (isPlain(v)) {
    if ('$sv' in v || '$ts' in v) throw fail('invalid-argument', `${where} uses a reserved key ($sv / $ts)`);
    const out = {};
    for (const k of Object.keys(v)) {
      if (k === '' || k === '__proto__' || RESERVED_KEY.test(k)) throw fail('invalid-argument', `${where}: "${k}" is not a valid field name`);
      out[k] = encode(v[k], `${where}.${k}`, depth + 1);
    }
    return out;
  }
  throw fail('invalid-argument', `${where} is a ${typeof v === 'object' ? (v.constructor?.name || 'object') : typeof v} — only plain data can be stored`);
}

/** stored form → what features see: { $ts: ms } → ms (also Firestore Timestamps) */
const decode = v => {
  if (Array.isArray(v)) return v.map(decode);
  if (v === null || typeof v !== 'object') return v;
  if (isStoredTs(v)) return v.$ts;
  if (typeof v.toMillis === 'function') return v.toMillis();   // Firestore Timestamp
  const out = {};
  for (const k of Object.keys(v)) out[k] = decode(v[k]);
  return out;
};
const withId = (id, data) => { const out = { id }; for (const k of Object.keys(data)) if (k !== 'id') out[k] = data[k]; return out; };
const sameValue = (a, b) => {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every(k => sameValue(a[k], b[k]));
};

const ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
/** Firestore-style auto id: 20 letters/digits (also a valid thanks token) */
export function newId() { const a = new Uint8Array(20); crypto.getRandomValues(a); return Array.from(a, b => ALNUM[b % 62]).join(''); }

// ---- queries (shared by the demo backend and the archive backend) -------------------------------
const WHERE_OPS = ['==', 'in', '>', '>=', '<', '<='];
const field = (d, path) => { let v = d; for (const k of path.split('.')) { if (v === null || typeof v !== 'object' || !Object.prototype.hasOwnProperty.call(v, k)) return undefined; v = v[k]; } return v; };
const rank = v => (v === null ? 0 : typeof v === 'boolean' ? 1 : typeof v === 'number' ? 2 : typeof v === 'string' ? 3 : Array.isArray(v) ? 4 : 5);
const cmp = (a, b) => (rank(a) !== rank(b) ? rank(a) - rank(b) : a < b ? -1 : a > b ? 1 : 0);
const holds = (v, op, want) => {
  if (v === undefined) return false;
  if (op === '==') return sameValue(v, want);
  if (op === 'in') return want.some(w => sameValue(v, w));
  if (rank(v) !== rank(want)) return false;   // Firestore: inequality only compares values of the same type
  const c = cmp(v, want);
  return op === '>' ? c > 0 : op === '>=' ? c >= 0 : op === '<' ? c < 0 : c <= 0;
};
/**
 * where → orderBy → limit over already-decoded docs ({ id, ... }) with Firestore's semantics: a missing field never matches, an orderBy field
 * must exist, ties are broken by document id (in the direction of the orderBy), and a range filter (> >= < <=) without an orderBy
 * orders by the filtered field, ascending — exactly what production does.
 */
export function applyQuery(docs, q) {
  let out = docs.filter(d => q.where.every(([f, op, val]) => holds(field(d, f), op, val)));
  const ranged = q.where.find(w => w[1] !== '==' && w[1] !== 'in');
  const [of, dir] = q.order[0] || (ranged ? [ranged[0], 'asc'] : [null, 'asc']);
  if (of !== null) out = out.filter(d => field(d, of) !== undefined);
  const sign = dir === 'desc' ? -1 : 1;
  out = out.slice().sort((a, b) => (of !== null ? sign * cmp(field(a, of), field(b, of)) : 0) || sign * (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return q.limit ? out.slice(0, q.limit) : out;
}
/** Refuse queries that would need a composite index in production (see the file header) */
export function assertIndexable(q, name) {
  const fields = new Set([...q.where.map(w => w[0]), ...q.order.map(o => o[0])]);
  const ranged = q.where.some(w => w[1] !== '==' && w[1] !== 'in');
  if (q.order.length > 1 || ((ranged || q.order.length) && fields.size > 1)) {
    throw fail('invalid-argument', `${name}: this query needs a composite index (filters on different fields, or more than one orderBy) — filter in JS instead`);
  }
}
const newQuery = () => ({ where: [], order: [], limit: 0 });

// ---- the demo backend: IndexedDB `wgb-demo`/`kv` (the same database store.js's demo uses; key space "doc:") ------------------------
const DOC = 'doc:';
function demoImpl(store) {
  const be = store.backend;
  let dbP = null;
  const openIdb = () => dbP || (dbP = new Promise((res, rej) => {
    const r = indexedDB.open('wgb-demo', 1);
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains('kv')) r.result.createObjectStore('kv'); };
    r.onsuccess = () => { const db = r.result; db.onversionchange = () => { db.close(); dbP = null; }; res(db); };
    r.onerror = () => { dbP = null; rej(r.error); };
  }));
  const done = t => new Promise((res, rej) => { t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('IndexedDB transaction aborted')); });
  const idbGet = async key => { const t = (await openIdb()).transaction('kv', 'readonly'); const r = t.objectStore('kv').get(key); await done(t); return r.result ?? null; };
  const idbScan = async prefix => {
    const t = (await openIdb()).transaction('kv', 'readonly'), st = t.objectStore('kv'), range = IDBKeyRange.bound(prefix, prefix + '￿');
    const ks = st.getAllKeys(range), vs = st.getAll(range);
    await done(t);
    return ks.result.map((k, i) => [k, vs.result[i]]);
  };
  const idbPut = async entries => {   // Map<key, value | null>  (null = delete) — ONE transaction
    const t = (await openIdb()).transaction('kv', 'readwrite'), st = t.objectStore('kv');
    for (const [k, v] of entries) { if (v === null) st.delete(k); else st.put(v, k); }
    await done(t);
  };

  // writes are serialised across ALL tabs (Web Locks) so read → check → write is atomic; without Web Locks, within this tab only
  let chain = Promise.resolve();
  const locked = fn => {
    if (typeof navigator !== 'undefined' && navigator.locks?.request) return navigator.locks.request('wgb-docdb-write', fn);
    const p = chain.then(fn, fn); chain = p.catch(() => {}); return p;
  };

  // ---- change fan-out: BroadcastChannel (other tabs) + direct calls (this tab) -----------------
  const watchers = new Set();
  const fanout = paths => Promise.all([...watchers].filter(w => paths.some(w.match)).map(w => w.refresh()));
  let ch = null;
  const channel = () => {
    if (ch || typeof BroadcastChannel === 'undefined') return ch;
    ch = new BroadcastChannel('wgb-docdb');
    ch.onmessage = e => { const m = e.data || {}; fanout(m.paths || (m.path ? [m.path] : [])); };
    return ch;
  };
  const announce = async paths => { channel()?.postMessage({ paths }); await fanout(paths); };   // after the IndexedDB transaction has completed

  const isAdmin = () => !!document.body?.classList.contains('admin');
  const guestRows = () => be.guests();
  const guestDoc = g => withId(g.id, g);

  // a watcher: re-reads on every relevant change, tells the callback only when the result differs (the first time always).
  // Returns { refresh, stop }. Refreshes never overlap: a change that arrives mid-read triggers one more read afterwards.
  function watcher(match, load, deliver, onError) {
    let running = null, dirty = false, dead = false, last = null;
    const loop = async () => {
      do {
        dirty = false;
        let v;
        try { v = await load(); } catch (e) { if (!dead) onError(toDocError(e)); return; }
        if (dead) return;
        last = deliver(v, last);
      } while (dirty && !dead);
    };
    const w = {
      match,
      refresh() { if (running) { dirty = true; return running; } running = loop().finally(() => { running = null; }); return running; },
      stop() { dead = true; watchers.delete(w); },
    };
    watchers.add(w); channel();
    w.refresh();
    return w;
  }
  const safe = (fn, ...args) => { try { fn(...args); } catch (e) { console.error('[docdb] watcher callback', e); } };

  const read = async path => {
    const { def, id } = matchPath(path);
    if (def.pattern === 'guests/{id}') { const g = guestRows().find(x => x.id === id); return g ? guestDoc(g) : null; }
    const typed = await idbGet(DOC + path);
    return typed ? withId(id, decode(typed)) : null;
  };
  const list = async (name, q) => {
    let docs;
    if (name === 'guests') docs = guestRows().map(guestDoc);
    else docs = (await idbScan(`${DOC}${name}/`)).map(([k, typed]) => withId(k.slice(DOC.length + name.length + 1), decode(typed)));
    return applyQuery(docs, q);
  };

  // ---- merge semantics (same as Firestore) ------------------------------------------------------
  /** inc markers become numbers (old + n; a missing / non-number old value counts as 0) */
  const resolveIncs = (v, old) => {
    if (isIncrement(v)) return (typeof old === 'number' ? old : 0) + v.n;
    if (Array.isArray(v)) return v.map(x => resolveIncs(x, undefined));
    if (isMapVal(v)) { const o = {}; for (const k of Object.keys(v)) o[k] = resolveIncs(v[k], isMapVal(old) ? old[k] : undefined); return o; }
    return v;
  };
  /** set(…, { merge: true }): maps merge deeply, everything else is replaced */
  const mergeInto = (base, patch) => {
    const out = isMapVal(base) ? { ...base } : {};
    for (const k of Object.keys(patch)) out[k] = isMapVal(patch[k]) && isMapVal(out[k]) ? mergeInto(out[k], patch[k]) : resolveIncs(patch[k], out[k]);
    return out;
  };
  /** update(patch): each top-level key — or dotted path — is replaced wholesale */
  const applyPatch = (base, patch) => {
    const out = structuredClone(base);
    for (const key of Object.keys(patch)) {
      const segs = key.split('.');
      if (segs.some(s => s === '' || s === '__proto__')) throw fail('invalid-argument', `"${key}" is not a valid field path`);
      let node = out;
      for (const s of segs.slice(0, -1)) { if (!isMapVal(node[s])) node[s] = {}; node = node[s]; }
      const last = segs[segs.length - 1];
      node[last] = resolveIncs(patch[key], node[last]);
    }
    return out;
  };
  const stamp = (v, now) => (isServerTs(v) ? { $ts: now } : Array.isArray(v) ? v.map(x => stamp(x, now)) : isMapVal(v) ? Object.fromEntries(Object.keys(v).map(k => [k, stamp(v[k], now)])) : v);

  async function write(ops) {
    const changed = await locked(async () => {
      const now = Date.now();
      const env = { admin: isAdmin(), now, guestExists: async id => guestRows().some(g => g.id === id), get: async p => (await idbGet(DOC + p)) };
      const out = new Map();
      for (const op of ops) {
        const prev = await idbGet(DOC + op.path);
        let kind, next = null;
        if (op.type === 'delete') kind = 'delete';
        else if (op.type === 'create') { if (prev) throw fail('already-exists', `document already exists (${op.path})`); kind = 'create'; next = resolveIncs(op.data, undefined); }
        else if (op.type === 'update') { if (!prev) throw fail('not-found', `document does not exist (${op.path})`); kind = 'update'; next = applyPatch(prev, op.data); }
        else { kind = prev ? 'update' : 'create'; next = op.merge ? mergeInto(prev || {}, op.data) : resolveIncs(op.data, undefined); }
        const r = await check(kind, op.path, next, prev, env);
        if (r) throw violation(r, op.path);
        out.set(DOC + op.path, kind === 'delete' ? null : stamp(next, now));
      }
      await idbPut(out);
      return [...out.keys()].map(k => k.slice(DOC.length));
    });
    await announce(changed);
  }

  return {
    kind: 'demo',
    admin: isAdmin,
    read, list, write,
    watchDoc(path, fn, onError) {
      const w = watcher(p => p === path, () => read(path), (v, last) => { const sig = JSON.stringify(v); if (last === null || sig !== last) safe(fn, v); return sig; }, onError);
      // the guest list lives in localStorage — store.js tells us when it changes
      const offGuests = path.startsWith('guests/') ? store.subscribeGuests(() => w.refresh()) : null;
      return () => { w.stop(); offGuests?.(); };
    },
    watchList(name, q, fn, onError) {
      let prev = new Map();
      const w = watcher(p => p.startsWith(name + '/'), () => list(name, q), (docs, last) => {
        const next = new Map(docs.map(d => [d.id, JSON.stringify(d)]));
        const changes = [];
        for (const d of docs) { const was = prev.get(d.id); if (was === undefined) changes.push({ type: 'added', id: d.id, data: d }); else if (was !== next.get(d.id)) changes.push({ type: 'modified', id: d.id, data: d }); }
        for (const id of prev.keys()) if (!next.has(id)) changes.push({ type: 'removed', id, data: null });
        prev = next;
        if (last === null || changes.length) safe(fn, docs, changes);
        return 'ok';
      }, onError);
      const offGuests = name === 'guests' ? store.subscribeGuests(() => w.refresh()) : null;
      return () => { w.stop(); offGuests?.(); };
    },
  };
}

// ---- the firebase backend: Firestore, the instance store.js already created -------------------------
function firebaseImpl(store) {
  const { fs, db, watch } = store.backend;
  let admin = true;   // until the auth state is known the browser does not guess — the server decides
  store.onAuth(u => { admin = !!u?.isAdmin; });
  const ref = path => fs.doc(db, ...path.split('/'));
  /** Firestore data → what features see ({ id, ...fields }, Timestamps → ms) */
  const toData = snap => withId(snap.id, decode(snap.data({ serverTimestamps: 'estimate' })));
  /** markers → FieldValues; ms numbers stay numbers */
  const toFs = v => {
    if (isServerTs(v)) return fs.serverTimestamp();
    if (isIncrement(v)) return fs.increment(v.n);
    if (Array.isArray(v)) return v.map(toFs);
    if (isMapVal(v)) return Object.fromEntries(Object.keys(v).map(k => [k, toFs(v[k])]));
    return v;
  };
  const build = (name, q) => {
    const def = matchCollection(name).def;
    const conv = (f, x) => (def.ts?.includes(f) && typeof x === 'number' ? fs.Timestamp.fromMillis(x) : x);
    const parts = [
      ...q.where.map(([f, op, val]) => fs.where(f, op, op === 'in' ? val.map(x => conv(f, x)) : conv(f, val))),
      ...q.order.map(([f, dir]) => fs.orderBy(f, dir)),
      ...(q.limit ? [fs.limit(q.limit)] : []),
    ];
    return fs.query(fs.collection(db, name), ...parts);
  };
  const env = () => ({ admin, now: Date.now(), relational: false });
  /** the shape rules only — the server has the last word */
  async function precheck(op) {
    const m = matchPath(op.path);
    const e = env();
    let r;
    if (op.type === 'delete') r = await check('delete', op.path, null, null, e);
    else if (op.type === 'create') r = await check('create', op.path, op.data, null, e);
    else if (op.type === 'set' && !op.merge) r = await check(m.def.create ? 'create' : 'update', op.path, op.data, null, e);
    else r = await check(m.def.update ? 'update' : 'create', op.path, op.data, null, { ...e, partial: true });
    if (r) throw violation(r, op.path);
  }

  return {
    kind: 'firebase',
    admin: () => admin,
    async read(path) { const s = await fs.getDoc(ref(path)); return s.exists() ? toData(s) : null; },
    async list(name, q) { return (await fs.getDocs(build(name, q))).docs.map(toData); },
    async write(ops) {
      for (const op of ops) await precheck(op);
      if (ops.length === 1) {
        const [op] = ops, r = ref(op.path);
        if (op.type === 'delete') return fs.deleteDoc(r);
        if (op.type === 'update') return fs.updateDoc(r, toFs(op.data));
        if (op.type === 'set') return fs.setDoc(r, toFs(op.data), op.merge ? { merge: true } : undefined);
        // create: a transaction (read first, refuse if it exists). Offline a transaction cannot run — where the rules allow no update
        // (checkins, anniv) a plain write is just as safe: the server refuses a second one — so queue it like Firestore queues any write.
        try {
          return await fs.runTransaction(db, async tx => {
            if ((await tx.get(r)).exists()) throw fail('already-exists', `document already exists (${op.path})`);
            tx.set(r, toFs(op.data));
          });
        } catch (e) {
          const code = toDocError(e)?.code;
          if (code === 'unavailable' && !matchPath(op.path).def.update) return fs.setDoc(r, toFs(op.data));
          throw e;
        }
      }
      const b = fs.writeBatch(db);
      for (const op of ops) {
        const r = ref(op.path);
        if (op.type === 'delete') b.delete(r);
        else if (op.type === 'update') b.update(r, toFs(op.data));
        else b.set(r, toFs(op.data), op.merge ? { merge: true } : undefined);
      }
      return b.commit();
    },
    // store.js's watch() re-attaches with back-off when a listener dies; the errors that never heal by themselves stop it
    watchDoc(path, fn, onError) {
      return watch('docdb:' + path, ref(path), snap => safe(fn, snap.exists() ? toData(snap) : null), listenerError(onError));
    },
    watchList(name, q, fn, onError) {
      return watch('docdb:' + name, build(name, q), snap => safe(fn, snap.docs.map(toData),
        snap.docChanges().map(ch => ({ type: ch.type, id: ch.doc.id, data: ch.type === 'removed' ? null : toData(ch.doc) }))), listenerError(onError));
    },
  };
  function listenerError(onError) {
    return err => {
      const e = toDocError(err);
      onError?.(e);
      if (e?.code === 'permission-denied' || String(err?.code).endsWith('failed-precondition')) return false;
    };
  }
  function safe(fn, ...args) { try { fn(...args); } catch (e) { console.error('[docdb] watcher callback', e); } }
}

// ---- backends & the facade -----------------------------------------------------------------------
const FACTORIES = new Map([['demo', demoImpl], ['firebase', firebaseImpl]]);
/** WP-14: registerBackend('archive', store => impl) — impl = { kind, admin, read, list, write, watchDoc, watchList } */
export function registerBackend(kind, factory) { FACTORIES.set(kind, factory); }

let implP = null, implKind = null;
const ready = () => implP || (implP = (async () => {
  const store = await getStore();
  const kind = store.backend?.kind;
  const make = FACTORIES.get(kind);
  if (!make) throw fail('unavailable', `no document backend for "${kind}"`);
  const impl = await make(store);
  implKind = impl.kind;
  return impl;
})().catch(e => { implP = null; throw e; }));

const logErr = e => console.error('[docdb]', e?.code || '', e?.message || e);

/** declared path? v3.2 collection? → the matching { def } or a thrown unknown-path / permission-denied */
function pathInfo(path) {
  const m = matchPath(path);
  if (!m) throw fail('unknown-path', `path is not declared in core/schema.js: ${path}`, { path });
  return m;
}
function colInfo(name) {
  const m = matchCollection(name);
  if (!m) throw fail('unknown-path', `collection is not declared in core/schema.js: ${name}`, { path: name });
  return m;
}
async function permit(impl, op, path) {
  const r = await check(op, path, null, null, { admin: impl.admin(), now: Date.now(), relational: false });
  if (r) throw violation(r, path);
}

/** A write request as the features state it → validated, encoded ops for the backend */
function prepare(o) {
  const m = pathInfo(o.path);
  if (m.def.v3) throw violation({ code: 'permission-denied', reason: `${m.def.pattern} is a v3.2 collection — use the store (ctx.store()), not ctx.db` }, o.path);
  if (o.type === 'delete') return { type: 'delete', path: o.path };
  const data = encode(o.data, o.path);
  if (!isMapVal(data)) throw fail('invalid-argument', `a document must be a map (${o.path})`, { path: o.path });
  return { type: o.type, path: o.path, data, merge: !!o.merge };
}
async function commit(ops) {
  if (!ops.length) return;
  if (ops.length > 500) throw fail('invalid-argument', 'a batch holds at most 500 writes');
  const prepared = ops.map(prepare);
  if (new Set(prepared.map(o => o.path)).size !== prepared.length) throw fail('invalid-argument', 'a batch may write each document only once');
  const impl = await ready();
  try { await impl.write(prepared); } catch (e) { throw toDocError(e, prepared.length === 1 ? prepared[0].path : '') ; }
}

/** attach a watcher once the backend is ready; returns `off` immediately. Store load failures retry with back-off. */
function attach(onError, start) {
  let off = null, dead = false, tries = 0, timer = null;
  const report = onError || logErr;
  const go = async () => {
    try {
      const impl = await ready();
      if (dead) return;
      off = await start(impl, e => { if (!dead) report(e); });
      if (dead) { off?.(); off = null; }
    } catch (e) {
      if (dead) return;
      const err = toDocError(e);
      report(err);
      if (err?.code === 'unavailable' || err?.code === 'load-timeout') timer = setTimeout(go, Math.min(30000, 2000 * 2 ** tries++));
    }
  };
  go();
  return () => { dead = true; clearTimeout(timer); off?.(); off = null; };
}

function docRef(path) {
  return {
    path,
    async get() { pathInfo(path); const impl = await ready(); await permit(impl, 'get', path); try { return await impl.read(path); } catch (e) { throw toDocError(e, path); } },
    watch(fn, onError) {
      pathInfo(path);
      if (typeof fn !== 'function') throw fail('invalid-argument', 'watch(fn) needs a function');
      return attach(onError, async (impl, err) => { await permit(impl, 'get', path); return impl.watchDoc(path, fn, e => err(toDocError(e, path))); });
    },
    create: data => commit([{ type: 'create', path, data }]),
    set: (data, opts) => commit([{ type: 'set', path, data, merge: !!opts?.merge }]),
    update: patch => commit([{ type: 'update', path, data: patch }]),
    delete: () => commit([{ type: 'delete', path }]),
  };
}

function colRef(name, q = newQuery()) {
  const extend = patch => colRef(name, { ...q, ...patch });
  return {
    name,
    where(f, op, value) {
      if (typeof f !== 'string' || !f) throw fail('invalid-argument', 'where(field, op, value): field must be a string');
      if (!WHERE_OPS.includes(op)) throw fail('invalid-argument', `where: op must be one of ${WHERE_OPS.join(' ')}`);
      if (op === 'in' && !(Array.isArray(value) && value.length >= 1 && value.length <= 30)) throw fail('invalid-argument', 'where "in" needs a list of 1–30 values');
      if (value === undefined || (op !== 'in' && Array.isArray(value))) throw fail('invalid-argument', 'where: bad value');
      return extend({ where: [...q.where, [f, op, value]] });
    },
    orderBy(f, dir = 'asc') {
      if (typeof f !== 'string' || !f || (dir !== 'asc' && dir !== 'desc')) throw fail('invalid-argument', "orderBy(field, 'asc' | 'desc')");
      return extend({ order: [...q.order, [f, dir]] });
    },
    limit(n) {
      if (!Number.isInteger(n) || n < 1 || n > 10000) throw fail('invalid-argument', 'limit(n): n must be an integer 1–10000');
      return extend({ limit: n });
    },
    async get() {
      colInfo(name); assertIndexable(q, name);
      const impl = await ready(); await permit(impl, 'list', name);
      try { return await impl.list(name, q); } catch (e) { throw toDocError(e, name); }
    },
    watch(fn, onError) {
      colInfo(name); assertIndexable(q, name);
      if (typeof fn !== 'function') throw fail('invalid-argument', 'watch(fn) needs a function');
      return attach(onError, async (impl, err) => { await permit(impl, 'list', name); return impl.watchList(name, q, fn, e => err(toDocError(e, name))); });
    },
    async add(data) { const id = newId(); await docRef(`${name}/${id}`).create(data); return id; },
  };
}

function batch() {
  const ops = [];
  const b = {
    set(path, data, opts) { ops.push({ type: 'set', path, data, merge: !!opts?.merge }); return b; },
    update(path, patch) { ops.push({ type: 'update', path, data: patch }); return b; },
    delete(path) { ops.push({ type: 'delete', path }); return b; },
    commit: () => commit(ops.splice(0)),
  };
  return b;
}

const facade = {
  /** 'firebase' | 'demo' | 'archive' — known at once (storeKind), confirmed by the backend once it is ready */
  get backend() { return implKind || storeKind(); },
  doc: docRef,
  col: colRef,
  ts: serverTs,
  inc: increment,
  batch,
};
/** The document database (usable at once — calls wait for the store; `watch` attaches when it is ready) */
export const docdb = () => facade;
/** Same object, but resolves only after the backend exists (tests, boot code that must know the real backend) */
export async function getDB() { await ready(); return facade; }

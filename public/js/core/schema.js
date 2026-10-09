// ============================================================
//  core/schema.js — the JS mirror of firestore.rules (docs/v4/03-data-and-rules.md §2 · §4)
//
//  Every path in firestore.rules is declared here (core-features-static compares the two lists).
//  `check()` re-implements each rule condition in the SAME ORDER as the rules, so the demo backend answers like the real server:
//    "passes in the demo ⇒ passes in production" is the goal. Where the two could differ, this file is the stricter one.
//  Error classes: shape violations (keys, types, lengths, ids, ts() fields) → 'invalid-argument';
//                 who / existence / time / rate violations                   → 'permission-denied'.
//  The class is decided by the FIRST failing condition, exactly like `a && b && c` in the rules.
//  Pure module: no imports, no DOM, no network — it also loads in Node (static tests).
//  Changing a rule means changing firestore.rules AND this file in the same commit (and Patrick re-publishing the rules).
// ============================================================

// ---- typed values shared by schema.js, docdb.js and the demo IndexedDB -----------------------
//  server time marker   { $sv: 'ts' }          what ctx.db.ts() returns (firebase → serverTimestamp(), demo → Date.now() at write)
//  increment marker     { $sv: 'inc', n }      what ctx.db.inc(n) returns
//  stored timestamp     { $ts: ms }            how the demo IndexedDB keeps a timestamp (reads hand out plain ms numbers)
const SERVER_TS = Object.freeze({ $sv: 'ts' });
export const serverTs = () => SERVER_TS;
export const increment = n => Object.freeze({ $sv: 'inc', n });
const isObj = v => v !== null && typeof v === 'object';
export const isServerTs = v => isObj(v) && v.$sv === 'ts';
export const isIncrement = v => isObj(v) && v.$sv === 'inc';
export const isStoredTs = v => isObj(v) && typeof v.$ts === 'number';

// ---- the rules language, in JS --------------------------------------------------------------
const isTimestamp = v => isServerTs(v) || isStoredTs(v);                                   // `v is timestamp`
const isList = Array.isArray;                                                              // `v is list`
const isMap = v => isObj(v) && !isList(v) && !('$sv' in v) && !('$ts' in v);               // `v is map`
const isStr = v => typeof v === 'string';                                                  // `v is string`
const isBool = v => typeof v === 'boolean';                                                // `v is bool`
const isInt = v => (typeof v === 'number' && Number.isInteger(v)) || (isIncrement(v) && Number.isInteger(v.n));   // `v is int`
const has = (m, k) => Object.prototype.hasOwnProperty.call(m, k) && m[k] !== undefined;
const getOr = (m, k, d) => (has(m, k) ? m[k] : d);                                         // `m.get(k, d)`
const hasOnly = (m, keys) => Object.keys(m).every(k => keys.includes(k));                  // `m.keys().hasOnly([...])`
const extraKeys = (m, keys) => Object.keys(m).filter(k => !keys.includes(k));
// strings are measured in UTF-16 units (JS .length) — never fewer than the rules' count, so the demo is never more lenient
const size = v => (isStr(v) || isList(v) ? v.length : isMap(v) ? Object.keys(v).length : NaN);
const tsMs = v => (isStoredTs(v) ? v.$ts : NaN);

const RE_IMAGE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const RE_PID = /^p[a-z0-9]{1,12}$/;
const RE_TOKEN = /^[A-Za-z0-9]{20,40}$/;
const isJpeg = v => isStr(v) && v.length < 900000 && RE_IMAGE.test(v);                     // rules: isJpeg(v)

const bad = reason => ({ code: 'invalid-argument', reason });
const no = reason => ({ code: 'permission-denied', reason });
const need = (cond, reason) => (cond ? null : bad(reason));                                // shape
const must = (cond, reason) => (cond ? null : no(reason));                                 // permission / existence / time / rate

/** Run the steps in order; the first failure decides. A throwing step = an evaluation error = denied (as in the rules). */
const run = async (c, steps) => {
  for (const s of steps) {
    let r;
    try { r = await s(c); } catch (e) { r = bad('rule evaluation error: ' + (e?.message || e)); }
    if (r) return r;
  }
  return null;
};

// ---- rule building blocks (same names as the functions in firestore.rules) ---------------------
const admin = c => must(c.env.admin, 'admin only');                                        // isAdmin()
const keysOnly = keys => c => need(hasOnly(c.d, keys), 'unknown field(s): ' + extraKeys(c.d, keys).join(', '));   // request.resource.data.keys().hasOnly([…])
/** request.resource.data[k] == request.time  → must be ctx.db.ts() */
const srvTime = k => c => need(c.env.serverTime ? c.env.serverTime(c.d[k]) : isServerTs(c.d[k]), `${k} must be ctx.db.ts()`);
/** guestExists(id) — the existence half is skipped when env.relational === false (browser pre-check against Firestore: the server decides) */
const guest = (idOf, label = 'gid') => async c => {
  const id = idOf(c);
  if (!(isStr(id) && id.length > 0 && id.length <= 64)) return no(`${label} is not a valid guest id`);
  if (c.env.relational === false) return null;
  return must(await c.env.guestExists(id), `no such guest: ${id}`);
};
const bilingual = (m, n) => isMap(m) && hasOnly(m, ['ko', 'en'])
  && isStr(getOr(m, 'ko', '')) && size(getOr(m, 'ko', '')) <= n && isStr(getOr(m, 'en', '')) && size(getOr(m, 'en', '')) <= n;
const needBilingual = (k, n) => c => need(has(c.d, k) && bilingual(c.d[k], n), `${k} must be { ko, en } with each ≤ ${n} chars`);
const optBilingual = (k, n) => c => need(getOr(c.d, k, null) === null || bilingual(c.d[k], n), `${k} must be null or { ko, en } with each ≤ ${n} chars`);
const strMax = (k, n, min = 0) => c => need(isStr(c.d[k]) && size(c.d[k]) >= min && size(c.d[k]) <= n, `${k} must be a string of ${min ? min + '–' : '≤ '}${n} chars`);
const oneOf = (k, list) => c => need(list.includes(c.d[k]), `${k} must be one of ${list.join('|')}`);
const idLike = (re, what) => c => need(re.test(c.id), `${what} must match ${re.source}`);

const READ = { get: true, list: true };

// ---- the collections ---------------------------------------------------------------------------
const MISSIONS = Array.from({ length: 24 }, (_, i) => 'm' + i);

// match /app/settings
const settingsOk = c => run(c, [
  admin,
  keysOnly(['features', 'safe', 'phase', 'cfg', 'updatedAt']),
  c => need(isMap(getOr(c.d, 'features', {})) && size(getOr(c.d, 'features', {})) <= 40, 'features must be a map of ≤ 40 entries'),
  c => need(isBool(getOr(c.d, 'safe', false)), 'safe must be a bool'),
  c => need(['auto', 'pre', 'live', 'after', 'anniversary'].includes(getOr(c.d, 'phase', 'auto')), 'phase must be auto|pre|live|after|anniversary'),
  c => need(isMap(getOr(c.d, 'cfg', {})) && size(getOr(c.d, 'cfg', {})) <= 40, 'cfg must be a map of ≤ 40 entries'),
  srvTime('updatedAt'),
]);

// match /app/live
const liveOk = c => run(c, [
  admin,
  keysOnly(['cue', 'cueSeq', 'cueAt', 'quiet', 'poll', 'msg', 'updatedAt']),
  c => need(getOr(c.d, 'cue', null) === null || (isStr(c.d.cue) && size(c.d.cue) <= 24), 'cue must be null or a string ≤ 24 chars'),
  c => need(isInt(getOr(c.d, 'cueSeq', 0)), 'cueSeq must be an int'),
  c => need(getOr(c.d, 'cueAt', null) === null || isTimestamp(c.d.cueAt), 'cueAt must be null or ctx.db.ts()'),
  c => need(isBool(getOr(c.d, 'quiet', false)), 'quiet must be a bool'),
  c => need(getOr(c.d, 'poll', null) === null || (isStr(c.d.poll) && size(c.d.poll) <= 24), 'poll must be null or a string ≤ 24 chars'),
  optBilingual('msg', 80),
  srvTime('updatedAt'),
]);

// match /translations/{gid}
const translationOk = c => run(c, [
  admin,
  keysOnly(['src', 'ko', 'en', 'engine', 'updatedAt']),
  oneOf('src', ['ko', 'en']),
  strMax('ko', 600), strMax('en', 600), strMax('engine', 20),
  srvTime('updatedAt'),
]);

// function bingoOk(d)
const bingoOk = c => run(c, [
  keysOnly(['done', 'lines', 'updatedAt']),
  c => need(isList(c.d.done) && size(c.d.done) <= 16, 'done must be a list of ≤ 16 missions'),
  c => need(c.d.done.every(m => MISSIONS.includes(m)), 'done may only contain m0 … m23'),
  c => need(isInt(c.d.lines) && c.d.lines >= 0 && c.d.lines <= 10, 'lines must be an int 0–10'),
  srvTime('updatedAt'),
]);

// match /polls/{pid}
const pollOk = c => run(c, [
  admin,
  idLike(RE_PID, 'poll id'),
  keysOnly(['q', 'kind', 'options', 'open', 'order', 'result', 'createdAt', 'updatedAt']),
  needBilingual('q', 120),
  oneOf('kind', ['choice', 'guest']),
  c => need(isList(c.d.options) && size(c.d.options) <= 8, 'options must be a list of ≤ 8'),
  c => need(isBool(c.d.open), 'open must be a bool'),
  c => need(isInt(c.d.order), 'order must be an int'),
  c => need(getOr(c.d, 'result', null) === null || isMap(c.d.result), 'result must be null or a map'),
  srvTime('updatedAt'),
]);

// function voteOk(vid, d)
const voteOk = c => {
  const parts = c.id.split('_');
  return run(c, [
    c => need(parts.length === 2, 'vote id must be <pollId>_<guestId>'),
    keysOnly(['pid', 'gid', 'choice', 'updatedAt']),
    c => must(c.d.pid === parts[0] && c.d.gid === parts[1], 'pid and gid must match the document id'),
    guest(() => parts[1]),
    async c => {   // let poll = get(pollPath(parts[0])).data;  … poll.open == true
      if (c.env.relational === false) return null;
      c.poll = await c.env.get('polls/' + parts[0]);
      if (!c.poll) return no('no such poll: ' + parts[0]);
      return must(c.poll.open === true, 'poll is closed');
    },
    async c => {   // choice: an option index (choice poll) or an existing guest (guest poll)
      if (c.env.relational === false) return need(isInt(c.d.choice) || isStr(c.d.choice), 'choice must be an int or a guest id');
      if (c.poll.kind === 'choice') return need(isInt(c.d.choice) && c.d.choice >= 0 && c.d.choice < size(c.poll.options), 'choice must be an option index');
      if (c.poll.kind === 'guest') return run(c, [c => need(isStr(c.d.choice), 'choice must be a guest id'), guest(c => c.d.choice, 'choice')]);
      return no('poll has an unknown kind');
    },
    srvTime('updatedAt'),
  ]);
};

// match /thanks/{token}
const thanksOk = c => run(c, [
  admin,
  idLike(RE_TOKEN, 'token'),
  keysOnly(['gid', 'name', 'note', 'photo', 'theme', 'createdAt', 'updatedAt']),
  strMax('gid', 64), strMax('name', 30),
  needBilingual('note', 600),
  c => need(getOr(c.d, 'photo', null) === null || isJpeg(c.d.photo), 'photo must be null or a base64 JPEG/PNG/WebP data URL (< 900 KB)'),
  oneOf('theme', ['classic', 'garden', 'night']),
  srvTime('updatedAt'),
]);

// match /postcards/{id}
const postcardOk = c => run(c, [
  admin,
  keysOnly(['title', 'msg', 'place', 'theme', 'thumb', 'order', 'createdAt', 'updatedAt']),
  needBilingual('title', 60),
  optBilingual('msg', 300),
  strMax('place', 40),
  oneOf('theme', ['default', 'city', 'beach', 'mountain', 'castle', 'night']),
  c => need(isJpeg(c.d.thumb) && size(c.d.thumb) < 200000, 'thumb must be a base64 image data URL < 200 KB'),
  c => need(isInt(c.d.order), 'order must be an int'),
  srvTime('updatedAt'),
]);

// match /postcardImages/{id}
const postcardImageOk = c => run(c, [
  admin,
  keysOnly(['data', 'updatedAt']),
  c => need(isJpeg(c.d.data), 'data must be a base64 image data URL < 900 KB'),
  srvTime('updatedAt'),
]);

const ANNIV_FROM = Date.UTC(2028, 3, 3), ANNIV_TO = Date.UTC(2028, 3, 24);   // timestamp.date(2028, 4, 3) … (2028, 4, 24) — UTC

export const SCHEMA = [
  // ---- v3.2: store.js owns every write. docdb may only READ guests (e.g. to check a bingo code) --------------------------------
  { pattern: 'guests/{id}', v3: true, ts: ['createdAt'], ...READ },
  { pattern: 'photos/{id}', v3: true },
  { pattern: 'voices/{id}', v3: true },
  { pattern: 'capsules/{id}', v3: true },
  { pattern: 'notes/{id}', v3: true },            // v4 "only for the couple" message — written by store.addGuest (same batch as its guest), admin-only, never through docdb
  { pattern: 'snaps/{id}', v3: true },
  { pattern: 'pulse/{gid}', v3: true },
  { pattern: 'events/{id}', v3: true },

  // ---- v4 ----------------------------------------------------------------------------------------------------------------------
  { pattern: 'app/settings', ts: ['updatedAt'], keys: ['features', 'safe', 'phase', 'cfg', 'updatedAt'],
    get: true, create: settingsOk, update: settingsOk },
  { pattern: 'app/live', ts: ['cueAt', 'updatedAt'], keys: ['cue', 'cueSeq', 'cueAt', 'quiet', 'poll', 'msg', 'updatedAt'],
    get: true, create: liveOk, update: liveOk },

  { pattern: 'checkins/{gid}', ts: ['createdAt'], keys: ['via', 'createdAt'], ...READ,
    create: c => run(c, [
      guest(c => c.id),
      keysOnly(['via', 'createdAt']),
      oneOf('via', ['phone', 'kiosk', 'entrance', 'admin']),
      c => must(c.d.via !== 'admin' || c.env.admin, 'via "admin" is for admins only'),
      srvTime('createdAt'),
    ]),
    delete: admin },

  { pattern: 'translations/{gid}', ts: ['updatedAt'], keys: ['src', 'ko', 'en', 'engine', 'updatedAt'], ...READ,
    create: translationOk, update: translationOk, delete: admin },

  { pattern: 'bingo/{gid}', ts: ['updatedAt'], keys: ['done', 'lines', 'updatedAt'], ...READ,
    create: c => run(c, [guest(c => c.id), bingoOk]),
    update: c => run(c, [
      guest(c => c.id), bingoOk,
      c => must(isList(c.old?.done) && c.old.done.every(m => c.d.done.includes(m)), 'done can only grow (cells cannot be removed)'),   // done.hasAll(resource.data.done)
      c => must(isInt(c.old?.lines) && c.d.lines >= c.old.lines, 'lines cannot decrease'),
      c => must(c.env.now > tsMs(c.old?.updatedAt) + 1000, 'too fast — bingo can be updated once per second'),                          // request.time > resource.data.updatedAt + 1s
    ]),
    delete: admin },

  { pattern: 'polls/{pid}', ts: ['createdAt', 'updatedAt'], keys: ['q', 'kind', 'options', 'open', 'order', 'result', 'createdAt', 'updatedAt'], ...READ,
    create: pollOk, update: pollOk, delete: admin },

  { pattern: 'votes/{vid}', ts: ['updatedAt'], keys: ['pid', 'gid', 'choice', 'updatedAt'], ...READ,
    create: voteOk,
    update: c => run(c, [voteOk, c => must(c.env.now > tsMs(c.old?.updatedAt) + 2000, 'too fast — a vote can be changed once every 2 seconds')]),
    delete: admin },

  { pattern: 'thanks/{token}', ts: ['createdAt', 'updatedAt'], keys: ['gid', 'name', 'note', 'photo', 'theme', 'createdAt', 'updatedAt'],
    get: c => must(RE_TOKEN.test(c.id), 'a thank-you card is fetched by its token (20–40 letters/digits)'),
    list: admin,                                                          // the list is admin-only — a guest only ever knows their own token
    create: thanksOk, update: thanksOk, delete: admin },

  { pattern: 'postcards/{id}', ts: ['createdAt', 'updatedAt'], keys: ['title', 'msg', 'place', 'theme', 'thumb', 'order', 'createdAt', 'updatedAt'], ...READ,
    create: postcardOk, update: postcardOk, delete: admin },
  { pattern: 'postcardImages/{id}', ts: ['updatedAt'], keys: ['data', 'updatedAt'], ...READ,
    create: postcardImageOk, update: postcardImageOk, delete: admin },

  { pattern: 'anniv/{gid}', ts: ['createdAt'], keys: ['text', 'createdAt'], ...READ,
    create: c => run(c, [
      guest(c => c.id),
      keysOnly(['text', 'createdAt']),
      strMax('text', 300, 1),
      srvTime('createdAt'),
      c => must(c.env.now >= ANNIV_FROM && c.env.now < ANNIV_TO, 'anniversary notes are open 2028-04-03 … 2028-04-23 (UTC)'),
    ]),
    delete: admin },
];

// ---- path matching -----------------------------------------------------------------------------
const COMPILED = SCHEMA.map(def => {
  const segs = def.pattern.split('/');
  return { def, segs, params: segs.map(s => (s.startsWith('{') ? s.slice(1, -1) : null)) };
});

/** Firestore document ids we accept: 1–100 chars, no "/", not "." / "..", not __x__ (reserved) */
export const validId = id => isStr(id) && id.length >= 1 && id.length <= 100 && !id.includes('/') && id !== '.' && id !== '..' && !/^__.*__$/.test(id);

/** 'votes/p1_gA' → { def, params: { vid: 'p1_gA' }, id: 'p1_gA' } · null if the path is not declared */
export function matchPath(path) {
  if (!isStr(path)) return null;
  const parts = path.split('/');
  for (const m of COMPILED) {
    if (m.segs.length !== parts.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < parts.length && ok; i++) {
      if (m.params[i]) { if (validId(parts[i])) params[m.params[i]] = parts[i]; else ok = false; }
      else if (m.segs[i] !== parts[i]) ok = false;
    }
    if (ok) return { def: m.def, params, id: parts[parts.length - 1] };
  }
  return null;
}

/** 'checkins' → def (collections only; the two fixed documents under app/ are not collections) · null if not declared */
export function matchCollection(name) {
  if (!isStr(name) || name.includes('/')) return null;
  const m = COMPILED.find(x => x.segs.length === 2 && x.params[1] && x.segs[0] === name);
  return m ? { def: m.def } : null;
}

// ---- the check -----------------------------------------------------------------------------------
/**
 * check(op, path, next, prev, env) → null (allowed) | { code, reason }
 *   op   : 'get' | 'list' | 'create' | 'update' | 'delete'      (for 'list', `path` is the collection name)
 *   next : the document as it will look AFTER the write (request.resource.data) — ts() markers still in place,
 *          increments already resolved (demo) · for env.partial it is only the patch
 *   prev : the document before the write (resource.data, stored form: timestamps are { $ts }) or null
 *   env  : { admin: boolean, now: ms, guestExists(id): Promise<boolean>, get(path): Promise<data|null>,
 *            serverTime?(v): boolean,            // is v the ts() marker? (default: isServerTs)
 *            relational?: false,                 // skip rules that read other documents (browser pre-check against Firestore)
 *            partial?: true }                    // next is a patch (update / merge-set against Firestore): only the key list is checked
 */
export async function check(op, path, next, prev, env = {}) {
  const hit = op === 'list' ? matchCollection(path) : matchPath(path);
  if (!hit) return { code: 'unknown-path', reason: `path is not declared in core/schema.js: ${path}` };
  const { def } = hit;
  const e = { admin: false, now: Date.now(), guestExists: async () => false, get: async () => null, ...env };
  let rule = def[op];
  if (def.v3 && op !== 'get' && op !== 'list') rule = undefined;
  if (rule === undefined || rule === null || rule === false) {
    return no(def.v3 ? `${def.pattern} is a v3.2 collection — use the store (ctx.store()), not ctx.db` : `${op} is not allowed on ${def.pattern}`);
  }
  if (rule === true) return null;
  if (e.partial && (op === 'create' || op === 'update') && def.keys) {
    const tops = Object.keys(next || {}).map(k => k.split('.')[0]);
    const extra = tops.filter(k => !def.keys.includes(k));
    return extra.length ? bad('unknown field(s): ' + [...new Set(extra)].join(', ')) : null;
  }
  const c = { op, id: hit.id, params: hit.params, d: next, old: prev, env: e };
  if ((op === 'create' || op === 'update') && !isMap(next)) return bad('document data must be a map');
  return rule === admin ? admin(c) : rule(c);
}

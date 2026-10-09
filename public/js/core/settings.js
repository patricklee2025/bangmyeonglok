// ============================================================
//  core/settings.js — app/settings (feature flags · safe mode · phase override · per-feature config) and app/live (cue · quiet · open poll · notice)
//  (docs/v4/02-contracts.md §10 · WP-00b §4.3)
//
//  Every page watches the two documents (2 listeners per device) and re-emits them on the bus: 'settings' / 'live' (sticky).
//  Missing document, wrong types, unknown keys → the defaults, so a page never has to cope with a half-written document.
//  Admin helpers write through core/docdb.js: not an admin → the `permission-denied` error is thrown as is.
// ============================================================
import { emit } from './bus.js';
import { PHASES } from './phase.js';
import { docdb, ts, fail } from './docdb.js';

const deepFreeze = v => { if (v && typeof v === 'object' && !Object.isFrozen(v)) { Object.freeze(v); Object.values(v).forEach(deepFreeze); } return v; };
const isMap = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const text = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
const copy = v => JSON.parse(JSON.stringify(v));

export const DEFAULT_SETTINGS = deepFreeze({ features: {}, safe: false, phase: 'auto', cfg: {}, updatedAt: null });
export const DEFAULT_LIVE = deepFreeze({ cue: null, cueSeq: 0, cueAt: null, quiet: false, poll: null, msg: null, updatedAt: null });

/** raw document (or null) → the Settings of 02 §10. Unknown keys are dropped, wrong types fall back to the default. The result is frozen. */
export function normalizeSettings(raw) {
  const r = isMap(raw) ? raw : {};
  const features = {};
  if (isMap(r.features)) for (const k of Object.keys(r.features)) if (k !== '__proto__' && typeof r.features[k] === 'boolean') features[k] = r.features[k];
  const cfg = {};
  if (isMap(r.cfg)) for (const k of Object.keys(r.cfg)) if (k !== '__proto__' && isMap(r.cfg[k])) cfg[k] = copy(r.cfg[k]);
  return deepFreeze({
    features,
    safe: r.safe === true,
    phase: ['auto', ...PHASES].includes(r.phase) ? r.phase : 'auto',
    cfg,
    updatedAt: num(r.updatedAt),
  });
}

/** raw document (or null) → the Live of 02 §10 (frozen) */
export function normalizeLive(raw) {
  const r = isMap(raw) ? raw : {};
  const msg = isMap(r.msg) ? { ko: text(r.msg.ko, 80), en: text(r.msg.en, 80) } : null;
  return deepFreeze({
    cue: typeof r.cue === 'string' && r.cue && r.cue.length <= 24 ? r.cue : null,
    cueSeq: Number.isInteger(r.cueSeq) && r.cueSeq >= 0 ? r.cueSeq : 0,
    cueAt: num(r.cueAt),
    quiet: r.quiet === true,
    poll: typeof r.poll === 'string' && r.poll && r.poll.length <= 24 ? r.poll : null,
    msg: msg && (msg.ko || msg.en) ? msg : null,
    updatedAt: num(r.updatedAt),
  });
}

// ---- state + start ----------------------------------------------------------------------------------
let settings = normalizeSettings(null), live = normalizeLive(null);
export const getSettings = () => settings;
export const getLive = () => live;

let started = null, arrived = null, arrive = null;
/** Resolves with the REAL first value of app/settings (cache or server) — never because of the 2 s default timeout (the prereg gate waits on this). */
export function settingsArrived() {
  if (!arrived) arrived = new Promise(res => { arrive = res; });
  return arrived;
}

/**
 * Once per page. Starts the two watchers; resolves when both first values are in — or after 2 s with the defaults for whatever is still missing
 * (a slow venue network must not keep a page waiting; the real values then arrive as ordinary changes).
 */
export function startSettings() {
  if (started) return started;
  settingsArrived();
  let sigS = null, sigL = null, gotS = false, gotL = false;
  const applySettings = raw => { const n = normalizeSettings(raw), sig = JSON.stringify(n); if (sig === sigS) return; sigS = sig; settings = n; emit('settings', n); };
  const applyLive = raw => { const n = normalizeLive(raw), sig = JSON.stringify(n); if (sig === sigL) return; sigL = sig; live = n; emit('live', n); };
  started = new Promise(resolve => {
    const settle = () => { if (gotS && gotL) { clearTimeout(timer); resolve(); } };
    const timer = setTimeout(() => { if (!gotS) applySettings(null); if (!gotL) applyLive(null); resolve(); }, 2000);
    const db = docdb();
    // a failing listener (rules not published yet, quota…) leaves the defaults in place — the app keeps running as v3.2
    db.doc('app/settings').watch(raw => { gotS = true; applySettings(raw); arrive(); settle(); },
      e => { console.warn('[settings] app/settings', e?.code || e); if (e?.code === 'permission-denied') { gotS = true; applySettings(null); arrive(); settle(); } });
    db.doc('app/live').watch(raw => { gotL = true; applyLive(raw); settle(); },
      e => { console.warn('[settings] app/live', e?.code || e); if (e?.code === 'permission-denied') { gotL = true; applyLive(null); settle(); } });
  });
  return started;
}

// ---- admin helpers ----------------------------------------------------------------------------------
const ID_RE = /^[A-Za-z0-9_]{1,32}$/;
const needId = id => { if (typeof id !== 'string' || !ID_RE.test(id)) throw fail('invalid-argument', `bad feature id: ${id}`); };
const BASE = { features: {}, safe: false, phase: 'auto', cfg: {} };   // a first save creates the document with every default in place

/** features[id] = true | false, or null = back to the manifest default. The whole `features` map is replaced (read → change → write). */
export async function setFeature(id, on) {
  needId(id);
  const ref = docdb().doc('app/settings'), cur = await ref.get();
  const features = { ...normalizeSettings(cur).features };
  if (on === null || on === undefined) delete features[id]; else features[id] = !!on;
  return cur ? ref.update({ features, updatedAt: ts() }) : ref.set({ ...BASE, features, updatedAt: ts() });
}

/** Safe mode: every feature that is not liveSafe is switched off (production only) */
export async function setSafe(on) {
  const ref = docdb().doc('app/settings'), cur = await ref.get();
  return cur ? ref.update({ safe: !!on, updatedAt: ts() }) : ref.set({ ...BASE, safe: !!on, updatedAt: ts() });
}

/** Emergency phase override: 'auto' or one of PHASES (rehearsals use ?phase= instead) */
export async function setPhaseOverride(p) {
  if (p !== 'auto' && !PHASES.includes(p)) throw fail('invalid-argument', `bad phase: ${p}`);
  const ref = docdb().doc('app/settings'), cur = await ref.get();
  return cur ? ref.update({ phase: p, updatedAt: ts() }) : ref.set({ ...BASE, phase: p, updatedAt: ts() });
}

/** cfg[id] = { ...current, ...patch } — only that feature's entry is written, so two admins editing different features do not clash */
export async function saveCfg(id, patch) {
  needId(id);
  if (!isMap(patch)) throw fail('invalid-argument', 'saveCfg(id, patch): patch must be an object');
  const ref = docdb().doc('app/settings'), cur = await ref.get();
  const merged = { ...(normalizeSettings(cur).cfg[id] || {}), ...patch };
  return cur ? ref.update({ ['cfg.' + id]: merged, updatedAt: ts() }) : ref.set({ ...BASE, cfg: { [id]: merged }, updatedAt: ts() });
}

/** app/live: set + merge. A cue change passes { cue, cueSeq: ctx.db.inc(1), cueAt: ctx.db.ts() }. */
export async function setLive(patch) {
  if (!isMap(patch)) throw fail('invalid-argument', 'setLive(patch): patch must be an object');
  return docdb().doc('app/live').set({ ...patch, updatedAt: ts() }, { merge: true });
}

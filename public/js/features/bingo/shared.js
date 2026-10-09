// ============================================================
//  WP-09 빙고 — 카드 · 줄 계산 · 코드 · 하객별 상태(로컬 우선 + bingo/{gid} 동기화)
// ============================================================
import { seeded, guestCode } from '../../core/ui.js';
import { MISSIONS, BY_ID, MIN_ON } from './missions.js';

export const SIZE = 4, CELLS = 16;
const SAVE_DEBOUNCE = 1200, RETRY_MS = 5000, GUESTS_TTL = 5 * 60e3;
const CODE_RE = /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/;
export const SIDES = ['groom', 'bride', 'both'];

/** the mission ids switched off by the couple (cfg.bingo.off) — never so many that a card can't be filled */
export function offList(cfg) {
  const off = Array.isArray(cfg?.off) ? cfg.off.filter(id => BY_ID.has(id)) : [];
  return MISSIONS.length - off.length >= MIN_ON ? off : [];
}

/** the same guest → the same 16 missions on every device (seeded shuffle of the pool minus the switched-off ones) */
export function cardFor(gid, off = []) {
  const pool = MISSIONS.map(m => m.id).filter(id => !off.includes(id));
  const r = seeded('bingo:' + gid);
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  return pool.slice(0, CELLS);
}

const LINES = (() => {
  const L = [];
  for (let r = 0; r < SIZE; r++) L.push([0, 1, 2, 3].map(c => r * SIZE + c));
  for (let c = 0; c < SIZE; c++) L.push([0, 1, 2, 3].map(r => r * SIZE + c));
  L.push([0, 5, 10, 15], [3, 6, 9, 12]);
  return L;
})();
/** completed lines of a card: rows 4 + columns 4 + diagonals 2 (max 10). done = Set | array of mission ids */
export function linesOf(card, done) {
  const has = done instanceof Set ? done : new Set(done);
  return LINES.filter(l => l.every(i => has.has(card[i]))).length;
}
export const cellsDone = (card, done) => card.filter(id => (done instanceof Set ? done : new Set(done)).has(id)).length;

/** "k7 qf" → "K7QF" · null when it cannot be a guest code */
export function cleanCode(s) {
  const c = String(s ?? '').toUpperCase().replace(/\s+/g, '');
  return CODE_RE.test(c) ? c : null;
}

/** the guest list (for codes and my own side/activity) — one read per 5 minutes per page */
export function guestBook(ctx) {
  let at = 0, list = null, pending = null;
  const load = () => {
    if (pending) return pending;
    pending = ctx.db.col('guests').get().then(docs => {
      list = docs.filter(d => !d.hidden).map(d => ({ id: String(d.id), name: String(d.name || '?').slice(0, 30), side: SIDES.includes(d.side) ? d.side : 'both', activity: String(d.activity || ''), code: guestCode(d.id) }));
      at = Date.now(); return list;
    }).finally(() => { pending = null; });
    return pending;
  };
  return {
    get: () => (list && Date.now() - at < GUESTS_TTL ? Promise.resolve(list) : load()),
    refresh: load,
    byId: id => list?.find(g => g.id === id) || null,
  };
}

/**
 * Check a code for a code mission. → { ok: true, who } | { ok: false, why: 'bad' | 'none' | 'self' | 'rule' }
 * A code nobody has → the list is read again once (a guest may have just signed).
 */
export async function checkCode(book, mission, myId, input) {
  const code = cleanCode(input);
  if (!code) return { ok: false, why: 'bad' };
  let list = await book.get(), who = list.find(g => g.code === code);
  if (!who) { list = await book.refresh(); who = list.find(g => g.code === code); }
  if (!who) return { ok: false, why: 'none' };
  if (who.id === myId) return { ok: false, why: 'self' };
  const me = list.find(g => g.id === myId) || { side: 'both', activity: '' };
  const fits = mission.rule === 'groom' ? who.side === 'groom'
    : mission.rule === 'bride' ? who.side === 'bride'
      : mission.rule === 'other' ? (me.side === 'both' || (who.side !== me.side))
        : mission.rule === 'act' ? (!!me.activity && who.activity === me.activity)
          : true;                                        // 'new': anybody but me
  return fits ? { ok: true, who } : { ok: false, why: 'rule' };
}

/**
 * One guest's bingo: local first (localStorage wgb_f_bingo_<gid>), merged with bingo/{gid} (one get at start), saved 1.2 s after a change.
 * The server keeps done as a growing union and lines as never-decreasing (rules). onChange(state) after every change.
 */
export function bingoState(ctx, gid, { cardOf, onChange, onLine }) {
  const KEY = 'wgb_f_bingo_' + gid;
  let done = new Set(), snaps = 0, server = { done: [], lines: 0 }, timer = null, saving = false, offline = false, lastLines = null;
  try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); if (v) { (v.done || []).forEach(id => BY_ID.has(id) && done.add(id)); snaps = Number(v.snaps) || 0; } } catch {}
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify({ done: [...done], snaps })); } catch {} };
  const state = () => { const card = cardOf(); return { gid, card, done, lines: linesOf(card, done), cells: cellsDone(card, done), snaps, offline }; };
  const changed = () => {
    const s = state();
    if (lastLines !== null && s.lines > lastLines) onLine?.(s);
    lastLines = s.lines;
    onChange?.(s);
  };

  function schedule(ms = SAVE_DEBOUNCE) { if (timer) timer(); timer = ctx.after(ms, save); }
  function save() {
    timer = null;
    if (saving) { schedule(); return; }
    const card = cardOf();
    // the server's done can only grow and holds at most 16: what it has + my newer cells (on my card first)
    const extra = [...done].filter(id => !server.done.includes(id)).sort((a, b) => card.includes(b) - card.includes(a));
    if (!extra.length && linesOf(card, done) <= server.lines) return;
    const next = [...server.done, ...extra].slice(0, Math.max(16, server.done.length));
    const lines = Math.max(server.lines, linesOf(card, next));
    saving = true;
    ctx.db.doc('bingo/' + gid).set({ done: next, lines, updatedAt: ctx.db.ts() }).then(ctx.guard(() => {
      server = { done: next, lines }; offline = false; changed();
    }), ctx.guard(e => {
      ctx.log('save failed', e?.code || e);
      offline = e?.code === 'unavailable'; changed();
      schedule(RETRY_MS);
    })).finally(ctx.guard(() => { saving = false; }));
  }

  // the server copy, once (another device of the same guest may have stamped cells)
  ctx.db.doc('bingo/' + gid).get().then(ctx.guard(d => {
    if (d) {
      server = { done: (Array.isArray(d.done) ? d.done : []).filter(id => BY_ID.has(id)), lines: Number.isInteger(d.lines) ? d.lines : 0 };
      server.done.forEach(id => done.add(id)); persist();
    }
    lastLines = linesOf(cardOf(), done);              // what was already there is not a "new bingo"
    onChange?.(state());
    if ([...done].some(id => !server.done.includes(id))) schedule();
  }), ctx.guard(e => { ctx.log('load failed', e?.code || e); lastLines = linesOf(cardOf(), done); onChange?.(state()); }));

  return {
    state,
    has: id => done.has(id),
    mark(id) { if (!BY_ID.has(id) || done.has(id)) return false; done.add(id); persist(); changed(); schedule(); return true; },
    addSnap() { snaps++; persist(); let any = false; if (this.mark('m5')) any = true; if (snaps >= 3 && this.mark('m23')) any = true; if (!any) changed(); return any; },
    recheck: () => changed(),                           // the card changed (missions switched off): lines again
    flush: () => { if (timer) { timer(); save(); } },
  };
}

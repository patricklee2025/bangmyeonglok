// ============================================================
//  WP-10 투표 — 페이지 공용 도우미 (순수 함수 + 투표 문서 구독)
// ============================================================
export const RE_PID = /^p[a-z0-9]{1,12}$/;
export const MAX_OPTS = 8;
export const KINDS = ['choice', 'guest'];

export const qText = (p, lang) => String(p?.q?.[lang] || p?.q?.ko || p?.q?.en || '');
export const optText = (o, lang) => String(o?.[lang] || o?.ko || o?.en || '');
export const norm = s => String(s ?? '').normalize('NFC').toLowerCase().replace(/\s+/g, '');

/** a poll document → a safe shape (unknown fields dropped). null stays null */
export function cleanPoll(d) {
  if (!d || !RE_PID.test(String(d.id || ''))) return null;
  const kind = KINDS.includes(d.kind) ? d.kind : 'choice';
  return {
    id: d.id, kind, q: { ko: String(d.q?.ko ?? ''), en: String(d.q?.en ?? '') },
    options: kind === 'choice' && Array.isArray(d.options) ? d.options.slice(0, MAX_OPTS).map(o => ({ ko: String(o?.ko ?? ''), en: String(o?.en ?? '') })) : [],
    open: d.open === true, order: Number.isInteger(d.order) ? d.order : 0,
    result: d.result && typeof d.result === 'object' ? d.result : null,
    createdAt: Number(d.createdAt) || 0,
  };
}

/** count the votes of one poll — result(choice) = { total, counts: [n…], top: [i…] } · result(guest) = { total, counts: { gid: n }, top: [gid…] } (ties: all) */
export function tally(poll, votes) {
  if (poll.kind === 'guest') {
    const counts = {}; let total = 0;
    for (const v of votes) if (v.pid === poll.id && typeof v.choice === 'string' && v.choice) { counts[v.choice] = (counts[v.choice] || 0) + 1; total++; }
    const max = Math.max(0, ...Object.values(counts));
    return { total, counts, top: max ? Object.keys(counts).filter(k => counts[k] === max).sort() : [] };
  }
  const n = poll.options.length, counts = new Array(n).fill(0); let total = 0;
  for (const v of votes) if (v.pid === poll.id && Number.isInteger(v.choice) && v.choice >= 0 && v.choice < n) { counts[v.choice]++; total++; }
  const max = Math.max(0, ...counts);
  return { total, counts, top: max ? counts.flatMap((c, i) => (c === max ? [i] : [])) : [] };
}

/** "A, B" — the winner(s) in words. nameOf(gid) for guest polls */
export const topText = (poll, result, lang, nameOf) => (result?.top || [])
  .map(t => (poll.kind === 'guest' ? nameOf(t) : optText(poll.options[t], lang))).filter(Boolean).join(', ');

/** choice-poll bars: [{ i, label, n, pct, top }] (pct of the biggest count, so the leader fills the bar) */
export function choiceRows(poll, result, lang) {
  const counts = result?.counts || [], max = Math.max(1, ...counts.map(Number).filter(Number.isFinite));
  return poll.options.map((o, i) => ({ i, label: optText(o, lang), n: Number(counts[i]) || 0, pct: Math.round(100 * (Number(counts[i]) || 0) / max), top: (result?.top || []).includes(i) }));
}

/** guest-poll leaders: [{ gid, n, top }] — at most `limit`, most votes first, then by id */
export function guestRows(result, limit = 5) {
  const c = result?.counts || {};
  return Object.keys(c).map(gid => ({ gid, n: Number(c[gid]) || 0, top: (result?.top || []).includes(gid) }))
    .sort((a, b) => b.n - a.n || (a.gid < b.gid ? -1 : 1)).slice(0, limit);
}

/**
 * The poll the TV / phones should show = app/live.poll → its document (one doc listener per page).
 * onPoll(poll | null) on every change. Returns nothing (everything is released through ctx).
 */
export function followLivePoll(ctx, onPoll) {
  let pid = null, off = null;
  ctx.onLive(live => {
    const next = typeof live?.poll === 'string' && RE_PID.test(live.poll) ? live.poll : null;
    if (next === pid) return;
    pid = next;
    if (off) { off(); off = null; }
    if (!pid) { onPoll(null); return; }
    const want = pid;
    off = ctx.db.doc('polls/' + pid).watch(d => { if (want === pid) onPoll(cleanPoll(d)); }, e => { ctx.log('poll watch', e?.code || e); });
  });
}

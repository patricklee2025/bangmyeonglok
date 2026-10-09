// ============================================================
//  WP-01 §3 — 마을 출석 필터 (live)
//  지금 마을에 있는 하객 = 체크인했거나 · 당일(현장) 등록했거나. 체크인 문서가 새로 오면 문에서 입장 + 배너.
//  gate 기능이라 마을은 첫 동기화 전에 이 setup 을 기다립니다 (02 §2.2) — 그래서 setup 은 체크인 첫 스냅샷(최대 1.5초)을 기다림.
// ============================================================
import { walkInSince } from './shared.js';

const FIRST_SNAPSHOT_MS = 1500;

export function setupVillage(ctx) {
  const v = ctx.v;
  if (!v?.setPresence) return;                           // a page without the village API (the loader's test page)
  if (ctx.phase() !== 'live') return;                    // pre: the D-day village is WP-03 — nothing to do here (S9)
  const showAll = () => !v.HOST && ctx.cfg()?.phonePresence === false;   // S7: the couple may let phones show everybody
  let phoneAll = showAll();
  const checked = new Set();
  let since = walkInSince(ctx), first = true;

  const names = new Map();                               // gid → name — filled while the core asks present() about every guest (no extra reads)
  const present = g => { names.set(g.id, g.name); return checked.has(g.id) || Number(g.createdAt) >= since; };
  const waiting = new Set();                             // checked in just now → banner when the villager really walks in (hidden guests never do)

  // the banner follows the arrival the core actually shows (village:arrived), so a hidden guest's check-in stays silent
  ctx.bus.on('village:arrived', ({ gid, via }) => {
    if (via !== 'checkin' || !waiting.delete(gid)) return;
    const name = v.villager(gid)?.g?.name || names.get(gid);
    if (name) v.banner(ctx.t('prereg_banner', { name }));
  });

  return new Promise(resolve => {
    let done = false;
    const ready = () => {
      if (done) return; done = true;
      if (!phoneAll) v.setPresence(present);
      resolve();
    };
    ctx.after(FIRST_SNAPSHOT_MS, () => { if (!done) { ctx.log('no check-in snapshot in time — nobody checked in yet'); ready(); } });
    ctx.db.col('checkins').watch((docs, changes) => {
      if (first) {                                       // the people already checked in: no arrivals, no banners (no banner storm at boot)
        first = false;
        docs.forEach(d => checked.add(d.id));
        if (done) v.refresh(); else ready();
        return;
      }
      let changed = false;
      for (const c of changes) {
        if (c.type === 'removed') { if (checked.delete(c.id)) changed = true; continue; }
        if (checked.has(c.id)) continue;
        checked.add(c.id); changed = true;
        if (!phoneAll) { waiting.add(c.id); v.arrive(c.id, { via: 'checkin' }); }   // the core skips its own arrival banner for via 'checkin'
      }
      if (changed) v.refresh();
    }, e => { ctx.log('checkins watch failed', e?.code || e); ready(); });
    // ⚙️ "phones show checked-in guests only" can change while the page is open
    ctx.onSettings(() => {
      const pa = showAll(); if (pa === phoneAll) return;
      phoneAll = pa; if (!done) return;
      if (pa) v.clearPresence(); else v.setPresence(present);
    });
    // the phase may be forced back (rehearsal ends) — re-read the walk-in boundary
    ctx.bus.on('phase', () => { since = walkInSince(ctx); v.refresh(); });
  });
}

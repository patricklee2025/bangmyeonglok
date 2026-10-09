// ============================================================
//  WP-05 · 📋 식순 연동 라이브 모드 (live) — docs/v4/wp/WP-05-live.md
//  관리자가 "다음 ▶"으로 식순을 넘기면 TV·폰 마을이 그 순간의 장면 + 배너 + 위 가운데(tc) 제목 "📋 반지 교환".
//  엄숙한 큐는 같은 쓰기에서 live.quiet = true (코어 조용 모드). 한 줄 공지(live.msg)는 제목 자리에.
//  데이터: app/live (관리자) · cfg.live.program
// ============================================================
import D from './i18n.js';
import { programOf, labelOf } from './program.js';
import { sceneDef } from './scenes.js';
import { setupAdmin } from './admin.js';

export const i18n = D;
export const css = true;

const FRESH_MS = 90e3;

export async function setup(ctx) {
  if (ctx.page === 'admin') return setupAdmin(ctx);
  if (ctx.page === 'village') return setupVillage(ctx);
}

function setupVillage(ctx) {
  const v = ctx.v;
  if (!v?.hud || !v.runScene) return;
  let lastSeq = null, cue = null, msg = null, dim = false, cakeProp = null;
  const program = () => programOf(ctx.cfg());

  // ---- the title line (tc): "📋 반지 교환" — or the announcement in its place
  const title = ctx.el('div', { cls: 'f-live-title', attrs: { role: 'status' } });
  let removeTitle = null;
  function paintTitle() {
    const lang = ctx.lang();
    const text = msg ? (msg[lang] || msg.ko || msg.en || '') : cue ? ctx.t('live_title', { label: labelOf(program().find(c => c.id === cue), lang) || cue }) : '';
    title.textContent = text;
    title.classList.toggle('f-live-msg', !!msg);
    if (text && !removeTitle) removeTitle = v.hud.add(title, { zone: 'tc', order: 20, phone: 'tc' });
    if (!text && removeTitle) { removeTitle(); removeTitle = null; }
  }

  // ---- tools the scenes use
  v.onDraw(g => { if (!dim) return; g.fillStyle = 'rgba(30, 36, 80, .12)'; g.fillRect(0, 0, v.W, v.H); }, { layer: 'fx' });
  const cakeImg = (() => {                                   // 18 × 16 px: a two-tier cake with a heart on top
    const c = document.createElement('canvas'); c.width = 18; c.height = 16; const g = c.getContext('2d');
    g.fillStyle = '#2b2033'; g.fillRect(1, 7, 16, 9); g.fillRect(4, 2, 10, 6);
    g.fillStyle = '#fff8ec'; g.fillRect(2, 8, 14, 7); g.fillRect(5, 3, 8, 5);
    g.fillStyle = '#ff9ec4'; g.fillRect(2, 8, 14, 2); g.fillRect(5, 3, 8, 1); g.fillRect(8, 0, 2, 2);
    return c;
  })();
  const tools = {
    v,
    dim: on => { dim = !!on; },
    cake: on => { if (on && !cakeProp) cakeProp = v.addProp({ img: cakeImg, x: 239, y: 64, base: 80, kind: 'live-cake' }); if (!on && cakeProp) { cakeProp.remove(); cakeProp = null; } },
  };

  function play(c, seq) {
    const def = c.scene !== 'none' ? sceneDef(c.scene, tools) : null;
    if (def) {
      v.runScene({
        key: 'f-live-' + c.scene, seed: seq, maxSec: 40,
        start: s => { def.start(s); if (ctx.demo) title.dataset.crowd = (s.c || []).map(h => h.gid).join(','); },
        update: (s, dt) => def.update(s, dt),
        end: s => { tools.dim(false); tools.cake(false); def.end?.(s); },
      });
    }
    const b = c.banner && (c.banner[ctx.lang()] || c.banner.ko || c.banner.en);
    if (b) v.banner(b, { kind: 'gold', priority: 'high' });
  }

  ctx.onLive(l => {
    msg = l?.msg && (l.msg.ko || l.msg.en) ? l.msg : null;
    const seq = Number.isFinite(l?.cueSeq) ? l.cueSeq : 0;
    if (seq !== lastSeq) {
      const boot = lastSeq === null;
      lastSeq = seq; cue = l?.cue || null;
      const fresh = !!(l?.cueAt && Date.now() - l.cueAt < FRESH_MS);
      const c = cue && program().find(x => x.id === cue);
      if (cue) {
        if (c && fresh && !boot) play(c, seq);                  // a cue the TV saw arrive (not one from before it opened)
        ctx.bus.emit('live:cue', { cue, seq, fresh: fresh && !boot });
      }
      title.dataset.cue = cue || ''; title.dataset.seq = String(seq); title.dataset.fresh = String(fresh && !boot);
    }
    paintTitle();
  });
  ctx.onSettings(() => paintTitle());
  ctx.bus.on('lang', paintTitle);
}

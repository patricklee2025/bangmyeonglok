// ============================================================
//  WP-06 — 공용: 원문 · 방향 · 낡음 판정 · 줄 다듬기
// ============================================================
import { detectLang } from '../../core/ui.js';

export const MAX = 600;
/** what a guest's message would be translated from: null = nothing to translate (empty · emoji only · private) */
export function sourceOf(g) {
  if (!g || g.priv) return null;
  const text = String(g.message ?? '').trim();
  if (!text || !/[\p{L}]/u.test(text)) return null;
  const src = detectLang(text), dst = src === 'ko' ? 'en' : 'ko';
  return { text, src, dst };
}
export const clip = s => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > MAX ? t.slice(0, MAX - 3) + '…' : t; };
/** the saved translation of a document if it still matches the message, else null */
export function savedFor(doc, s) {
  if (!doc || !s || doc.src !== s.src) return null;
  if (String(doc[doc.src] ?? '').trim() !== s.text) return null;
  const t = String(doc[s.dst] ?? '').trim();
  return t || null;
}
/** status of one guest: none · stale · chrome · manual */
export function statusOf(doc, s) {
  if (!doc) return 'none';
  if (!s || String(doc[doc.src] ?? '').trim() !== s.text || doc.src !== s.src) return 'stale';
  return doc.engine === 'manual' ? 'manual' : 'chrome';
}

// ============================================================
//  WP-07 MML 파서 — 'o4 l8 c d e+ f- g4. r < > x |' → [{ t, dur, midi | null, hit }]  (t·dur 은 박 단위, 4분음표 = 1박)
//  o<n> 옥타브 · l<n> 기본 길이 · c d e f g a b (+ 올림 / - 내림) · 길이 숫자 · 점(.) · r 쉼표 · 따로 떨어진 '.' 도 쉼표 · < > 옥타브 · x 노이즈 · | 무시
//  모르는 글자는 건너뜀 (곡 하나가 깨져도 나머지는 연주)
// ============================================================
const STEP = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

export function parse(src) {
  const s = String(src ?? '').toLowerCase();
  const out = [];
  let i = 0, oct = 4, len = 4, t = 0;
  const num = () => { let j = i; while (j < s.length && s[j] >= '0' && s[j] <= '9') j++; const v = j > i ? Number(s.slice(i, j)) : null; i = j; return v; };
  const dur = () => {                                        // length (optional) + dots right after it
    const n = num(); let d = 4 / (n && n > 0 ? n : len);
    let add = d / 2; while (s[i] === '.') { d += add; add /= 2; i++; }
    return d;
  };
  while (i < s.length) {
    const ch = s[i++];
    if (ch === ' ' || ch === '\n' || ch === '\t' || ch === '|' || ch === ',') continue;
    if (ch === 'o') { const n = num(); if (n !== null && n >= 0 && n <= 8) oct = n; continue; }
    if (ch === 'l') { const n = num(); if (n && n > 0) len = n; continue; }
    if (ch === '<') { oct = Math.max(0, oct - 1); continue; }
    if (ch === '>') { oct = Math.min(8, oct + 1); continue; }
    if (ch === 'r' || ch === '.') { const d = dur(); out.push({ t, dur: d, midi: null, hit: false }); t += d; continue; }
    if (ch === 'x') { const d = dur(); out.push({ t, dur: d, midi: null, hit: true }); t += d; continue; }
    if (ch in STEP) {
      let semi = STEP[ch];
      while (s[i] === '+' || s[i] === '#' || s[i] === '-') { semi += s[i] === '-' ? -1 : 1; i++; }
      const d = dur();
      out.push({ t, dur: d, midi: 12 * (oct + 1) + semi, hit: false });
      t += d; continue;
    }
    // anything else: ignored
  }
  return out;
}
/** total length in beats */
export const beats = events => events.reduce((a, e) => a + e.dur, 0);
export const hz = midi => 440 * Math.pow(2, (midi - 69) / 12);

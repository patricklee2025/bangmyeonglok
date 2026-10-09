// ============================================================
//  WP-06 번역 엔진 — 브라우저 내장 번역(Chrome Translator API)에 닿는 유일한 곳.
//  시험은 addInitScript 로 가짜 self.Translator 를 넣습니다 (전역 이름으로 접근하는 이유).
//  상태: 'none'(지원 안 함) · 'need-click'(모델 내려받기 = 사용자 동작 안에서 create) · 'downloading' · 'ready'
// ============================================================
const PAIRS = [['ko', 'en'], ['en', 'ko']];
const T = () => (typeof self !== 'undefined' && 'Translator' in self ? self.Translator : null);

export function makeEngine({ onState } = {}) {
  const made = new Map();                                  // 'ko>en' → translator
  let state = T() ? 'checking' : 'none', pct = 0, creating = null;
  const set = (s, p) => { state = s; if (p !== undefined) pct = p; onState?.(state, pct); };

  async function check() {
    const X = T();
    if (!X?.availability) { set('none'); return state; }
    let need = false, any = false;
    for (const [a, b] of PAIRS) {
      let av = 'unavailable';
      try { av = await X.availability({ sourceLanguage: a, targetLanguage: b }); } catch {}
      if (av === 'available') { any = true; if (!made.has(a + '>' + b)) await make(a, b).catch(() => {}); }
      else if (av === 'downloadable' || av === 'downloading') need = true;
    }
    if (made.size === PAIRS.length) set('ready', 100);
    else if (need) set('need-click');
    else set(any || made.size ? 'ready' : 'none');
    return state;
  }
  function make(a, b) {
    const X = T();
    return X.create({
      sourceLanguage: a, targetLanguage: b,
      monitor(m) { m.addEventListener?.('downloadprogress', e => { if (state !== 'ready') set('downloading', Math.round((Number(e.loaded) || 0) * 100)); }); },   // a late progress event never undoes "ready"
    }).then(tr => { made.set(a + '>' + b, tr); return tr; });
  }
  /** call inside a click / key handler: downloads the models if needed */
  function start() {
    if (creating) return creating;
    if (!T()) return Promise.resolve('none');
    set('downloading', pct);
    creating = Promise.all(PAIRS.filter(([a, b]) => !made.has(a + '>' + b)).map(([a, b]) => make(a, b).catch(() => null)))
      .then(() => { creating = null; set(made.size ? 'ready' : 'none', 100); return state; });
    return creating;
  }
  /** text → translation | null (no engine for that direction, error, or 5 s timeout) */
  async function translate(text, src, dst, ms = 5000) {
    const tr = made.get(src + '>' + dst);
    if (!tr) return null;
    let timer;
    try {
      const out = await Promise.race([tr.translate(text), new Promise(res => { timer = setTimeout(() => res(null), ms); })]);
      return typeof out === 'string' ? out : null;
    } catch { return null; } finally { clearTimeout(timer); }
  }
  return { check, start, translate, state: () => state, pct: () => pct, can: (src, dst) => made.has(src + '>' + dst) };
}

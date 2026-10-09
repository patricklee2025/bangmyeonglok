// ============================================================
//  WP-05 기본 식순 (§3 — Q-005 실제 식순이 오면 관리자 📋 식순 탭에서 고치거나 이 표를 바꿉니다)
//  큐 = { id, ko, en, scene, quiet, event, banner: { ko, en } | null, on }
// ============================================================
export const SCENES = ['none', 'cheer', 'aisle', 'hush', 'rings', 'kiss', 'sway', 'recessional', 'feast', 'cheers', 'firstdance', 'cake', 'bow'];
export const EVENTS = ['', 'group', 'bouquet', 'fireworks'];

const C = (id, ko, en, scene, quiet = false, event = '', banner = null, on = true) => ({ id, ko, en, scene, quiet, event, banner, on });
export const DEFAULT_PROGRAM = [
  C('doors', '하객 입장', 'Guests arriving', 'none'),
  C('groom', '신랑 입장', 'Groom\'s entrance', 'cheer', true),
  C('bride', '신부 입장', 'Bride\'s entrance', 'aisle', true),
  C('vows', '혼인 서약', 'Vows', 'hush', true),
  C('rings', '반지 교환', 'Ring exchange', 'rings', true),
  C('declare', '성혼 선언', 'Pronouncement', 'kiss', false, '', { ko: '💍 결혼을 축하합니다!', en: '💍 Just married!' }),
  C('song', '축가', 'Wedding song', 'sway', true),
  C('march', '행진', 'Recessional', 'recessional', false, '', { ko: '🎉 신랑·신부 행진!', en: '🎉 Here they come!' }),
  C('photo', '사진 촬영', 'Group photo', 'none', false, 'group'),
  C('dinner', '식사', 'Dinner', 'feast', false, '', { ko: '🍽 맛있게 드세요!', en: '🍽 Enjoy your meal!' }),
  C('toast', '건배', 'Toast', 'cheers', false, '', { ko: '🥂 건배!', en: '🥂 Cheers!' }),
  C('firstdance', '첫 댄스', 'First dance', 'firstdance', false, '', { ko: '💃 두 사람의 첫 댄스', en: '💃 First dance' }),
  C('bouquet', '부케 던지기', 'Bouquet toss', 'none', false, 'bouquet'),
  C('cake', '케이크 커팅', 'Cake cutting', 'cake', false, '', { ko: '🎂 케이크 커팅!', en: '🎂 Cake time!' }),
  C('pyebaek', '폐백', 'Pyebaek', 'bow', false, '', null, false),
  C('farewell', '감사 인사', 'Thank you', 'none', false, 'fireworks', { ko: '🙏 와주셔서 감사합니다!', en: '🙏 Thank you for coming!' }),
];

const str = (v, n) => String(v ?? '').slice(0, n);
/** cfg.live.program (what the admin saved) → a clean list; nothing usable → the default */
export function programOf(cfg) {
  const list = Array.isArray(cfg?.program) ? cfg.program : null;
  if (!list || !list.length) return DEFAULT_PROGRAM.map(c => ({ ...c }));
  const seen = new Set(), out = [];
  for (const c of list.slice(0, 40)) {
    const id = str(c?.id, 24).replace(/[^a-z0-9_-]/gi, '');
    if (!id || seen.has(id)) continue; seen.add(id);
    const banner = c.banner && (c.banner.ko || c.banner.en) ? { ko: str(c.banner.ko, 60), en: str(c.banner.en, 60) } : null;
    out.push({ id, ko: str(c.ko, 30) || id, en: str(c.en, 30) || str(c.ko, 30) || id, scene: SCENES.includes(c.scene) ? c.scene : 'none', quiet: c.quiet === true, event: EVENTS.includes(c.event) ? c.event : '', banner, on: c.on !== false });
  }
  return out.length ? out : DEFAULT_PROGRAM.map(c => ({ ...c }));
}
export const labelOf = (c, lang) => (c ? (lang === 'en' ? c.en || c.ko : c.ko || c.en) : '');

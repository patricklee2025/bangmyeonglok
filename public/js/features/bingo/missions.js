// ============================================================
//  WP-09 빙고 — 미션 풀 24개 (§3). 글자는 i18n.js 의 bingo_m<n>(전체) · bingo_s<n>(칸에 쓰는 짧은 글)
//  kind: code(다른 하객의 4글자 코드) · auto(이벤트가 오면 저절로) · honor(완료 버튼)
// ============================================================
export const MISSIONS = [
  { id: 'm0', kind: 'code', rule: 'groom', icon: '🤵' },
  { id: 'm1', kind: 'code', rule: 'bride', icon: '👰' },
  { id: 'm2', kind: 'code', rule: 'new', icon: '🤝' },
  { id: 'm3', kind: 'code', rule: 'other', icon: '🔀' },
  { id: 'm4', kind: 'code', rule: 'act', icon: '🎈' },
  { id: 'm5', kind: 'auto', auto: 'snap', icon: '📷' },
  { id: 'm6', kind: 'auto', auto: 'remote', icon: '🎮' },
  { id: 'm7', kind: 'auto', auto: 'vote', icon: '🗳' },
  { id: 'm8', kind: 'honor', icon: '✋' },
  { id: 'm9', kind: 'honor', icon: '🤳' },
  { id: 'm10', kind: 'honor', icon: '🙇' },
  { id: 'm11', kind: 'honor', icon: '🌏' },
  { id: 'm12', kind: 'honor', icon: '👶' },
  { id: 'm13', kind: 'honor', icon: '💭' },
  { id: 'm14', kind: 'honor', icon: '📜' },
  { id: 'm15', kind: 'honor', icon: '🍰' },
  { id: 'm16', kind: 'honor', icon: '💃' },
  { id: 'm17', kind: 'honor', icon: '💐' },
  { id: 'm18', kind: 'honor', icon: '🥂' },
  { id: 'm19', kind: 'honor', icon: '📺' },
  { id: 'm20', kind: 'honor', icon: '🎂' },
  { id: 'm21', kind: 'honor', icon: '🖼' },
  { id: 'm22', kind: 'honor', icon: '💌' },
  { id: 'm23', kind: 'auto', auto: 'snap3', icon: '📸' },
];
export const BY_ID = new Map(MISSIONS.map(m => [m.id, m]));
export const MIN_ON = 16;                                // a card needs 16 missions: at most 8 can be switched off

// i18n keys, spelled out (the static check reads literal keys)
export const FULL = { m0: 'bingo_m0', m1: 'bingo_m1', m2: 'bingo_m2', m3: 'bingo_m3', m4: 'bingo_m4', m5: 'bingo_m5', m6: 'bingo_m6', m7: 'bingo_m7', m8: 'bingo_m8', m9: 'bingo_m9', m10: 'bingo_m10', m11: 'bingo_m11', m12: 'bingo_m12', m13: 'bingo_m13', m14: 'bingo_m14', m15: 'bingo_m15', m16: 'bingo_m16', m17: 'bingo_m17', m18: 'bingo_m18', m19: 'bingo_m19', m20: 'bingo_m20', m21: 'bingo_m21', m22: 'bingo_m22', m23: 'bingo_m23' };
export const SHORT = { m0: 'bingo_s0', m1: 'bingo_s1', m2: 'bingo_s2', m3: 'bingo_s3', m4: 'bingo_s4', m5: 'bingo_s5', m6: 'bingo_s6', m7: 'bingo_s7', m8: 'bingo_s8', m9: 'bingo_s9', m10: 'bingo_s10', m11: 'bingo_s11', m12: 'bingo_s12', m13: 'bingo_s13', m14: 'bingo_s14', m15: 'bingo_s15', m16: 'bingo_s16', m17: 'bingo_s17', m18: 'bingo_s18', m19: 'bingo_s19', m20: 'bingo_s20', m21: 'bingo_s21', m22: 'bingo_s22', m23: 'bingo_s23' };
export const RULE = { groom: 'bingo_rule_groom', bride: 'bingo_rule_bride', other: 'bingo_rule_other', act: 'bingo_rule_act' };

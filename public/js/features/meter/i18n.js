// WP-08 마음 온도계 문구 — 키는 전부 'meter_' 로 시작 (02 §1)
const D = {
  ko: {
    meter_title: '마음 온도',
    meter_value: '{t}℃',
    meter_milestone: '🌡 마음 온도 {t}℃ 돌파!',
    meter_boil: '🔥 마음 온도 100℃! 사랑이 끓어 넘쳐요',
    meter_cfg_expected: '예상 하객 수 (온도계 목표 계산)',
    meter_cfg_target: '목표 점수 직접 지정 (비우면 자동)',
    meter_cfg_now: '지금 목표 = {n}점',
    // ---- 문서 표 밖 ----
    meter_cfg_save: '💾 저장',
    meter_cfg_saved: '✅ 저장했어요',
    meter_cfg_fail: '실패: {e}',
    meter_cfg_formula: '점수 = 하객 10 · 스냅 5 · 리모컨 1 · 빙고 줄 3 · 투표 2',
  },
  en: {
    meter_title: 'Love-o-meter',
    meter_value: '{t}°C',
    meter_milestone: '🌡 Love-o-meter hit {t}°C!',
    meter_boil: '🔥 100°C! Love is boiling over!',
    meter_cfg_expected: 'Expected guests (sets the goal)',
    meter_cfg_target: 'Custom goal score (blank = auto)',
    meter_cfg_now: 'Current goal = {n} points',
    meter_cfg_save: '💾 Save',
    meter_cfg_saved: '✅ Saved',
    meter_cfg_fail: 'Failed: {e}',
    meter_cfg_formula: 'Score = guests 10 · snaps 5 · remote 1 · bingo lines 3 · votes 2',
  },
};
export default D;

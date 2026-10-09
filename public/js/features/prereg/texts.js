// WP-01 §5·§6 — 결혼식 전(pre) 동안 덮어쓰는 코어 문구 (ctx.texts). 이 6개 키만 허락됨.
/** core texts this feature overrides in the pre phase (WP-01 §6 — the only keys it may touch) */
export const OVERRIDE = {
  ko: {
    start: '🏡 마을에 미리 입주하기',
    welcome_sub: '결혼식 전에 내 픽셀 캐릭터를 만들어 두면,\n결혼식 날 체크인할 때 TV 마을에 짠! 하고 등장해요',
    done_title: '입주 완료! 🏡',
    done_sub: '결혼식 날 입구에서 체크인하면 TV 마을에 등장해요',
    already: '이미 입주하셨어요! 입장권은 아래에 있어요',
    view_village: '마을 구경하기',            // the core link already starts with 🏡
  },
  en: {
    start: '🏡 Move in early',
    welcome_sub: 'Make your pixel character now —\nit pops into the village on the big screen when you check in on the day',
    done_title: 'You\'ve moved in! 🏡',
    done_sub: 'Check in at the entrance on the day to appear on the big screen',
    already: 'You\'ve already moved in! Your ticket is below.',
    view_village: 'Peek at the village',
  },
};

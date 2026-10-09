// v4 기능 매니페스트. 각 WP는 "자기 줄의 status" 만 바꿉니다 (planned → beta). ready 는 Patrick 이 지정.
// 2026-10-08 Patrick: 만든 기능 10개를 지금 기본 켜짐(ready)으로 — 관리자 ⚙️ "끄기"로 언제든 개별로 끌 수 있음.
// bgm은 beta·기본 꺼짐 유지 (식장 음악은 리허설에서 결정 — core-features-static 규칙): 관리자 ⚙️에서 켜기 + 🎵 체크.
// 필드 설명: docs/v4/02-contracts.md §2
const F = (id, wp, ko, en, pages, phases, opt = {}) => ({
  id, wp, name: { ko, en }, pages, phases,
  simple: opt.simple ?? true, liveSafe: opt.liveSafe ?? false, gate: opt.gate ?? false,
  status: opt.status ?? 'planned', default: opt.default ?? true,
  load: () => import(`./${id}/index.js`),
});
const ALL = ['pre', 'live', 'after', 'anniversary'];

export const FEATURES = [
  F('prereg',      'WP-01', '사전 입주 · 체크인 · 입장권', 'Move-in & check-in', ['guest', 'kiosk', 'village', 'admin'], ['pre', 'live'], { liveSafe: true, gate: true, status: 'ready' }),
  F('couple',      'WP-02', '커플 캐릭터',               'Couple characters', ['guest', 'kiosk', 'village', 'admin'], ALL, { liveSafe: true }),
  F('dday',        'WP-03', 'D-day 마을',                'D-day village',     ['guest', 'village'], ['pre'], { status: 'ready' }),
  F('story',       'WP-04', '커플 스토리 표지판',         'Our story signs',   ['village', 'admin'], ALL, { liveSafe: true }),
  F('live',        'WP-05', '식순 라이브 모드',           'Live program',      ['village', 'admin'], ['live'], { status: 'ready' }),
  F('translate',   'WP-06', '덕담 번역',                 'Message translation', ['village', 'admin'], ['live', 'after', 'anniversary'], { status: 'ready' }),
  F('bgm',         'WP-07', '8비트 BGM · 효과음',         '8-bit music',       ['village', 'admin'], ALL, { default: false, status: 'beta' }),
  F('meter',       'WP-08', '마음 온도계',               'Love-o-meter',      ['village', 'admin'], ['live'], { status: 'ready' }),
  F('bingo',       'WP-09', '양가 섞이기 빙고',           'Mix & Mingle Bingo', ['guest', 'village', 'admin'], ['live'], { simple: false, status: 'ready' }),
  F('poll',        'WP-10', '실시간 투표',               'Live polls',        ['guest', 'village', 'admin'], ['live'], { status: 'ready' }),
  F('card',        'WP-11', '내 픽셀 카드',              'My pixel card',     ['guest', 'village'], ALL, { status: 'ready' }),
  F('fourcut',     'WP-12', '픽셀 네컷',                 'Pixel photo strip', ['guest'], ['live', 'after'], { simple: false, status: 'ready' }),
  F('offline',     'WP-13', '오프라인 대비',              'Offline support',   ['guest', 'kiosk', 'village', 'admin'], ALL, { liveSafe: true, status: 'ready' }),
  F('archive',     'WP-14', '추억 마을 아카이브',         'Memory Village archive', ['guest', 'village', 'admin'], ['after', 'anniversary'], { liveSafe: true }),
  F('thanks',      'WP-15', '하객별 감사 카드',           'Thank-you cards',   ['guest', 'admin'], ['after', 'anniversary']),
  F('photobook',   'WP-16', '포토북 PDF',               'Photobook PDF',     ['admin'], ['after', 'anniversary']),
  F('postcard',    'WP-17', '신혼여행 엽서',              'Honeymoon postcards', ['guest', 'village', 'admin'], ['after', 'anniversary']),
  F('anniversary', 'WP-18', '1주년 재개장',              '1st anniversary',   ['guest', 'village', 'admin'], ['anniversary']),
  // 2026-10 추가 (Patrick 요청 — WP 문서: docs/v4/wp/WP-19-wall.md · WP-20-tv.md)
  F('wall',        'WP-19', '방명록 모아보기',            'Guestbook wall',    ['guest', 'village'], ALL, { liveSafe: true, status: 'ready' }),       // Patrick 2026-10-07: 기본 켜짐
  F('tv',          'WP-20', '마을 TV (유튜브)',           'Village TV (YouTube)', ['village', 'admin'], ['pre', 'live'], { liveSafe: true, status: 'ready' }),   // 기본 켜짐 (주소 없으면 "곧 방송") · 2026-10-08 Patrick: 결혼식 전(pre)부터 보이게
  // 코어 점검용 (데모 전용, 영원히 planned)
  F('_selftest',   'WP-00c', '코어 자체 점검',            'Core self-test',    ['guest', 'kiosk', 'village', 'admin'], ALL, { liveSafe: true, default: false }),
];

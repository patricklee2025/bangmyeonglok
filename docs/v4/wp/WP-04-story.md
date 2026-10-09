# WP-04 · 🪧 커플 스토리 표지판 (`story`)

| 항목 | 값 |
|---|---|
| 브랜치 | `wp/04-story` · 선행: WP-00c · 마감 M1 |
| 매니페스트 | pages `village admin` · phases 전부 · simple ✓ · liveSafe ✓ |
| 허락된 파일 | `public/js/features/story/**` · `public/img/story/*.jpg` (사진, 각 ≤ 200KB) · `tests/features/story.mjs` · `docs/guide/story.md` · 매니페스트 줄 · STATUS/CHANGELOG |
| 데이터 | 없음 (정적 콘텐츠 파일). 관리자 설정 `cfg.story` |
| 결정 필요 | **Q-004** 스토리 내용·사진. 없으면 자리표시자 콘텐츠로 구현하고 보고서에 표시 |

## 1. 목적
마을 곳곳에 나무 표지판 6–8개를 세워 두 사람의 이야기(첫 만남 → 첫 데이트 → … → 결혼)를 들려준다.
TV에서는 가끔 가운데에 이야기 카드가 뜨고, 폰에서는 표지판을 눌러 읽는다. 하객끼리 대화거리가 된다.

## 2. 콘텐츠 — `features/story/content.js`
```js
export const CHAPTERS = [
  { id: 'meet', date: '2019-05', sign: [3, 5],
    place: { ko: '…', en: '…' }, title: { ko: '첫 만남', en: 'How we met' },
    text: { ko: '2–3문장', en: '2–3 sentences' }, photo: 'img/story/01.jpg' /* 또는 null */ },
  // … 6–8개
];
```
- 표지판 자리(타일, 기본안 — 다른 소품과 겹치면 ±1타일 조정): `[3,5] [8,8] [12,13] [19,6] [22,9] [26,11] [5,10] [16,15]`
- 사진: 가로 4:3, 800×600 JPEG 품질 0.8, ≤ 200KB, 파일명 `01.jpg`…. 사진 없는 장도 됨.
- 자리표시자(Q-004 전): 제목 "이야기 1"…, 본문 `story_placeholder`.

## 3. 시나리오
| # | 기기 | 흐름 |
|---|---|---|
| S1 | TV | 표지판 소품 8개 상시. `cfg.story.everyMin`(기본 4)분마다 스포트라이트에 다음 장 카드 9초 + 해당 표지판 반짝임 |
| S2 | 폰 마을 | 표지판 탭 → 시트(그 장) · [← 이전] [다음 →] · 표지판 근처 첫 방문 시 토스트 `story_tap_hint` 1번 |
| S3 | 폰 마을 | 액션(⋯ 안, order 45) "📖 우리 이야기" → 1장부터 시트 |
| S4 | 관리자 | ⚙️ 설정 섹션: 표시 간격(2–10분), 사진 보이기, 장 목록 미리보기(제목·사진 썸네일) |
| S5 | 조용 모드·이벤트 중 | 스포트라이트 대기 (코어 처리) — 표지판 소품은 그대로 |

## 4. 카드 디자인 (스포트라이트 · 시트 공용 DOM, CSS `f-story-*`)
나무 액자(픽셀 테두리 `#8c6236`/`#b98a5c`) · 상단 "📖 우리 이야기 · 3 / 8" · 제목(굵게) · 날짜·장소 한 줄 · 사진(있으면, 4:3) · 본문 · 아래 점 ●○○.
TV 크기: 스포트라이트 상자 너비 기준. 글자: 제목 1.4em, 본문 1em, 줄 수 최대 4.

## 5. 문구
| 키 | KO | EN |
|---|---|---|
| story_title | 📖 우리 이야기 | 📖 Our story |
| story_chapter | {n} / {total} | {n} / {total} |
| story_prev | ← 이전 | ← Prev |
| story_next | 다음 → | Next → |
| story_tap_hint | 표지판을 누르면 두 사람 이야기가 나와요 | Tap a sign to read our story |
| story_action | 📖 우리 이야기 | 📖 Our story |
| story_placeholder | (내용 준비 중) | (coming soon) |
| story_cfg_every | TV에 이야기 카드 간격 (분) | Story card interval on TV (min) |
| story_cfg_photos | 사진 보이기 | Show photos |
| story_cfg_preview | 장 목록 미리보기 | Chapter preview |

## 6. 구현 메모
- 표지판 이미지: 한 번 그린 캔버스 재사용 (말뚝 + 판, 16×20 px, 표지판마다 작은 아이콘 1px 장식만 다르게).
- 탭 판정: `ctx.v.onTap(({ wx, wy }) => …)` — 표지판 상자(w/h) 안이면 열기. 주민 탭보다 표지판 우선.
- 반짝임: 카드가 뜰 때 `ctx.v.fx.sparkle(x, y-14, 12, ['#ffd75e', '#ffffff'])`.
- 사진은 `<img loading="lazy">`. TV는 다음 장 사진을 미리 로드.

## 7. 수용 기준 → `tests/features/story.mjs`
| # | 기준 |
|---|---|
| A1 | 04 §4.1 S1–S8 |
| A2 | 표지판 8개가 지정 타일에 (소품 목록 검사) · 서로·코어 소품과 겹치지 않음(상자 교차 검사) |
| A3 | TV: `setCfg({ everyMin: 0.05 })` → 3초 안에 카드 1장 → 다음 주기에 2장째 (순서대로) |
| A4 | 폰: 표지판 탭 → 시트 · 다음/이전 · 마지막에서 다음 = 처음 |
| A5 | 사진 없는 장 · `photos:false` 설정 → 사진 영역 없음 |
| A6 | 영어 카드 · 레이아웃(phoneSE 시트, TV 카드) 겹침 0 |
| A7 | 조용 모드에서 카드 안 뜸 (코어) |

## 8. 수동 QA
신랑·신부가 문구·사진 최종 확인 (TV·폰). 사진 얼굴이 TV에서 너무 크게 나오지 않는지.

## 9. 롤백
끄면 표지판·카드 사라짐.

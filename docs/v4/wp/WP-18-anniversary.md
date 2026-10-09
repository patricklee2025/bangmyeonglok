# WP-18 · 🎂 1주년 재개장 (`anniversary`)

| 항목 | 값 |
|---|---|
| 브랜치 | `wp/18-anniversary` · 선행: WP-00c (WP-02 `anniv` 모습, WP-14 아카이브와 함께 동작) · 마감 **2028-03-15** |
| 매니페스트 | pages `guest village admin` · phases `anniversary` · simple ✓ · liveSafe ✗ |
| 허락된 파일 | `public/js/features/anniversary/**` · `tests/features/anniversary.mjs` · `docs/guide/anniversary.md` · 매니페스트 줄 · STATUS/CHANGELOG |
| 데이터 | `anniv/{gid}` (하객 1인 1개, 2028-04-03 ~ 04-23 UTC) |
| 결정 필요 | Q-016 (기간·새 하객 허용) · Q-015 (아카이브 모드와의 관계) |

## 1. 목적
결혼 1주년(2028-04-10)부터 7일 동안 마을을 **기념일 모습으로 다시 연다.** 하객들이 1년 전 자기 캐릭터와 덕담을 다시 보고,
두 사람에게 1주년 축하 한마디를 남긴다. (같은 날 관리자 화면의 타임캡슐도 열림 — v3.2 기능)

## 2. 시나리오
| # | 기기 | 흐름 |
|---|---|---|
| S1 | 하객 페이지 | 환영 슬롯 order 5 카드 하나 (코어 제목 위에 끼울 자리는 없으므로 카드 맨 위 머리글로): 머리글 `anniversary_hero` "🎂 결혼 1주년! 마을이 다시 열렸어요" · 기억된 하객이면 "1년 전 {name}님" (캐릭터 + 그날 덕담 + 작성 시각 "2027.04.10 오후 6:12") + [🎂 1주년 축하 한마디 남기기] / 아니면 [🏡 마을 보기] |
| S2 | 한마디 남기기 | 화면 `f-anniversary-write`: 300자 입력 → `anniv/{gid}` 생성 → "고마워요! TV 마을에 나와요" · 1인 1개(이미 남겼으면 내 한마디 보기) |
| S3 | 마을 | 장식: 풍선 다발 4곳·"1st Anniversary" 현수막 소품·제단 케이크 · 신랑·신부 `anniv` 모습(WP-02 있으면) · 가끔 색종이(5분마다, 조용 모드 없음) |
| S4 | TV | 티커 앞머리 `ctx.v.setTickerPrefix(() => ctx.t('anniversary_ticker', { n }))` "1년 전 오늘 · " + 기존 덕담 순환 · 스포트라이트: 1주년 한마디 카드(새로 온 것 우선, 그다음 순환, `cfg.anniversary.everyMin` 기본 2) · 새 한마디 → 배너 "🎂 {name}님의 1주년 축하!" |
| S5 | 폰 마을 | 액션 order 50 "🎂" → 시트: 1주년 한마디 목록(최신순) |
| S6 | 관리자 탭 "🎂 1주년"(order 85) | 한마디 목록(삭제) · 수 · 설정(새 하객 방명록 허용 `allowNew`, 스포트라이트 간격) · 안내: "타임캡슐 탭이 오늘 열렸어요" · 백업 `f-anniversary/anniv.json` |
| S7 | 새 방문자(기억된 하객 없음) | `allowNew`(기본 true)면 v3.2 방명록 시작 버튼 유지(새 캐릭터 입주) · false면 `ctx.rootClass('nonew')` + CSS `html.f-anniversary-nonew #s-welcome .start-btns { display: none }` (코어 DOM은 건드리지 않음) |
| S8 | 2029년 이후 기념일 | 문구 "결혼 {n}주년" 자동(n = 연도 차) · 규칙상 한마디 쓰기는 2028 기간만 → 쓰기 UI 숨기고 보기만 |
| S9 | 아카이브 모드 (`ctx.db.backend === 'archive'`) | 장식·"1년 전" 보기는 동작, 쓰기 UI 숨김 + 자기 문구 `anniversary_readonly` 안내 (다른 기능의 키 `archive_readonly`는 쓸 수 없음 — `ctx.t`는 자기 문구 → 코어 문구만 찾음) |

## 3. 데이터
```js
anniv/{gid} = { text (1–300), createdAt: ts() }   // 생성만, 수정 없음
```
- 쓰기 가능 창: 규칙과 같게 `2028-04-03T00:00Z ≤ now < 2028-04-24T00:00Z` (`features/anniversary/window.js` 상수, 정적 테스트가 규칙과 비교).
- 구독: TV·폰 마을·관리자 = `col('anniv').watch` (≤ 하객 수).
- "1년 전" 덕담은 코어 하객 데이터(Firebase 또는 아카이브).

## 4. 문구
| 키 | KO | EN |
|---|---|---|
| anniversary_hero | 🎂 결혼 {n}주년! 마을이 다시 열렸어요 | 🎂 {n}-year anniversary! The village is open again |
| anniversary_year_ago | {n}년 전 {name}님 | {name}, {n} year(s) ago |
| anniversary_wrote_at | {date}에 남긴 덕담 | Your message from {date} |
| anniversary_write | 🎂 축하 한마디 남기기 | 🎂 Leave an anniversary note |
| anniversary_write_ph | 두 사람의 1주년을 축하해주세요 | Congratulate the couple on their anniversary |
| anniversary_send | 보내기 | Send |
| anniversary_thanks | 고마워요! TV 마을에 나와요 | Thank you! It'll show up in the village |
| anniversary_mine | 내가 남긴 한마디 | My note |
| anniversary_ticker | {n}년 전 오늘 · | {n} year(s) ago today · |
| anniversary_banner | 🎂 {name}님의 1주년 축하! | 🎂 Anniversary wishes from {name}! |
| anniversary_list | 🎂 1주년 축하 한마디 | 🎂 Anniversary notes |
| anniversary_action | 🎂 1주년 | 🎂 Anniversary |
| anniversary_tab | 🎂 1주년 | 🎂 Anniversary |
| anniversary_capsule_hint | 💌 타임캡슐이 열렸어요 — 타임캡슐 탭에서 읽어보세요 | 💌 The time capsule is open — see the Time Capsule tab |
| anniversary_cfg_new | 새 하객도 방명록 쓰기 허용 | Allow new guests to sign |
| anniversary_cfg_every | TV 한마디 카드 간격 (분) | Note card interval on TV (min) |
| anniversary_closed | 축하 한마디는 기념일 기간에만 남길 수 있어요 | Notes can only be left during the anniversary week |
| anniversary_readonly | 지금은 보기만 할 수 있어요 | This page is view-only now |

## 5. 수용 기준 → `tests/features/anniversary.mjs` (`?phase=anniversary` + `page.clock.setFixedTime('2028-04-12T12:00:00-04:00')`)
| # | 기준 |
|---|---|
| A1 | 04 §4.1 S1–S9 |
| A2 | 기억된 하객: "1년 전" 카드(이름·덕담·날짜), 쓰기 → 문서 생성, 두 번째는 "내가 남긴 한마디" |
| A3 | TV: 장식 소품, 티커 앞머리, 새 한마디 배너·스포트라이트 |
| A4 | 기간 밖(2028-04-25로 시계) → 쓰기 UI 없음, 스키마 거울도 거부 |
| A5 | 2029-04-12 → "결혼 2주년", 쓰기 없음 |
| A6 | `allowNew:false` → 새 방문자 시작 버튼 숨김(`html.f-anniversary-nonew`) · 기능 끄면 클래스·숨김 사라짐 |
| A7 | 아카이브 모드(`?archive=`) → 읽기만, `anniversary_readonly` 안내 |
| A8 | 정적: window.js 날짜 = firestore.rules anniv 날짜 |
| A9 | TV 티커: 앞머리 "1년 전 오늘 · " + 메시지 같은 줄 · 기능 끄면 앞머리 없음 (setTickerPrefix 해제) |
| A10 | 관리자 ZIP 백업에 `f-anniversary/anniv.json` — 한마디 수 일치 |

## 6. 수동 QA
2028-03 리허설: `?phase=anniversary`로 폰·TV 확인 · 실제 기념일 전날 관리자에서 확인.

## 7. 롤백
끄면 장식·카드 사라짐(평소 after 모습). 데이터 남음.

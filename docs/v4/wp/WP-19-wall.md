# WP-19 · 💌 방명록 모아보기 (`wall`)

| 항목 | 값 |
|---|---|
| 브랜치 | `wp/19-20-wall-tv` (WP-20과 함께, 코어 준비 포함) · 선행: WP-00c |
| 매니페스트 | pages `guest village` · phases 전부 · simple ✓ · liveSafe ✓ · status `ready` (기본 켜짐 — Patrick 2026-10-07) |
| 허락된 파일 | `public/js/features/wall/**` · `tests/features/wall.mjs` · `docs/guide/wall.md` · 매니페스트 줄 · STATUS/CHANGELOG |
| 코어 접점 (이 WP와 함께 설계자가 만든 것) | "💌 신랑·신부에게만" 메시지 — 작성 화면 체크박스 · `guests.priv` · `notes/{gid}`(관리자 전용) · 규칙 · TV/관리자 표시 (아래 §4) |
| 데이터 | `guests` 읽기만 (`ctx.db.col('guests').get()`) — 새 컬렉션 없음 |
| 결정 | Patrick 2026-10-07: "쓴 하객만 볼 수 있게 + '신랑신부에게만' 체크" |

## 1. 목적
방명록을 쓴 하객이 **다른 하객들이 남긴 방명록**(이름 · 캐릭터 · 구분 · 메시지)을 폰에서 읽을 수 있게 한다.
사진 · 음성 · 타임캡슐은 어디에도 나오지 않는다(지금처럼 신랑·신부 전용). 작성할 때 "💌 신랑·신부에게만 보여주기"를 고르면
그 메시지는 다른 하객 · TV · 이 기능 어디에도 본문이 나오지 않는다.

## 2. 시나리오
| # | 기기 | 흐름 |
|---|---|---|
| S1 | 하객 폰 · 완료 화면 / 내 공간(재방문) | 허브 줄 `💌 다른 하객 방명록 보기`(order 65, row) → 기능 화면 `f-wall` |
| S2 | 기능 화면 | 머리글 + 안내("이름·캐릭터·메시지만 보여요…") · "N명이 마음을 남겼어요" · 필터 [전체·신랑측·신부측·양가] · 카드 목록(최신순) · 하단 "← 돌아가기" |
| S3 | 카드 | 캐릭터(2배) · 이름 · 구분 칩 · (내 글이면 "나" 칩 + 노란 바탕) · 메시지 · 시각(식장 현지) |
| S4 | "신랑·신부에게만" 글 | 이름·캐릭터는 보이고 본문 대신 "💌 신랑·신부에게만 남긴 메시지예요" |
| S5 | 음성만 남긴 글 | "🎤 음성 메시지를 남겼어요" |
| S6 | 숨긴 글(관리자) | 목록에 없음 |
| S7 | 폰 마을(이 폰이 쓴 하객 ME가 있을 때) | 주민을 탭 → 시트에 그 사람의 카드 · 하단 바 `💌 방명록`(order 25) → 마을에 있는 하객 전체 목록 시트(같은 필터) |
| S8 | TV · 방명록을 안 쓴 폰 · 키오스크 | 아무것도 없음 (TV는 원래 메시지가 흐름 · 안 쓴 사람은 먼저 쓰기 · 키오스크는 매니페스트 밖) |
| S9 | 불러오기 실패 | "불러오지 못했어요…" + `↻ 다시 불러오기` |

## 3. 읽기 예산 (03 §7)
기능 화면에 들어올 때마다 `guests` 1번 조회 = 하객 수만큼 읽기 (50명이면 50). 하객 50명이 하루 3번씩 열어도 7,500 —
무료 한도(50,000/일) 안. 마을 시트는 마을이 이미 가진 목록을 써서 **읽기 0**.
"쓴 하객만"은 화면 흐름의 약속입니다(허브는 완료·내 공간 화면에만 있음). `guests` 문서는 v3.2부터 공개 읽기라
보안 규칙으로 막는 것이 아니며, 그래서 비공개로 하고 싶은 글은 §4의 "신랑·신부에게만"으로 따로 저장합니다.

## 4. 코어 접점 — "💌 신랑·신부에게만" (2026-10, 설계자가 구현)
- 작성 화면(`index.html` → `kiosk.html`): 메시지 칸 아래 `#in-priv` 체크박스 · 문구 `priv_label`.
- `store.addGuest`: 체크했고 메시지가 있으면 공개 문서는 `message: ''` · `priv: true`, 본문은 **같은 배치**로 `notes/{gid}` `{ message, createdAt }` (관리자만 읽음).
  데모는 `doc:notes/<gid>`. 하객 삭제(`deleteMany`)는 v4 부분에서 notes도 지움.
- 규칙: `guests` 생성에 `priv`(bool, true면 message `''`) · `notes/{id}` = priv 하객과 같은 배치 · 1–300자 · 관리자 읽기/삭제 · 수정 없음. 케이스 `v4.*` (에뮬레이터).
- TV(마을): priv 하객의 말풍선·티커 = `priv_msg` "💌 신랑·신부에게 마음을 전했어요".
- 관리자: 카드에 "🔒 신랑·신부에게만" + 본문(notes에서 1회 읽기, 캐시) · 검색 포함 · 수정 창에서 본문은 잠김 · CSV `[신랑·신부에게만] …` · ZIP의 JSON `privateMessage`.
- 리포트(report.png)는 공개 메시지만 셈 (비공개 글은 단어·편지상에 안 들어감).

## 5. 문구 (KO / EN) — `features/wall/i18n.js`
| 키 | KO | EN |
|---|---|---|
| wall_hub | 다른 하객 방명록 보기 (행 아이콘 💌는 허브가 따로 그림) | Read the other guests' messages |
| wall_title | 💌 하객 방명록 | 💌 Guestbook |
| wall_count | {n}명이 마음을 남겼어요 | {n} guests left a message |
| wall_privacy | 이름·캐릭터·메시지만 보여요. 사진과 음성은 신랑·신부만 봐요. | Only names, characters and messages are shown. Photos and voice messages are for the couple only. |
| wall_f_all / groom / bride / both | 전체 / 신랑측 / 신부측 / 양가 | All / Groom / Bride / Both |
| wall_me | 나 | Me |
| wall_priv | 💌 신랑·신부에게만 남긴 메시지예요 | 💌 A private note for the couple |
| wall_voice | 🎤 음성 메시지를 남겼어요 | 🎤 Left a voice message |
| wall_loading · wall_empty · wall_error · wall_retry · wall_back · wall_action · wall_sheet_one | 불러오는 중… · 아직 여기에 남긴 방명록이 없어요 · 불러오지 못했어요. 인터넷 연결을 확인하고 다시 눌러 주세요. · ↻ 다시 불러오기 · ← 돌아가기 · 방명록 · 💌 방명록 | Loading… · No messages here yet · Couldn't load the guestbook. Check your connection and tap to try again. · ↻ Try again · ← Back · Guestbook · 💌 Guestbook |
코어 문구(2026-10): `priv_label` 💌 신랑·신부에게만 보여주기 (다른 하객과 TV에는 안 보여요) / 💌 Only for the couple (hidden from other guests and the big screen) · `priv_msg` 💌 신랑·신부에게 마음을 전했어요 / 💌 Left a private note for the couple

## 6. 수용 기준
| # | 기준 |
|---|---|
| A1 | 완료 화면 · 내 공간 화면에 허브 줄(order 65) → 기능 화면, 최신순, 내 글에 "나" |
| A2 | 필터 4개가 구분별로 거름 · 개수 문구 |
| A3 | "신랑·신부에게만" 글: 기능 화면·마을 시트에 본문 없음 · TV 말풍선/티커는 `priv_msg` · 공개 문서 message `''` + `priv: true` · 관리자 카드·CSV에는 본문 |
| A4 | 숨긴 글은 목록에 없음 · 음성만 남긴 글은 🎤 문구 |
| A5 | 폰 마을(ME): 주민 탭 → 그 사람 카드 시트 · 하단 바 💌 → 전체 목록 시트 · TV와 ME 없는 폰에는 없음 |
| A6 | 불러오기 실패 → 오류 문구 + 다시 불러오기 → 성공 |
| A7 | 키오스크·사진·음성: 키오스크에 없음 · 화면 어디에도 사진/음성 데이터 없음 |

## 7. 시험
`tests/features/wall.mjs` — S1–S9(04 §4.1) + A1–A7. 규칙 케이스 `v4.guests-priv*` · `v4.notes-*`는 Patrick PC의 `npm run test:rules`.

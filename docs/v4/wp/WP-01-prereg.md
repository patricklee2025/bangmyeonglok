# WP-01 · 🎟 사전 입주 · 체크인 · 입장권 (`prereg`)

| 항목 | 값 |
|---|---|
| 브랜치 | `wp/01-prereg` · 선행: WP-00c · **마감 2026-11-30** (12/1 사전 입주 오픈) |
| 매니페스트 | pages `guest kiosk village admin` · phases `pre live` · simple ✓ · liveSafe ✓ · **gate ✓** (마을 첫 동기화가 이 기능 setup을 기다림, 02 §2.2) |
| 허락된 파일 | `public/js/features/prereg/**` · 매니페스트 prereg 줄 status · `tests/features/prereg.mjs` · `docs/guide/prereg.md` · STATUS/CHANGELOG |
| 데이터 | `checkins/{gid}` 생성 · `guests` 읽기 (03 §2) |
| 결정 필요 | Q-002 (식장·시작 시각), Q-014 (초대 링크 경로) — 없으면 기본값으로 진행하고 보고서에 표시 |

## 1. 목적
결혼식 **전에** 하객이 캐릭터를 미리 만들어 두게 하고(입주), 당일 **체크인하는 순간** TV 마을 문으로 입장하는 장면을 만든다.
입주 기념으로 픽셀 **입장권**을 준다. 당일 처음 온 하객(현장 등록)은 v3.2처럼 바로 입장.

## 2. 시나리오

| # | 페이즈 · 기기 | 흐름 |
|---|---|---|
| S1 | pre · 하객 폰 | 초대 링크 → 환영 화면 "🏡 마을에 미리 입주하기" → 기존 4단계 그대로 → 완료 "입주 완료!" + 🎟 입장권 카드(order 10) |
| S2 | pre · 재방문 | 환영 화면 슬롯에 "🎟 내 입장권 보기" 행 → 입장권 화면 `f-prereg-ticket` |
| S3 | live · 입주한 폰 | 환영 슬롯 맨 위 큰 카드 "🎟 {name}님 체크인하기" → 확인 → 체크인 완료 화면 `f-prereg-in` → [📷 사진·리모컨] (`openMine()`) / [🏡 마을에서 보기] |
| S4 | live · 입구 포스터 QR `index.html#checkin` | 기억된 하객 있으면 S3 확인 화면(via `entrance`) · 없으면 이름 찾기 화면 `f-prereg-find` (찾으면 이 폰이 기억: `remember`) · "처음이에요" → 기존 방명록 |
| S5 | live · 키오스크 | 환영 슬롯 "🎟 사전 입주하셨나요? 이름으로 체크인" → 이름 찾기 → 확인 → 완료 + 이어하기 QR(`#me=`) → 20초 후 초기화 |
| S6 | live · TV | 출석 필터: 체크인했거나 현장 등록한 하객만 마을에. 체크인되는 순간 문에서 입장 + 배너 "🎟 {name}님이 체크인했어요!" |
| S7 | live · 폰 마을 | S6과 같음 (`cfg.prereg.phonePresence === false`면 필터 없음 = 전원 표시) |
| S8 | live · 현장 등록 | v3.2 그대로 (출석 필터가 "당일 생성"을 통과시킴) |
| S9 | pre · 마을 | 아무것도 안 함 (D-day 마을은 WP-03) |
| S10 | 관리자 | 탭 "🎟 체크인"(order 50): 통계, 사전 입주자 목록(✅/⬜, 시각, 경로), 수동 체크인, 취소, 검색 · 설정(본식 시각, 폰 출석 필터) · 백업 `f-prereg/checkins.json` |

## 3. 출석 판정 (TV·폰 마을, live)

```js
// liveStart: CONFIG.schedule 기준 (core/phase liveWindow). 페이즈가 강제(url/admin)이면 리허설로 보고 walkInSince = 지금 - 12시간
present(g) = checkedIn.has(g.id) || g.createdAt >= walkInSince
```
- setup은 checkins 첫 스냅샷을 받을 때까지(최대 1.5초) 기다린 뒤 `setPresence` → 그다음 resolve.
  매니페스트 `gate: true`라서 마을은 첫 sync 전에 설정 문서의 실제 첫 값 + 이 setup을 **최대 8초** 기다립니다 (`whenGateReady`, 02 §2.2).
  첫 스냅샷이 1.5초 안에 안 오면(오프라인·캐시 없음): "아무도 체크인 안 함"으로 보고 `setPresence` → 나중에 스냅샷이 오면 `refresh()`.
- 새 체크인 문서 → `ctx.v.arrive(gid, { via: 'checkin' })` → `ctx.v.banner(t('prereg_banner', { name }))` → `ctx.v.refresh()`.
  코어는 via='checkin' 도착에 기본 도착 배너를 띄우지 않습니다 (02 §7.8) → 배너가 두 번 나오지 않음.
- 첫 스냅샷(이미 체크인된 사람들)에는 arrive/배너를 하지 않음 (부팅 직후 배너 폭탄 방지).
- 체크인 취소(관리자 삭제) → `removed` → refresh → 주민이 사라짐.

## 4. 입장권 (canvas, `ticket.js`)

크기 720×1280 (세로, 2배 해상도). 픽셀 스타일 (05 §5).
```
┌────────────────────────┐  ← 상단 띠(분홍) "WEDDING TICKET · 입장권"
│   지환 ♥ 선경            │  ← CONFIG.couple (언어별)
│   2027.04.10 (토) 17:00 │  ← schedule.weddingDate + cfg.prereg.time
│   {venue}               │
│ ┌────────────────────┐ │
│ │  (작은 마을 배경)    │ │  ← 잔디·한옥 지붕 실루엣·꽃잎 (scene.js 팔레트로 직접 그림)
│ │     [캐릭터 ×8]     │ │  ← spriteCanvas(avatar, 'idle', 8)
│ └────────────────────┘ │
│   {name}님  [신랑측]    │
│ - - - - - - - - - - - - │  ← 절취선
│ No. K7QF        [QR]    │  ← guestCode + qrCanvas(이어하기 링크 #me=…&n=…)
│ 결혼식 날 입구 QR로 체크인 │
└────────────────────────┘
```
- 이어하기 링크: `<사이트>/index.html#me=<gid>&n=<이름>` (v3.2가 이미 처리 = 다른 폰에서 열면 그 하객으로 기억).
- 저장: `shareImage({ dataURL, filename: 'wedding-ticket-<code>.png' })`. 캘린더: `icsEvent` → `wedding.ics` 다운로드.

## 5. UX 위치

| 위치 | 언제 | 내용 |
|---|---|---|
| 환영 문구 덮어쓰기 (`ctx.texts`) | pre | `start` `welcome_sub` `done_title` `done_sub` `already` `view_village` |
| 환영 슬롯 order 10 | pre + 기억된 하객 | 행 "🎟 내 입장권 보기" |
| 환영 슬롯 order 5 | live + 기억된 하객이 사전 입주자 + 미체크인 | **카드** "🎟 {name}님 체크인하기" (버튼 64px) |
| 환영 슬롯 order 5 | live + 키오스크 | 행 "🎟 사전 입주하셨나요? 이름으로 체크인" |
| 허브 order 10 | pre: card(입장권 미리보기 + 저장·캘린더) / live: row("🎟 내 입장권") | |
| 화면 | `f-prereg-ticket` · `f-prereg-confirm` · `f-prereg-find` · `f-prereg-in` | 각 화면 하단 sticky-foot에 [이전] |

## 6. 문구 (i18n.js — 이대로)

| 키 | KO | EN |
|---|---|---|
| (덮어쓰기) start | 🏡 마을에 미리 입주하기 | 🏡 Move in early |
| (덮어쓰기) welcome_sub | 결혼식 전에 내 픽셀 캐릭터를 만들어 두면,\n결혼식 날 체크인할 때 TV 마을에 짠! 하고 등장해요 | Make your pixel character now —\nit pops into the village on the big screen when you check in on the day |
| (덮어쓰기) done_title | 입주 완료! 🏡 | You've moved in! 🏡 |
| (덮어쓰기) done_sub | 결혼식 날 입구에서 체크인하면 TV 마을에 등장해요 | Check in at the entrance on the day to appear on the big screen |
| (덮어쓰기) already | 이미 입주하셨어요! 입장권은 아래에 있어요 | You've already moved in! Your ticket is below. |
| (덮어쓰기) view_village | 🏡 마을 구경하기 | 🏡 Peek at the village |
| prereg_ticket_title | 🎟 내 입장권 | 🎟 My ticket |
| prereg_ticket_head | WEDDING TICKET · 입장권 | WEDDING TICKET |
| prereg_ticket_no | No. {code} | No. {code} |
| prereg_ticket_note | 결혼식 날 입구 QR로 체크인해요 | Scan the entrance QR on the day to check in |
| prereg_ticket_save | 💾 이미지로 저장 | 💾 Save image |
| prereg_ticket_cal | 📅 캘린더에 추가 | 📅 Add to calendar |
| prereg_view_ticket | 🎟 내 입장권 보기 | 🎟 View my ticket |
| prereg_checkin_card | 🎟 {name}님 체크인하기 | 🎟 Check in as {name} |
| prereg_checkin_sub | 누르면 TV 마을에 내 캐릭터가 입장해요 | Tap and your character walks into the village on the big screen |
| prereg_confirm | {name}님으로 체크인할까요? | Check in as {name}? |
| prereg_yes | 네, 체크인! | Yes, check me in! |
| prereg_not_me | 다른 사람이에요 | That's not me |
| prereg_in_title | 체크인 완료! 🎉 | You're checked in! 🎉 |
| prereg_in_sub | TV 마을에 {name}님이 입장했어요 | {name} just walked into the village on the big screen |
| prereg_already | 이미 체크인했어요 | Already checked in |
| prereg_find_title | 🎟 이름으로 체크인 | 🎟 Check in by name |
| prereg_find_ph | 이름을 입력하세요 | Type your name |
| prereg_find_none | 이름을 찾을 수 없어요. 처음 오셨다면 방명록을 써주세요 | Can't find that name. New here? Sign the guestbook. |
| prereg_find_new | ✍️ 처음이에요 · 방명록 쓰기 | ✍️ I'm new · Sign the guestbook |
| prereg_kiosk_cta | 🎟 사전 입주하셨나요? 이름으로 체크인 | 🎟 Moved in early? Check in by name |
| prereg_banner | 🎟 {name}님이 체크인했어요! | 🎟 {name} checked in! |
| prereg_offline | 인터넷이 잠깐 끊겼어요. 연결되면 자동으로 체크인돼요 | Connection dropped — you'll be checked in as soon as it's back |
| prereg_ics_title | {groom} ♥ {bride} 결혼식 | {groom} & {bride}'s Wedding |
| prereg_admin_tab | 🎟 체크인 | 🎟 Check-in |
| prereg_admin_stats | 사전 입주 {pre}명 · 체크인 {in}명 · 현장 등록 {walk}명 | {pre} moved in early · {in} checked in · {walk} walk-ins |
| prereg_admin_manual | 수동 체크인 | Check in |
| prereg_admin_undo | 체크인 취소 | Undo |
| prereg_admin_undo_confirm | 정말 취소할까요? | Undo this check-in? |
| prereg_cfg_time | 본식 시작 시각 (입장권·캘린더) | Ceremony start (ticket & calendar) |
| prereg_cfg_phone | 폰 마을에도 체크인한 하객만 보이기 | Phones show checked-in guests only |

## 7. 데이터
- 체크인 쓰기: `ctx.db.doc('checkins/' + gid).set({ via, createdAt: ctx.db.ts() })` — **create 대신 set** (트랜잭션은 오프라인에서 실패.
  이미 있으면 서버가 거부 → 무시하고 "이미 체크인" 처리). 쓰기 후 `emit('checkin:done', { gid, via })`.
- 구독: TV·폰 마을·키오스크·관리자 = `ctx.db.col('checkins').watch` 1개. 키오스크·포스터 이름 찾기 = `ctx.db.col('guests').get()` 1회(60초 캐시).
- 사전 입주자 = `createdAt < liveStart` 인 하객. 현장 등록 = 그 이후.
- cfg: `{ time: '17:00', phonePresence: true }` (관리자 설정 섹션에서 저장)

## 8. 엣지 케이스
| 상황 | 처리 |
|---|---|
| 같은 사람이 두 번 체크인 | set 거부 → "이미 체크인했어요" (성공처럼 진행) |
| 사전 입주자가 당일 또 방명록 작성 | 환영 화면 맨 위 체크인 카드로 예방. 작성하면 캐릭터 2개 → 관리자가 삭제 (가이드에 안내) |
| 동명이인 | 이름 찾기 목록에 아바타·측(신랑/신부)·하객 코드 표시 |
| 숨김 하객이 체크인 | 체크인은 되지만 숨김이 우선 (마을에 안 보임) |
| 리허설 `?phase=live` | 출석 판정 walkInSince = 지금-12시간 (§3) |
| 오프라인 체크인 | 낙관적 완료 화면 + `prereg_offline` 안내, Firestore가 재전송 |
| 키오스크 | `remember` 호출 안 함 · `guest:reset`에 화면/검색어 비움 · 완료 20초 후 `ctx.guest.reset()` (코어 `resetAll()`과 같음 — 02 §6. `go('welcome')`만 하면 코어 입력이 남음) |
| 체크인 20명 몰림 | 코어 도착 배너 합치기 (00c) |
| prereg를 당일 끔 | 출석 필터 해제 → 전원 등장 (06 §4) |

## 9. 수용 기준 → 테스트 (`tests/features/prereg.mjs`)
| # | 기준 |
|---|---|
| A1 | S1–S9 체크 (04 §4.1) |
| A2 | pre: 환영 문구 6개가 덮어써지고 끄면 원래 문구 |
| A3 | pre 완료 화면: 입장권 카드 order 10, PNG 저장(다운로드 이벤트) · .ics 다운로드 내용(DTSTART 20270410T…Z) |
| A4 | 입장권 PNG 720×1280, QR 디코드(BarcodeDetector 없으면 생략) 또는 링크 문자열에 `#me=<gid>` 포함 |
| A5 | live 폰: 체크인 카드 → 확인 → 완료 화면, checkins 문서 생성, 두 번째는 "이미" |
| A6 | `#checkin`: 기억 있음 → via entrance / 없음 → 이름 찾기 → 선택 → `wgb_mine`에 기억 |
| A7 | 키오스크: 이름 찾기 → 체크인(via kiosk) → 이어하기 QR → 초기화 후 검색어·목록 비어 있음, `wgb_mine` 변화 없음 |
| A8 | TV: 사전 입주 5명 + 현장 2명 → 처음엔 2명만 (**부팅 중 기록된 `village:guests`에 체크인 안 한 사전 입주자가 한 번도 없음** = gate 동작), 체크인 3명 → 5명, 배너 문구 확인 |
| A9 | `phonePresence:false` → 폰 마을 7명 전원 |
| A10 | 관리자 탭 통계·수동 체크인·취소(→ TV에서 사라짐) |
| A11 | 핫 토글 off(TV, live) → 전원 표시 · 흔적 0 |
| A12 | 레이아웃: phoneSE 환영(체크인 카드)·이름 찾기·완료, tablet 키오스크 이름 찾기 — 겹침 0 |

## 10. 수동 QA
| 기기 | 확인 |
|---|---|
| iPhone Safari / 카카오톡 인앱 | 입장권 저장(공유 시트 → 사진 저장) · 캘린더 추가(.ics → 캘린더 앱) |
| Android Chrome | 저장(다운로드) · 캘린더 |
| 실제 인쇄 포스터 | `#checkin` QR 스캔 → 체크인 |
| iPad 키오스크 | 이름 찾기 키보드 · 20초 후 초기화 |
| TV | 체크인 연출 (문 → 광장), 연속 5명 |

## 11. 롤백
관리자 ⚙️에서 끄기 → 출석 필터 해제, 문구 원래대로. checkins 데이터는 남음(무해). 사전 입주 오픈 전이면 status를 planned로 되돌려 배포.

**결혼식 전 `ready` 권장** (Patrick, 리허설 1 통과 후): `beta`는 관리자 설정을 받아야만 켜지므로, TV가 설정 문서를 8초 안에 못 받으면
출석 필터 없이 시작합니다. `ready`(기본 켜짐)면 설정이 늦어도 필터가 켜진 채로 시작 (02 §2.1).

## 12. 사용 안내서 `docs/guide/prereg.md` (신랑·신부용)
켜는 법, 초대 메시지 예시(KO/EN, 링크 포함), 입구 포스터 QR 만들기(`#checkin`), 당일 수동 체크인·취소, 끄면 생기는 일.

## 13. 구현 기록 (2026-10-08, `wp/01-prereg`)
- 파일: `features/prereg/` — `index.js`(페이지별 분기) · `guest.js`(하객·키오스크) · `village.js`(출석 필터, gate) · `admin.js`(탭·설정·백업) · `ticket.js`(입장권 캔버스) · `shared.js`(도우미) · `texts.js`(pre 덮어쓰기 6키) · `i18n.js` · `style.css`.
- **Patrick 요청 추가 (Q-014: QR + 링크를 청첩장에)**: 관리자 🎟 체크인 탭 아래 "💌 초대 링크 · QR" (링크 복사 · 인쇄용 PNG 저장) + "🚪 입구 체크인 포스터 QR" (`#checkin`, PNG 저장).
- 식장: `CONFIG.couple.venueAddress`(2700 Weston Ln, Orlando, FL 32810) · `venueName`(미정). 본식 시각은 ⚙️ `cfg.prereg.time` — 비어 있으면 입장권은 날짜만, 캘린더는 하루 종일(`DTSTART;VALUE=DATE`).
- 문구 표와 다른 점: 덮어쓰기 `view_village`는 "마을 구경하기"(코어 링크가 이미 🏡로 시작 → 두 번 나오지 않게). 허브 행 "🎟 내 입장권"은 행 아이콘이 🎟라 제목에서 🎟를 뺌. 표 밖 문구는 `i18n.js`의 "문서 표 밖" 묶음(이전·불러오기·키오스크 카운트다운·초대 QR 등).
- 출석 배너는 `village:arrived`(via checkin)가 실제로 날 때 띄움 → 숨긴 하객이 체크인하면 배너 없음. 첫 스냅샷의 기존 체크인은 도착 연출·배너 없음.
- `#checkin`은 새로 연 페이지뿐 아니라 열린 페이지의 해시 변경에도 반응(같은 탭에서 포스터 QR을 찍은 경우).
- 체크인 쓰기 = 먼저 읽고(1회) 없을 때만 `set` (규칙이 덮어쓰기를 막으므로 두 번째는 서버도 거절). 2.5초 안에 확인이 없으면 "오프라인" 안내와 함께 완료 화면(Firestore가 재전송).
- 시험: `tests/features/prereg.mjs` (91 체크, `slow`). 데모 시각은 실제 시각(2026)이라 모든 하객이 "사전"; 리허설 현장 등록(최근 12시간)과 구분하려고 시험이 데모 저장소의 `createdAt`을 이틀 전으로 바꿈.


# 01 · 아키텍처 — v4 "기능 플러그인" 구조

> 목표: v3.2 앱(이미 QA 완료, 271개 자동 체크 통과)을 **한 줄도 망가뜨리지 않고** 18개 기능을 더한다.
> 방법: 코어는 한 번만, 아주 조심스럽게 "끼울 자리"를 만든다(WP-00b/00c). 기능은 전부 그 자리에 끼우는 **플러그인**이고,
> 각각 켜고 끌 수 있으며, 꺼져 있으면 v3.2와 완전히 같다.

---

## 1. 원칙 (결정의 기준)

| # | 원칙 | 왜 |
|---|---|---|
| P1 | **결혼식 당일이 최우선.** 새 기능은 언제든 원격으로 끌 수 있어야 하고, 꺼지면 v3.2와 동일 | 하루뿐인 행사. 재시도 불가 |
| P2 | **코어는 한 번만 고친다** (WP-00b/00c). 그 뒤 기능 WP는 자기 폴더만 고친다 | 충돌·회귀의 대부분은 공유 파일 동시 수정에서 나옴 |
| P3 | **모든 데이터 계약과 보안 규칙을 먼저 확정**한다 (03 문서). 규칙은 결혼식 전 1번 게시 | 규칙 게시는 Patrick 수동 작업 = 실수 지점. 횟수를 줄임 |
| P4 | **데모 = 실서버.** 데모 백엔드가 규칙을 흉내 내서 같은 쓰기를 같은 이유로 거절 | 테스트는 데모로 돌기 때문에, 데모가 관대하면 테스트가 거짓말을 함 |
| P5 | **무료 플랜(Spark) 안에서.** 읽기 50K/일, 쓰기 20K/일, 문서 1MB, Functions 없음 | 비용 0 유지 (03 §5 예산표) |
| P6 | **새 의존성 없음.** 빌드 없음, CDN 추가 없음 | 정적 사이트 그대로 Netlify에 끌어다 놓기 배포 |
| P7 | **테스트가 먼저 빨간불을 켠다.** 기능마다 자동 테스트 + 공통 안전 테스트(끄기·켜기·폭주 차단·레이아웃·성능) | Sonnet이 만든 코드를 사람이 다 읽지 않아도 믿을 수 있게 |
| P8 | **하객 경험은 단순하게.** 기능이 늘어도 하객이 해야 하는 일은 "QR 찍고 이름 쓰기" 그대로 | 50명 중 어르신·외국인 하객 다수 |

하지 않는 것 (Patrick 결정): 내 자리 찾기 ✗ · 도착 현황판 ✗. 그 밖에 결제, 로그인 강제, 앱 설치 강제 없음.

---

## 2. 구조 한눈에

```
public/
├─ index.html · kiosk.html · village.html · admin.html      ← v3.2 페이지 (WP-00c가 "슬롯"만 추가)
├─ css/style.css                                             ← v3.2 + 슬롯/HUD 존 스타일 (WP-00c)
├─ js/
│  ├─ config.js store.js avatar.js scene.js face.js i18n.js snaps.js report.js   ← v3.2 코어
│  ├─ guest.js village.js admin.js                           ← v3.2 페이지 스크립트 (WP-00c가 API 노출)
│  ├─ core/                                                  ← v4 공용 모듈 (WP-00b)
│  │   bus.js        이벤트 버스 (스티키 값)
│  │   features.js   매니페스트 로더 · 켜짐 판정 · 핫 토글 · 서킷 브레이커 · ctx 생성
│  │   phase.js      페이즈 계산 (pre/live/after/anniversary) · 강제 페이즈
│  │   docdb.js      문서 DB (Firestore / 데모 IndexedDB / 아카이브 JSON) — 공통 API
│  │   schema.js     컬렉션 모양·권한 (firestore.rules 의 JS 거울) — docdb 가 쓰기 전에 검사
│  │   settings.js   app/settings · app/live 구독 + 관리자 저장 도우미
│  │   ui.js         공유 도우미 (하객 코드, QR, 공유, 글꼴 …)
│  └─ features/
│      index.js      매니페스트 (18개 + 2026-10 추가 2개 + _selftest)
│      _selftest/    코어 API 전체를 건드려 보는 점검용 기능 (데모 전용)
│      prereg/ couple/ dday/ story/ live/ translate/ bgm/ meter/ bingo/ poll/
│      card/ fourcut/ offline/ archive/ thanks/ photobook/ postcard/ anniversary/
│      wall/ tv/     (2026-10 추가: WP-19 방명록 모아보기 · WP-20 마을 TV)
├─ sw.js            (WP-13 오프라인)          photobook.html (WP-16)       archive/ (WP-14 산출물)
firestore.rules      ← v4 규칙 (WP-00b가 03 문서의 규칙을 그대로 붙임)
tests/  docs/  tools/
```

계층과 의존 방향 (아래로만 import):

```
 기능 (features/<id>)     ── ctx 만 사용 ──┐
                                           ▼
 페이지 스크립트 (guest.js · village.js · admin.js)  → ctx.guest / ctx.v / ctx.admin 제공
                                           ▼
 코어 v4 (core/*)  bus · features · phase · settings · docdb · schema · ui
                                           ▼
 코어 v3.2 (config · store · avatar · scene · i18n · snaps · report · face)
                                           ▼
 Firebase SDK (gstatic, 12.19.0)  /  데모: localStorage · IndexedDB · BroadcastChannel
```

---

## 3. 페이지 부팅 순서 (WP-00c가 구현)

**하객 (index / kiosk)**
1. v3.2 초기화 그대로 (`renderLang` → `go('welcome')` → `#me=` / `#snap` 처리)
2. `<html class="f-boot">` (환영 화면 내용을 최대 600ms 투명하게 — 기능 문구 덮어쓰기 깜빡임 방지)
3. `bootFeatures('guest' | 'kiosk', guestApi)` — settings·phase 구독 → 켜진 기능 import → `setup(ctx)`
4. 완료(또는 600ms 경과) → `f-boot` 제거. **기능이 실패해도 3초 안에 코어는 계속 동작**

**마을 (village)**
1. 레이아웃·카메라·QR (v3.2)
2. `connect()` 로 스토어 연결
3. `bootFeatures('village', V)` 시작 (기다리지 않음) → **`await whenGateReady(8000)`** = 설정 문서의 실제 첫 값 + gate 기능(prereg 출석 필터)의 setup까지,
   최대 8초. 안 그러면 체크인 안 한 사전 입주자가 TV에 잠깐 우르르 나타났다 사라짐. 장식·HUD 같은 나머지 기능은 첫 동기화를 막지 않음
4. `subscribeGuests(sync)` … (v3.2)
   (설정을 8초 안에 못 받으면 매니페스트 기본값으로 판정 → 그래서 prereg는 결혼식 전 `ready` 권장, 02 §2.1)

**관리자 (admin)**
1. 로그인 확인 (v3.2) → 관리자일 때만
2. 하객 구독 시작 → `bootFeatures('admin', A)` (1번만). 관리자 페이지는 **페이즈와 무관하게** 기능을 로드 (투표·식순·엽서를 미리 준비, 02 §2.2)

---

## 4. 페이즈 (시간 축)

```
          2026-12-01                 2027-04-10 06:00 ─ 04-11 06:00        2028-04-10 ~ 04-16
  ─────────────┼──────── pre ────────────┼──────── live ────────┼──── after ────┼─ anniversary ─┼── after ──
   (사전 입주 오픈:                        (결혼식 당일 24시간)                 (매년 기념일 7일)
    관리자가 prereg 켜기)
```
- `CONFIG.schedule` (WP-00b가 config.js에 추가): `{ weddingDate: '2027-04-10', utcOffset: '-04:00', liveStartHour: 6, liveHours: 24, anniversaryDays: 7 }`
- `phaseAt(now, schedule)`는 순수 함수 → 단위 테스트로 경계값 검증 (03 §1).
- 강제: `?phase=live` (그 탭만, 리허설용) · 관리자 ⚙️ 설정의 "페이즈 강제" (전체, **비상용**).
  ⚠️ 2월 리허설에서 전체 강제를 쓰면 진짜 하객들의 사전 입주 화면이 체크인 화면으로 바뀝니다 → 리허설은 반드시 `?phase=`.

페이즈별 기능 (✓ = 매니페스트 phases. 페이즈 게이트는 **하객·키오스크·마을 페이지에만** 적용 — 관리자 페이지는 페이즈 무관, 02 §2.2)

| 기능 | pre | live | after | anniv | 페이지 |
|---|:-:|:-:|:-:|:-:|---|
| WP-01 prereg 사전 입주·체크인·입장권 | ✓ | ✓ | | | guest kiosk village admin (gate) |
| WP-02 couple 커플 캐릭터 | ✓ | ✓ | ✓ | ✓ | guest kiosk village admin |
| WP-03 dday D-day 마을 | ✓ | | | | guest village |
| WP-04 story 커플 스토리 표지판 | ✓ | ✓ | ✓ | ✓ | village admin |
| WP-05 live 식순 라이브 모드 | | ✓ | | | village admin |
| WP-06 translate 덕담 번역 | | ✓ | ✓ | ✓ | village admin |
| WP-07 bgm 8비트 BGM·효과음 | ✓ | ✓ | ✓ | ✓ | village admin |
| WP-08 meter 마음 온도계 | | ✓ | | | village admin |
| WP-09 bingo 양가 섞이기 빙고 | | ✓ | | | guest village admin |
| WP-10 poll 실시간 투표 | | ✓ | | | guest village admin |
| WP-11 card 내 픽셀 카드 | ✓ | ✓ | ✓ | ✓ | guest village |
| WP-12 fourcut 픽셀 네컷 | | ✓ | ✓ | | guest |
| WP-13 offline 오프라인 대비 | ✓ | ✓ | ✓ | ✓ | guest kiosk village admin |
| WP-14 archive 추억 마을 아카이브 | | | ✓ | ✓ | guest village admin (+ 아카이브 모드) |
| WP-15 thanks 하객별 감사 카드 | | | ✓ | ✓ | guest admin |
| WP-16 photobook 포토북 PDF | | | ✓ | ✓ | admin (+ photobook.html) |
| WP-17 postcard 신혼여행 엽서 | | | ✓ | ✓ | guest village admin |
| WP-18 anniversary 1주년 재개장 | | | | ✓ | guest village admin |
| WP-19 wall 방명록 모아보기 (2026-10) | ✓ | ✓ | ✓ | ✓ | guest village |
| WP-20 tv 마을 TV · 유튜브 (2026-10) | | ✓ | | | village admin |

---

## 5. 안전장치 (겹겹이)

| 층 | 장치 | 무엇을 막나 | 어디 |
|---|---|---|---|
| 1 | **기능 플래그 + 핫 토글**: 관리자가 끄면 ~1초 안에 모든 기기에서 그 기능만 사라짐 (새로고침 불필요) | 당일 발견한 버그 | core/features, ⚙️ 설정 |
| 2 | **본식 안전 모드** 버튼 1개: `liveSafe` 아닌 기능 전부 끔 | "뭐가 문제인지 모르겠다" 상황 | ⚙️ 설정 + 상단 라이브 패널 |
| 3 | **서킷 브레이커**: 기능 콜백 오류 60초 5회 → 그 기기에서 그 기능만 자동 차단 | 무한 오류로 TV 멈춤 | core/features |
| 4 | **오류 격리**: 기능 훅은 각자 try/catch. 마을 루프의 코어 catch(이벤트 리셋)에 닿지 않음 | 기능 하나가 부케 이벤트까지 망침 | village.js 루프 |
| 5 | **자동 정리**: ctx로 등록한 모든 것 + `data-f` DOM 자동 제거 → 꺼진 기능은 흔적 0 (테스트로 검증) | 끄기 후 유령 UI·리스너 | core/features |
| 6 | **데모 규칙 거울** (`schema.js`): 데모에서도 권한·모양 위반이 같은 오류 | 실서버에서만 터지는 권한 오류 | core/docdb |
| 7 | **보안 규칙 사전 확정** + 허용/거부 매트릭스 테스트(에뮬레이터) | 악의적·실수 쓰기, 할당량 소진 | firestore.rules, tests/rules |
| 8 | **정적 검사**: 접두사·innerHTML·외부 주소·의존성·파일 소유권·코어 import 허용 목록(02 §1.1) | 규칙 위반 코드 유입, 기능이 코어 내부에 몰래 의존 | tests/suites/core-features-static |
| 9 | **공통 기능 테스트**: 모든 기능을 하나씩/전부 켜고 스모크·레이아웃·성능·폭주 차단 | 기능 간 충돌 | tests/suites/core-features-matrix |
| 10 | **골든 스프라이트**: 아바타 808 프레임 해시 고정 | 하객 캐릭터가 몰래 바뀜 | tests/golden |
| 11 | **기능 동결** 2027-02-28 → 3월은 버그 수정만, 리허설 2회 | 막판 변경 | 일정 (§7) |
| 12 | **당일 런북**: 역할, 점검표, 비상 절차 | 사람 실수 | 06-runbook.md |

실패했을 때 어떻게 보이나

| 상황 | 하객이 보는 것 | 대응 |
|---|---|---|
| 기능 JS 로드 실패 (Wi-Fi) | 그 기능만 안 보임. 방명록·마을 정상 | 없음 (자동) |
| 기능 setup 오류 | 위와 같음 + 콘솔 `feature:error` | 관리자 ⚙️ 설정에 빨간 표시 → 끄기 |
| 기능이 프레임마다 오류 | 5번 후 그 기능만 사라짐 | 원인 수정은 결혼식 후 |
| Firestore 연결 끊김 | TV 상단 "연결이 불안정해요" (v3.2), 마을은 계속 움직임 | 자동 재연결 |
| app/settings 읽기 실패 | 매니페스트 기본값으로 동작 (마을은 최대 8초 기다린 뒤 시작) | 없음 — prereg가 `ready`면 출석 필터도 기본으로 켜짐 |
| 두 기능이 같은 전용 자리(출석·티커·커플 스프라이트)를 쓰려 함 | 나중 기능만 꺼짐 (`owner-conflict`), 먼저 있던 기능·코어 정상 | 설계 위반 → 결혼식 후 수정 |
| 서비스워커 이상 (WP-13) | 오래된 화면 | 런북: SW 킬스위치 배포 (06 §5) |
| prereg를 당일 끔 | 체크인 안 한 사전 입주자까지 TV에 전부 등장 | 의도된 저하 (06 §4) |

---

## 6. 데이터 흐름 요약 (자세히: 03)

```
하객 폰 ──addGuest──▶ guests/{gid} ◀──watch── TV · 관리자 · 폰 마을          (v3.2)
        ──checkin───▶ checkins/{gid} ◀──watch── TV · 폰 마을 (출석 필터)       (WP-01)
        ──vote──────▶ votes/{pid}_{gid} ◀──watch(pid)── TV · 관리자           (WP-10)
        ──bingo─────▶ bingo/{gid} ◀──watch── TV · 관리자                      (WP-09)
관리자  ──settings──▶ app/settings ◀──watch── 모든 기기 (기능 플래그·페이즈·기능 설정)
        ──live──────▶ app/live     ◀──watch── 모든 기기 (식순 큐·조용 모드·열린 투표·공지)
        ──translate─▶ translations/{gid} ◀──watch── TV                        (WP-06)
        ──postcard──▶ postcards/{id} ◀── 하객 폰 · 마을 (after)                (WP-17)
        ──thanks────▶ thanks/{token} ◀──get(링크)── 그 하객 폰                 (WP-15)
```

---

## 7. 작업 패키지 지도와 일정

```
WP-00a ✅ 개발 구조 + 테스트 하네스 (완료)
WP-00b   코어 모듈 · 매니페스트 · 스키마 · 규칙 v4 · 코어 테스트      ← 모든 것의 기반
WP-00c   페이지 확장 지점 (guest/village/admin API, 슬롯, HUD 존)    ← 00b 다음
 ├─ M1 (~2026-11-30, 사전 입주 12/1 오픈 전)
 │   WP-01 prereg · WP-02 couple · WP-03 dday · WP-04 story
 ├─ M2 (2026-12 ~ 2027-01)
 │   WP-05 live · WP-06 translate · WP-07 bgm · WP-08 meter · WP-09 bingo
 │   WP-10 poll · WP-11 card · WP-12 fourcut · WP-13 offline
 ├─ 2027-02: QA + 리허설 1 (실서버, 친구 10명) → 2027-02-28 기능 동결
 ├─ 2027-03: 리허설 2 (가능하면 식장) · 버그 수정만
 ├─ 2027-04-10 🎉 결혼식
 ├─ 결혼식 후 (플래그 끈 채 미리 만들어도 되지만, 동결 기간에는 배포 브랜치에 합치지 않음)
 │   WP-14 archive · WP-15 thanks · WP-16 photobook · WP-17 postcard
 └─ ~2028-03: WP-18 anniversary (1주년 2028-04-10)
```

의존 관계 (→ = 먼저 필요)
- 모든 기능 → WP-00b, WP-00c
- WP-03 dday → (선택) WP-01 (입주민 수 표시는 prereg 없이도 동작)
- WP-07 bgm → (선택) WP-05 (`live:cue`로 곡 전환. 없으면 기본 재생목록)
- WP-08 meter → 의존 없음. 빙고·투표 점수는 `bingo`·`votes` **컬렉션을 직접 읽어서** 셈 (버스 이벤트는 그 기기 안에서만 흐르므로
  하객 폰의 `vote:cast`·`bingo:line`은 TV에 오지 않음 — 02 §5). 기능이 꺼져 있거나 데이터가 없으면 그 점수 0
- WP-07 bgm 효과음 → (선택) WP-09: TV의 bingo 기능이 컬렉션에서 새 줄을 감지해 TV 안에서 `bingo:line`을 다시 냄
- WP-09 bingo → 하객 코드는 core/ui `guestCode` (prereg에 의존하지 않음)
- WP-16 photobook → (선택) WP-06 번역 표시
- WP-18 anniversary → WP-14 아카이브가 있으면 아카이브 데이터로도 동작

기능끼리는 import 하지 않으므로, 순서가 바뀌어도 코드 충돌은 없습니다 (버스 이벤트가 없으면 그냥 안 오는 것).

---

## 8. 주요 결정과 이유 (트레이드오프)

| 결정 | 대안 | 이유 |
|---|---|---|
| 플러그인 + 매니페스트 | 페이지 스크립트에 직접 추가 | 18개 기능이 village.js(1,043줄)에 섞이면 회귀·충돌 불가피. 핫 토글·정리 보장 불가 |
| docdb (공통 문서 API) 신설, store.js 유지 | store.js에 메서드 추가 | store.js는 검증 완료 + v3.2 테스트 대상. 새 컬렉션 18개 분량을 넣으면 위험. docdb는 같은 Firestore 인스턴스 공유 |
| schema.js = 규칙의 JS 거울 | 규칙만 | 이 샌드박스·CI에서 에뮬레이터를 못 돌림 → 데모가 같은 거절을 해야 테스트가 의미 있음. 규칙이 최종 권위 |
| 감사 카드 = 추측 불가 토큰 링크 | 하객 id로 공개 | 하객 id는 공개 목록에 있음 → 남의 감사 카드를 읽을 수 있게 됨 |
| 투표 집계 = TV/관리자만 votes 구독, 결과는 poll 문서에 | 폰마다 votes 구독 | 폰 50대 × 표 50개 = 2,500 읽기/투표 → 할당량 낭비 |
| 포토북 = 인쇄용 HTML → 브라우저 "PDF로 저장" | PDF 라이브러리 | 의존성 0, 벡터 글자, 인쇄소 PDF 규격 맞추기 쉬움 |
| 아카이브 = 정적 JSON + JPEG를 Netlify에 | Firestore 유지 | 영구 보존(프로젝트 삭제·할당량과 무관), 읽기 비용 0 |
| 번역 = Chrome 내장 Translator(TV 노트북) + 관리자 저장 캐시 | 번역 API | 무료·오프라인·키 불필요. 단 데스크톱 Chrome 138+ 전용 + 사용자 클릭 필요 → 리허설 확인 |
| BGM 기본 꺼짐, 공개 저작물 + 자작 루프만 | 상용 음원 | 식장 음향과 충돌·저작권 |
| 서비스워커 = 네트워크 우선 + 캐시 대비 | 캐시 우선 | 배포 후 옛 화면에 갇히는 사고 방지 |
| 하객 코드 4글자 (gid 해시) | 순번 | 순번은 트랜잭션 카운터 필요(쓰기·경합). 50명 기준 충돌 확률 무시 가능 |

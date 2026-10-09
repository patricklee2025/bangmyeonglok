# 04 · 테스트 — 무엇을, 어떻게, 언제

> 원칙: **테스트가 먼저 빨간불을 켠다.** 사람이 코드를 다 읽지 않아도, 초록불이면 "v3.2는 그대로고 새 기능은 약속대로"라는 뜻이 되게 한다.
> 실행 방법 요약은 `tests/README.md`. 이 문서는 **기능 WP가 반드시 갖춰야 할 테스트**와 리허설·수동 점검까지 다룹니다.

---

## 1. 명령과 시간

| 명령 | 시간 | 언제 |
|---|---|---|
| `npm run test:quick` | ~40초 | 작업 시작 전 · 파일 몇 개 고칠 때마다 (`slow` 태그 스위트는 빠짐) |
| `node tests/run.mjs <스위트이름…>` | 스위트별 | 내 기능 스위트 반복 실행 · **코어를 건드리는 WP(00c)는 `core-units-loader`(~35초, `slow` 태그라 quick에 없음)를 매 단계 직접 실행** |
| `npm test` | ~6–7분 (기능 추가로 늘어남) | **커밋 전 반드시**. 결과 요약을 보고서에 붙임 |
| `npm test -- --jobs 3` | ~3분 | 빠른 확인용. 장면(부케 등) 타이밍 테스트가 CPU 경쟁으로 드물게 흔들릴 수 있음 → 최종 판정은 순차 실행 |
| `npm run golden:update` | 1초 | **스프라이트 변경이 의도된 경우에만** (WP-02). 보고서에 이유 명시 |
| `npm run test:rules` | ~1분 | 규칙 바꾼 뒤 (Patrick 컴퓨터, 에뮬레이터 필요 · §6) |

Claude Code에서 실행할 때: Bash 도구 시간 제한을 `npm test`는 **600000ms**, quick은 120000ms로 지정하세요.
결과는 `tests/.out/results.json`, 스크린샷은 `tests/.out/<스위트>/` — 화면 변경이 있으면 **스크린샷을 직접 열어서 확인**합니다.

---

## 2. 코어 스위트 (v3.2 보호 · 기능 WP는 수정 금지)

| 스위트 | 지키는 것 |
|---|---|
| core-static | kiosk.html 동기화, JS 문법, i18n 한/영 짝, 외부 주소, 규칙↔config 일치, 파일 크기 예산 |
| core-smoke | 모든 페이지 부팅, 하객 1명이 TV·폰 마을·관리자에 보임 (15초) |
| core-guest-flow | 사진 분석 포함 4단계 작성 → TV → 리모컨 → 관리자 수정/이벤트/일괄삭제 → 키오스크 |
| core-v3-features | 음성·타임캡슐·스냅→폴라로이드·간편 모드·관리자 재생/리포트/ZIP |
| core-events | 부케·단체사진 PNG·레벨업·토글 키 |
| core-phone-village | 폰 레이아웃·리모컨→TV·드래그/맞춤/가로·사진 시트 |
| core-returning | 재방문 버튼·🔑 관리자·키오스크 이어하기 |
| core-i18n | 영어 전 과정, 입력 중 단축키 무시 |
| core-layout | 모든 화면×기기: 겹침 0, 가로 스크롤 0, 터치 크기 |
| core-regressions | v3.2 QA 버그 31개 재발 방지 (+ 데모 다중 탭 동기화) |
| golden-sprites | 아바타 124종 × 프레임 808개 픽셀 해시 |
| perf-village | 하객 50명 TV/폰 ≥ 24fps (`PERF_MIN_FPS`) |

**규칙**: 기능 WP는 `tests/suites/`를 고치지 않습니다. 코어 셀렉터를 의도적으로 바꾸는 코어 WP(00b/00c)만 `tests/lib/flows.mjs`와 해당 스위트를 함께 고칩니다.
테스트를 통과시키려고 허용 목록(ALLOW_*)을 넓히거나 기대값을 바꾸는 것 = **금지**. 실패하면 코드를 고치거나 QUESTIONS.md.

---

## 3. v4에서 추가되는 코어 스위트

### 3.1 `core-features-static` (WP-00b) — 네트워크·브라우저 없이 1초
- 매니페스트: id 형식, 폴더 존재(planned 제외), pages/phases 값, 중복 없음, load 경로 = `./<id>/index.js`
- 매니페스트: `gate: true`는 prereg 하나뿐
- 기능 폴더마다: `index.js`·`i18n.js` 존재, i18n 키 접두사 `<id>_`, 한/영 짝, 빈 문자열 없음
- CSS: 모든 선택자가 `.f-<id>-` · `[data-f="<id>"]` · `html.f-<id>-` 중 하나로 시작, `@keyframes f-<id>-…`
- JS: 금지 목록(02 §12) — innerHTML 변수, eval, 외부 주소, 다른 기능 import, `console.log`, `localStorage.clear`, 접두사 없는 storage 키,
  `documentElement.classList`/`body.classList` 직접 조작
- **import 허용 목록** (02 §1.1): 기능 파일의 모든 `import … from '…'`·`import('…')` 경로가 표 안의 모듈(또는 자기 폴더)인지, 가져오는 이름이 표에 있는지
- schema.js ↔ firestore.rules: 규칙의 모든 `match /…` 경로 — 컬렉션(`/checkins/{gid}` 꼴)과 **고정 문서 경로(`/app/settings`, `/app/live`)** 둘 다 —
  가 schema에 있고 그 반대도 성립 (정규식이 `{`로 끝나는 경로만 잡으면 app 문서 2개를 놓침 → 두 패턴 모두 검사)
- 규칙 ↔ config: 관리자 이메일, 캡슐 날짜(**capsules 블록 안의** timestamp.date), 스냅 슬롯 수

### 3.2 `core-units` · `core-units-loader` (WP-00b) — 브라우저 안에서 모듈 직접 import
> 구현에서는 둘로 나눴습니다: **`core-units`** = `phaseAt` · bus · docdb · schema 거울 · settings · `deleteMany` · ui 도우미 (아래 목록의 나머지),
> **`core-units-loader`** = `resolveEnabled` · `parseFF` · 로더(핫 토글·브레이커·실패·제한 시간·off hook) · gate · `claim` · `ctx` 전체(`el` 보안 포함 · `db` · 문구 · 루트 클래스) ·
> 이벤트 소유권(문서 표와 코드 맞춰 보기) · `pageApi.forFeature` · 페이즈 핫 토글 · 탭 사이 전달 · `tests/lib/v4.mjs` 도우미 검증. 공용 도구는 `tests/lib/units.mjs`.
- `phaseAt` 경계값 (03 §1 표 전부)
- `resolveEnabled` 판정표 (02 §2.2의 12단계 × status 3종 × 데모/실서버 × 관리자/그 외 페이지 · `?ff=all`과 `_` id)
- `whenGateReady`, 한 기능 전용 자리 `claim`(owner-conflict), `ctx.texts`가 `lang`을 내지 않음, `ctx.rootClass` 정리 (WP-00b §6.3)
- bus: 스티키/replay, 핸들러 오류 격리
- docdb(데모): create/set/merge/update/delete, already-exists·not-found, watch 즉시+변경, 다른 탭 변경 수신, ts/inc, where/orderBy/limit, 스키마 위반 `invalid-argument`, 권한 위반 `permission-denied`(하객 페이지에서 app/live 쓰기 등)
- schema 거울: 03 §5의 거부 사례 1–8을 데모로 재현 → 전부 거부
- `deleteMany` 확장: v4 문서까지 삭제 (데모)
- `guestCode` 결정성·문자 집합, `detectLang`, `seeded`

### 3.3 `core-extension` (WP-00c) — `_selftest` 기능으로 모든 확장 지점 점검
`?ff=_selftest` (데모 전용)로 켜면 _selftest가 **모든 API를 한 번씩** 사용합니다: 허브 카드·행, 환영 슬롯, 기능 화면, 문구 덮어쓰기, 루트 클래스,
키오스크 `reset()`, 소품·그리기 3층·decorate·오버레이 3층·onUpdate, 배너(high/normal), HUD 4존, 스포트라이트, 액션(⋯ 포함, ME 없는 폰 포함), 시트, onTap, 키, 장면,
관리자 탭·라이브 슬롯·설정 섹션·백업 파트, docdb 왕복. 한 기능 전용 API(출석·티커·커플 스프라이트)와 gate는 `&st=…`로 따로 (WP-00c §6).
검사: 각 항목이 보임 → 관리자에서 끄기 → `[data-f="_selftest"]` 0개, 리스너·타이머 정리(카운터), 콘솔 오류 0 → 다시 켜기 → 정상 →
`&fcrash=_selftest` 로 콜백 강제 오류 → 5회 후 차단(trip), 마을·방명록 정상.
> `_selftest`는 **planned** 라서 관리자 플래그로는 못 켭니다 (02 §2.2 5단계). 그래서 `?ff=_selftest`(켬)·`?ff=-_selftest`(끔)를 쓰고, **핫 토글**을 시험할 때는
> 테스트가 `page.route`로 매니페스트의 `_selftest` 줄에 `status: 'beta'`를 끼워 넣습니다 (`core-extension`의 `patchManifest`). `simple: false` 경로도 같은 방법.
> 진행: 완료 — 하객·키오스크(세션 ① · 108) · 관리자(② · 88) · 마을(③ · 161) = 356 체크. 마을 부분만 `EXT_ONLY=village node tests/run.mjs core-extension`으로 따로 돌릴 수 있습니다. 구현: `tests/lib/ext-village.mjs` 등.

### 3.4 `core-features-matrix` (WP-00c가 만들고, 기능이 beta가 될 때마다 자동으로 대상이 늘어남)
> 구현됨 (WP-00c ③, 83 체크, `slow`+`exclusive` — fps를 재므로 다른 스위트와 겹쳐 돌지 않음). 대상은 매니페스트 중 `public/js/features/<id>/index.js`가 있는 기능이라 폴더가 생기면 코드 수정 없이 자동 포함됩니다.
> fcrash 단계는 기능이 보호된 콜백(`ctx.every`/`ctx.bus.on` 등)을 하나라도 써야 차단(trip)이 일어납니다.
- 각 기능(beta/ready, 그리고 planned는 데모 `?ff=`): 그 기능만 켜고 → 4개 페이지 부팅·스모크 루프·콘솔 오류 0
- 각 기능에 `fcrash` → 차단되고 코어 정상
- **전부 켜기** (`?ff=all`): 스모크 루프 + TV·폰 레이아웃 감사(겹침 0) + 성능(≥ `PERF_MIN_FPS`)
- 페이즈 4종 × 전부 켜기: 부팅·오류 0

---

## 4. 기능 스위트 작성법 — `tests/features/<id>.mjs`

템플릿: `tests/features/_template.mjs` (복사해서 시작). v4 도우미: `tests/lib/v4.mjs` (WP-00b가 작성).

```js
// tests/lib/v4.mjs (WP-00b) — 기능 테스트 공용 도우미
on(id) / off(id)                       // h.url 파라미터 조각:  h.url('village.html', { ff: on('poll') })
adminPage(h, ctx)                      // 같은 데모 세계의 admin.html 페이지 (설정을 '관리자로서' 바꿀 때)
setFlag(h, adminPage, id, on|null)     // app/settings.features 저장 (null = 기본값으로)
setSafe(h, adminPage, on)              // 본식 안전 모드
setLive(h, adminPage, patch)           // app/live 저장 (cue, quiet, poll, msg)
setCfg(h, adminPage, id, patch)        // app/settings.cfg.<id>
footprint(page, id)                    // { nodes, links, styles } — [data-f], .f-<id>-*, <link data-f>
expectClean(h, page, id, label)        // footprint 0 체크 기록
dbGet(h, page, path) / dbSet(…) / dbCol(h, page, name)    // 페이지 안에서 docdb 호출 (검증용)
guestsWithCodes(h, page, n)            // 데모 하객 n명 생성 + guestCode 반환
featureState(page, id)                 // { on, source, tripped } (core/features 상태)
```

### 4.1 모든 기능 스위트의 필수 체크 (S1–S9)

| # | 체크 | 방법 |
|---|---|---|
| S1 | **꺼짐 = 흔적 0** | `ff: off(id)`로 모든 해당 페이지 → `expectClean` + 코어 스모크 한 동작 (작성 또는 마을 동기화) |
| S2 | **켜짐 = 약속한 자리에 보임** | `ff: on(id)` → WP의 UX 표 위치(허브 order, HUD 존, 탭…)에 있음 |
| S3 | **핫 토글** | 플래그 없이 열고 → `setFlag(on)` → 새로고침 없이 나타남 → `setFlag(off)` → `expectClean` → 다시 on → 정상 (setup 재실행 안전) |
| S4 | **페이즈·페이지 게이트** | 매니페스트 밖 페이즈(`?phase=`)와 페이지에서 로드 안 됨. 단 **관리자 페이지는 페이즈 밖에서도 로드**됨을 확인 (02 §2.2) |
| S5 | **키오스크·간편 모드 규칙** | WP 표대로 보임/숨김. 키오스크면 `guest:reset` 후 상태 비움 |
| S6 | **영어** | `lang=en`으로 핵심 화면 → 한글 0자 (고유명사 제외) |
| S7 | **데이터 계약** | 정상 쓰기 성공 + WP가 지정한 거부 사례(스키마 거울)가 `permission-denied`/`invalid-argument` |
| S8 | **레이아웃** | 기능 화면·HUD를 `h.layoutReport`로 겹침 0, 터치 크기 OK (TV·phoneSE·phone) |
| S9 | **기능 고유 시나리오** | WP "수용 기준" 표의 항목 전부 — 각 항목 = check 1개 이상, 이름에 기준 번호 (`A3 …`) |

마을 기능은 추가로: TV `perf`(그 기능만 켜고 하객 50명) ≥ `PERF_MIN_FPS`.

### 4.2 좋은 체크의 조건
- 이름만 보고 무엇이 깨졌는지 알 수 있게: `'A2 투표가 닫히면 폰 카드가 결과로 바뀜'`
- 시간 대기는 `waitForSelector`/`until` 폴링으로 (고정 `waitForTimeout`은 애니메이션 확인 때만)
- 장면(부케·식순)처럼 **프레임마다 진행**되는 것은 느린 기기에서 오래 걸림 → 여유 있게 (90초)
- 데모에서 다른 탭의 localStorage를 바로 읽지 말 것 (BroadcastChannel이 먼저 올 수 있음) — 쓴 탭에서 읽거나 기다릴 것
- 스크린샷: 각 화면 1장 (`h.shot`) — 보고서에 "확인한 스크린샷" 목록

---

## 5. 골든·성능
- 스프라이트를 건드리는 WP는 WP-02뿐. 새 커플 스프라이트는 **추가 키**로만 들어가야 하며 기존 808개 해시는 그대로여야 함.
- 성능 기준 `PERF_MIN_FPS` 기본 24 (헤드리스 기준). 기능 추가 후 TV fps가 **이전 결과 대비 20% 넘게** 떨어지면 원인 수정.

---

## 6. 보안 규칙 테스트 (에뮬레이터 · Patrick 컴퓨터)

이 클라우드 작업 환경에서는 Firebase 에뮬레이터를 받을 수 없어서, WP-00b가 테스트 코드를 만들고 **Patrick이 자기 컴퓨터에서 1번 실행**합니다.

준비 (1회): Java 11+ 설치 → `npm i -g firebase-tools` → 저장소 폴더에서 `firebase login` 필요 없음 (에뮬레이터만 사용).
실행: `npm run test:rules` = `firebase emulators:exec --only firestore --project demo-wgb "node tests/rules/run.mjs"`

`tests/rules/run.mjs` (WP-00b): 의존성 없이 **에뮬레이터 REST API**로 요청 (`http://127.0.0.1:8080/v1/projects/demo-wgb/databases/(default)/documents/…`).
- 관리자 토큰: 서명 없는 JWT (`alg: none`) `{ email: 'jihwan.patrick.lee@gmail.com', email_verified: true, sub: 'admin', … }` → 에뮬레이터는 서명을 검사하지 않음
- 시드: `Authorization: Bearer owner` (규칙 우회)로 하객·투표 준비
- 03 §5 매트릭스의 모든 칸 + 거부 사례 1–8 → 기대(허용/거부)와 다르면 실패 목록 출력, 종료 코드 1
- **날짜에 묶인 규칙은 그 날짜 전에는 거부 쪽만**: 에뮬레이터도 실제 시각을 쓰므로 `anniv` 생성 허용(2028-04-03~23 UTC)과
  `capsules` 읽기 허용(2028-04-10 이후)은 지금 검사할 수 없음 → `SKIP: 날짜 전`으로 출력하고 실패로 치지 않음. 거부 사례(기간 밖 생성, 공개일 전 읽기)는 항상 검사

---

## 7. 수동 점검 · 리허설

### 7.1 기기 목록 (실제 기기로 확인할 것)
iPhone(Safari) · iPhone 카카오톡 인앱 브라우저 · Android(Chrome) · Android 삼성 인터넷 · iPad(키오스크, 가로/세로) ·
TV용 노트북(데스크톱 Chrome 최신, 전체화면, HDMI 1080p) · 관리자용 폰(신랑·신부)

### 7.2 WP별 수동 점검
각 WP 문서의 "수동 QA" 표를 그대로 수행하고, 통과/실패와 기기·브라우저를 STATUS.md 해당 줄에 기록.

### 7.3 리허설 1 (2027-02, 실서버, 친구 10명)
1. 전날: 규칙 v4 게시 확인, 관리자 ⚙️ 설정에서 기능 상태 스냅샷(캡처)
2. 사전 입주 5명(미리) + 현장 등록 5명. 현장 기기는 `?phase=live` (전체 강제 금지)
3. 입구 QR 체크인 · 키오스크 이름 체크인 · 폰 체크인 — TV 입장 연출 확인
4. 식순 큐 전부 1번씩 (조용 모드 포함), 투표 2개, 빙고 1줄 이상, 네컷 2장, 스냅 10장, 번역 줄 확인
5. 와이파이 끊기 2분 (TV·폰) → 복구 후 밀린 것 반영 확인
6. 본식 안전 모드 켜기/끄기, 기능 하나 원격 끄기 → TV에서 사라지는지
7. 관리자 ZIP 백업 → 압축 풀어 내용 확인
8. 끝: 테스트 데이터 일괄 삭제 (관리자) → 하객·체크인·빙고·투표까지 지워졌는지
9. 기록: 문제 목록 → QUESTIONS.md / 버그는 WP 담당 기능 폴더에서 수정

### 7.4 리허설 2 (2027-03, 가능하면 식장)
식장 와이파이·HDMI·음향 확인(BGM은 기본 꺼짐), 입구 QR·테이블 카드 인쇄물 실물 스캔, 06-runbook 순서대로 1회 통으로.

---

## 8. 흔들리는 테스트(flaky) 정책
- "다시 돌리니 됐다"로 넘기지 않습니다. 원인이 앱이면 고치고(예: v3.2 데모 다중 탭 동기화 버그를 이렇게 찾아 고침), 원인이 테스트면 대기를 견고하게.
- 고칠 수 없으면 QUESTIONS.md에 재현 방법과 빈도를 적고 해당 체크를 **삭제하지 말고** 그대로 둡니다.

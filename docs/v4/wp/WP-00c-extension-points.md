# WP-00c · 페이지 확장 지점 — guest · village · admin API 연결

| 항목 | 값 |
|---|---|
| 브랜치 | `wp/00c-extension` |
| 선행 | WP-00b merged |
| 규모 | **가장 위험한 WP** (검증된 코어 3개 파일 수정). 세션 3개로 나눔: ① 하객 ② 관리자 ③ 마을. 각 세션 끝에 `npm test` 초록 + 커밋 |
| 허락된 코어 접점 | `public/js/guest.js` `village.js` `admin.js` `snaps.js` · `public/index.html` (`kiosk.html`은 `npm run gen:kiosk`로 재생성) `village.html` `admin.html` · `public/css/style.css` · `public/js/core/*` (00b 버그 수정만) · `public/js/features/_selftest/*` · `tests/suites/core-layout.mjs` (ALLOW_SMALL 2줄 삭제만) · 새 스위트 `core-extension.mjs` `core-features-matrix.mjs` |

## 1. 목적
02-contracts §6–§8의 페이지 API(`ctx.guest`, `ctx.v`, `ctx.admin`)를 구현하고, 세 페이지가 기능을 부팅하게 한다.
**모든 기능이 꺼져 있으면 v3.2와 화면·동작·성능이 같아야 한다** (기존 스위트 전부 초록 + 골든 동일 + perf 하락 < 10%).

## 2. 절대 규칙 (이 WP 한정)
1. 기존 함수의 **이름·시그니처·동작을 바꾸지 않는다.** 필요한 곳에 "훅 호출 한 줄"을 끼우는 방식으로.
2. 기존 DOM id·클래스·data 속성을 바꾸거나 지우지 않는다 (테스트와 v3.2 CSS가 의존).
3. 기능 훅 호출은 전부 `guard` 안에서. 기능 오류가 마을 루프의 코어 `catch`(이벤트 리셋)까지 올라가면 안 된다.
4. 한 세션 = 한 페이지. 세션 끝마다 `npm test` 전체 초록이 아니면 커밋하지 않는다.

## 3. 하객 페이지 (guest.js · index.html) — 세션 ①

### 3.1 HTML (`index.html`, 그 후 `npm run gen:kiosk`)
- `#s-welcome` 안, `.hero` 카드와 `.start-btns` 사이에 `<div class="slot" id="slot-welcome"></div>` 1줄 추가. 다른 변경 없음.

### 3.2 부팅 (guest.js 맨 끝, 기존 초기화 뒤)
```js
document.documentElement.classList.add('f-boot');
const unboot = () => document.documentElement.classList.remove('f-boot');
setTimeout(unboot, 600);
bootFeatures(KIOSK ? 'kiosk' : 'guest', { forFeature: makeGuestApi, refreshTexts: paintTexts }).then(unboot, unboot);
```
`paintTexts()` = 지금 `renderLang()`의 "화면에 글자 칠하기" 부분을 그대로 떼어 낸 함수 (동작 동일). `renderLang()` = `paintTexts()` + `emit('lang')`.
기능의 `ctx.texts`는 `paintTexts`만 부르므로 `lang` 이벤트가 나가지 않습니다 (02 §4 — 무한 반복 방지).
CSS: `html.f-boot #s-welcome.active > *:not(.start-btns) { opacity: 0; }` + `transition: opacity .15s` (시작 버튼은 항상 보임 — 느린 Wi-Fi에서도 바로 시작 가능).

### 3.3 버스 이벤트 (기존 함수에 1줄씩)
| 위치 | 추가 |
|---|---|
| `go(name)` 끝 | `emit('guest:screen', { name, prev })` + 기능 화면 onLeave/onEnter 호출 |
| `renderLang()` 끝 | `emit('lang', { lang: getLang() })` |
| `setSimple(on)` 끝 | `emit('guest:simple', { on })` |
| 제출 성공 직후 (`go('done')` 전) | `emit('guest:submitted', {...})` · `emit('guest:mine', {id,name})` (키오스크도 mine 1번, 초기화 때 null) |
| 부팅 시 · `#me=` 처리 후 | `emit('guest:mine', mine 마지막 또는 null)` |
| `resetAll()` 시작 | `emit('guest:reset', {})` · 키오스크면 `emit('guest:mine', null)` (폰은 기억이 그대로이므로 내지 않음) |
| `renderRemote` 버튼 전송 성공 | `emit('remote:sent', { gid, type, where })` (`where`: 박스 id로 판단 done/solo) |

### 3.4 `makeGuestApi(scope)` — 02 §6 전부
- `screens.add(name, …)`: `<section class="screen" id="s-<name>" data-f>`를 `main.app`에 추가. `go()`는 이미 `.screen` 전체를 토글하므로
  기능 화면도 동작. `paintStep()`: 모르는 화면이면 단계 표시 숨김(현재 동작 그대로). 카메라는 `name !== 'photo'`라 자동으로 꺼짐.
  기능 화면에서 `back()` = 직전 화면 (`go(prev)`).
- `hub.add(item)`: `#s-done`과 `#s-remote` 각각에 `<section class="hub-card|hub-row" data-f style="order:N">` 삽입 (sticky-foot 앞).
  CSS order 고정값(§3.5). `when()`은 화면 진입 때·`hub.refresh()` 때 평가. `who`: done=방금 제출한 하객, solo=`openMine()`의 하객.
  키오스크에서는 허브를 그리지 않음(키오스크 완료 화면은 이어하기 QR이 주인공).
- `welcome.add(el, {order})`: `#slot-welcome`에 order로 정렬 삽입.
- 간편 모드 숨김: `entry.simple === false`인 기능의 hub/welcome 노드에 `f-nosimple` 클래스 → CSS `body.simple .f-nosimple { display: none }`.
- `setCoupleSprites`: `scope.claim('coupleSprites')` 후 `coupleStage()`가 쓰는 `gs/bs`를 모듈 변수로 바꾸고 교체 가능하게 (null = config 기본, dispose 때 null).
- `uploadSnap`·`snapsLeft`: snaps.js에 `export async function uploadSnapData(gid, name, data, caption, where)` 추가
  (내부 `recordUpload`·`mySnaps` 재사용, 썸네일은 data를 120px로 축소해 생성, 성공 시 `emit('snap:uploaded', …)`) → guest API가 감쌈.
- `reset()`: 기존 `resetAll()` 호출 (02 §6). 기능 화면에 있을 때도 동작해야 함 (`current`가 `f-…`여도 `go('welcome')`로 끝남).
- `texts()` 후 화면 갱신: `paintTexts()` (위 §3.2). 기능 화면은 기능이 스스로 다시 그림.

### 3.5 CSS (style.css, GUEST 구역 끝에 "v4 slots" 소제목으로 추가)
```css
#s-done > .done-head { order: 0 } #done-queued { order: 1 } #snap-done { order: 20 } #remote-done { order: 30 }
#s-done > .sticky-foot { order: 90 } #handoff { order: 40 } #s-done > .row.only-kiosk { order: 95 }
#snap-solo { order: 20 } #remote-solo { order: 30 } #s-remote > .sticky-foot { order: 90 }
html[data-phase="pre"] #snap-done, html[data-phase="pre"] #remote-done,
html[data-phase="pre"] #snap-solo, html[data-phase="pre"] #remote-solo { display: none; }
.hub-row { … 56px 높이, 아이콘·제목·› … } .hub-card { … px-box … }
body.simple .f-nosimple { display: none !important; }
```
⚠️ `data-phase="pre"` 숨김은 **페이즈 계산이 pre일 때만**. 지금(2026-10) 실서버는 pre라서, 이 줄이 들어가면 실제 사이트의 완료 화면에서
스냅·리모컨이 사라집니다 — 의도된 동작(결혼식 전에는 TV가 없음). 테스트 하네스는 이미 모든 URL에 `phase=live`를 기본으로 붙이므로
(`h.url`, WP-00a) 코어 스위트는 날짜와 무관하게 v3.2(당일) 화면을 검증합니다. 페이즈별 동작은 `{ phase: 'pre' }`처럼 명시해서 테스트.

### 3.6 구현 기록 (세션 ① 완료, 2026-10-07)
- 코드는 `guest.js`의 "v4 extension points" 구역(`makeGuestApi` · 허브 그리기) + 맨 끝 부팅 스니펫. 계약에서 정한 세부는 02 §6 "구현 메모".
- `snaps.js`는 코어를 import 하지 못하므로(core-units의 계층 검사) `setSnapSink(fn)`을 두었고 `guest.js`가 `setSnapSink(emit)`을 부릅니다. **마을(세션 ③)도 `setSnapSink`를 불러야 `snap:uploaded`가 납니다** (마을 업로더는 `where: 'village'`가 기본값).
- 완료·내 공간 화면의 스냅 업로더는 `where`를 넘깁니다 (`done` · `solo`).
- `_selftest`의 하객 부분은 `features/_selftest/guest.js`. 00b 로더 시험이 `ctx.guest`로 빈 `{ id }`를 주므로 `ctx.guest.screens`가 있을 때만 쓰입니다.
- 시험: `core-extension`(하객·키오스크 108 — 매니페스트를 브라우저에서 바꿔치기해 `simple:false`·`status:'beta'`(핫 토글) 경로도 검사. `slow` 태그).
- 레이아웃 감사(`LAYOUT_PROBE`)는 이제 화면이 나타나는 0.25초 애니메이션이 끝나길 기다립니다. 전에는 애니메이션 도중(투명)에 재서 통과하던 것이 운이었고,
  끝난 뒤에는 캡슐 `<summary>`가 31.5px(터치 기준 32px 미달)라 `style.css`에 위아래 1px 패딩을 더했습니다 (눈에 띄는 변화 없음).

## 4. 관리자 페이지 (admin.js · admin.html) — 세션 ②

### 4.1 탭 일반화
- 탭 레지스트리 `[{ key, label, order, section, onShow, onHide }]`. 코어 탭을 먼저 등록(guests 10 · snaps 20 · capsules 30 · report 40 · settings 90).
  **기존 버튼의 `data-tab` 값과 섹션 id(`#tab-guests` …)는 그대로.** 기능 탭은 `data-tab="f-<id>"` + `<section id="tab-f-<id>" data-f hidden>`.
- 버튼 클릭 처리(현재 하드코딩 배열)를 레지스트리 기반으로. 기존 동작(캡슐 렌더, 스냅 구독, 리포트 갱신)은 각 코어 탭의 onShow로 옮김.

### 4.2 라이브 패널 (상단 `.event-panel`)
기존 3버튼 유지 + 뒤에: `🤫 조용 모드` 토글(`settings.setLive({ quiet })`, 상태 표시) · `🛡 본식 안전 모드` 토글(`setSafe`) · `<div id="live-slot">`(기능, order 정렬).

### 4.3 ⚙️ 설정 탭 (코어, order 90)
| 영역 | 내용 |
|---|---|
| 상단 | 현재 페이즈와 출처(자동/강제) · 페이즈 강제 선택(auto/pre/live/after/anniversary, 바꿀 때 확인창 문구: "모든 하객 화면이 바뀝니다. 리허설은 주소에 ?phase= 를 쓰세요") · 본식 안전 모드 |
| 기능 표 | 매니페스트 순서. 열: 이름(KO) · 상태(planned/beta/ready) · 페이즈 · 하객 화면에서(지금 페이즈·플래그·안전 모드 기준 ON/OFF + 이유 — 관리자 페이지 자체는 페이즈 무관하게 로드하므로 따로 계산, 페이즈 밖이면 "⏸ 지금은 하객 화면에 안 보임 (페이즈)") · 스위치(기본/켜기/끄기 3단) · ⚠ 오류 표시(이 기기 `feature:error`) |
| 기능별 설정 | 표의 각 줄 아래 접이식 — `ctx.admin.settings.add` 내용 |
| 하단 | 마지막 변경 시각 · "모든 기능 기본값으로" 버튼(확인 2번) |

planned 기능 줄은 회색·스위치 비활성 ("아직 개발 전").

### 4.4 백업 파트
`btn-zip` 처리에서 v3.2 파일을 다 넣은 뒤 `app/settings.json` · `app/live.json` + 등록된 기능 파트 실행(각각 try/catch → 실패는 MISSING.txt에).

### 4.5 부팅·이벤트
로그인 확인 후 하객 구독 시작 다음 줄에 `bootFeatures('admin', { forFeature: makeAdminApi, refreshTexts })`
(1번만, 로그아웃→재로그인 시 재사용). `refreshTexts` = `applyI18n()` + 탭 레지스트리 버튼 라벨 다시 쓰기 (`lang` 이벤트 없음).
`emit('admin:guests', { list })` (구독 콜백), `emit('admin:tab', { key })`.

### 4.6 알려진 작은 문제 2개 수정
`#sel-all` 라벨(폰에서 26px) → 최소 높이 32px · 카드 체크박스 `.pick` 20px → 24px. 그 후 core-layout의 ALLOW_SMALL 두 줄 삭제.

### 4.7 구현 기록 (세션 ② 완료, 2026-10-07)
- 코드는 `admin.js`의 "v4 extension points" 구역(`makeAdminApi` · 설정 탭 · 라이브 패널 · 백업 파트 · `bootAdminFeatures`) + 탭 레지스트리(원래 탭 클릭 핸들러 자리).
  기존 `data-tab` 값·`#tab-*` id·`#atabs button` 마크업은 그대로이고, 클릭은 `#atabs`에 위임됩니다. 4개 코어 탭의 `onShow`는 예전 핸들러의 내용 그대로입니다.
- `admin.html`: 라이브 패널에 `#btn-quiet` · `#btn-safe` · `#live-slot`, 상단 알림 줄 `#admin-alert`(`ctx.admin.alert`, 8초 뒤 사라짐 — 기존 `#zip-status`는 방명록 탭 안이라 다른 탭에서 안 보임), ⚙️ 탭 `#tab-settings`(기능 표는 매니페스트에서 `admin.js`가 만듦).
- ⚙️ 표는 `<table>`이 아니라 행 카드(폰 390px에서 6열 표는 읽을 수 없음) — `role="table"`/`row`/`cell`을 붙였고, 900px 이상에서만 6열 격자.
  `_` 로 시작하는 기능(`_selftest`)은 **데모에서만** 줄이 생깁니다. "하객 화면에서" 열은 `resolveEnabled`를 `demo:false` · 주소 플래그 없음으로 다시 계산한 값이라 하객의 `?ff=`는 반영하지 않습니다.
  하객 쪽 페이지가 없는 기능(photobook)은 "관리자 전용 · …"으로 표시합니다.
- 토글 버튼(🤫 · 🛡)은 설정 문서의 첫 값이 올 때까지 비활성입니다 (첫 값이 오기 전에 눌러 이미 켜진 것을 덮어쓰는 일 방지). 안전 모드에는 확인창이 없습니다(비상 레버라서 한 번에).
- 페이즈 강제는 `<select>` + 인라인 확인 막대(`confirm()`은 인앱 브라우저·테스트에서 막히므로 쓰지 않음). "모든 기능 기본값으로"는 3번 누름(버튼 + 확인 2번, 각 5초 안에) 이고
  `app/settings.features`만 비웁니다 (`safe` · `phase` · `cfg`는 그대로 — 기능별 설정이 사라지면 안 되므로). 한 번의 `update`라서 하객 화면이 기능을 하나씩 껐다 켜지 않습니다.
- 백업 파트: 기능이 넘겨 받는 `zip`은 진짜 JSZip이 아니라 `file(path, data, opts)` · `folder(name)`만 가진 **버퍼링 래퍼**입니다. 파트가 끝난 뒤에야 진짜 ZIP에 들어가므로 경로 규칙(`f-<id>/…`, `..` · 역슬래시 · 200자 초과 금지)을 어기거나 오류가 나면 **그 파트의 파일은 하나도** 들어가지 않고 `MISSING.txt`에 `기능 <id>: <이름> — <이유>`로 적힙니다.
  파트 하나당 30초 제한 (멈춘 파트가 신랑신부의 백업을 막지 않도록), 실패는 그 기능의 오류로도 집계됩니다. `app/settings.json` · `app/live.json`은 정규화된(알려진 키만) 사본입니다.
- `ctx.admin.alert`는 `#admin-alert` · `guests()`는 사본(`slice`) · `emit('admin:guests')`의 `list`도 사본입니다 (기능이 고쳐도 코어 목록은 안 바뀜).
- `refreshTexts` = `applyI18n()` + 기능 탭 버튼 라벨 다시 쓰기 (`label`은 문자열 또는 함수). 관리자 페이지는 한국어 전용이라 `<html lang>`은 `ko`로 되돌립니다. 기능의 관리자 화면 문구는 기기의 언어 설정(`wgb_lang`)을 따릅니다 → Q: 관리자 쪽 기능 문구를 항상 한국어로 고정할지는 Patrick 결정 (아래 최종 보고 참고).
- 기능 탭이 꺼질 때 그 탭을 보고 있으면 방명록 탭으로 돌아갑니다 (`onHide`는 호출하지 않음 — 이미 꺼진 기능).
- 시험: `core-extension`에 관리자 5단계(88 체크)(전부 꺼짐 · 폰 레이아웃 · A7 · `_selftest` 전체 · A2 핫 토글 · A3 fcrash) — 반영 시간은 같은 기기의 다른 탭에서 잽니다. 새 도우미 `tests/lib/files.mjs → zipRead`.

## 5. 마을 (village.js · village.html) — 세션 ③

### 5.1 HTML (`village.html` `.hud` 안 맨 끝에 추가, 기존 요소 순서 유지)
```html
<div class="hz hz-tl"></div><div class="hz hz-tr"></div><div class="hz hz-rm"></div><div class="hz hz-tc"></div>
<div class="spot" id="spot" aria-live="polite"></div>
<div class="quiet-chip" id="quiet-chip" hidden>🤫 <span></span></div>
```
`#snap-sheet` 뒤에: `<section class="sheet" id="fsheet" hidden role="dialog" aria-modal="true" aria-labelledby="fsheet-title"><button type="button" class="sheet-x" id="fsheet-x">✕</button><h3 id="fsheet-title"></h3><div id="fsheet-body"></div></section>` (배경 `#sheet-bg` 공유).

### 5.2 부팅 순서 변경 (01-architecture §3)
```js
(async () => {
  const store = await connect();
  if (DEMO) { … seed … }                      // 기존
  bootFeatures('village', { forFeature: makeVillageApi, refreshTexts: () => applyI18n() });   // ← 추가: 기다리지 않음
  await whenGateReady(8000);                  // ← 추가: 설정 실제 첫 값 + gate 기능(prereg 출석 필터) setup 까지, 최대 8초
  store.subscribeGuests(sync);                // 기존
  …
})();
```
- gate가 아닌 기능(장식·HUD 등)은 첫 sync를 막지 않고 뒤따라 켜집니다.
- 8초는 "설정 문서를 못 받는" 최악의 경우(오프라인 + 캐시 없음)에만 다 기다립니다. 보통 TV는 영구 캐시 덕분에 1초 안.
- 그 8초 동안 TV는 v3.2와 같은 빈 마을(신랑·신부만) — 하객이 잘못 나타났다 사라지는 것보다 낫습니다.

### 5.3 레지스트리와 루프 연결 (기존 줄 사이에 한 줄씩)
| 기존 위치 | 추가 |
|---|---|
| `loop()`의 `updateEvent(dt); …` 다음 | `runHooks(updHooks, dt, time)` |
| `drawWorld`: 바닥(`ground`) 그린 직후 | `drawLayer('ground')` |
| `drawWorld`: items 배열 만든 뒤 sort 전 | 기능 소품 push (`base`) |
| `drawEntity(e)` 끝 | `decorate` 훅 (주민만, 신랑신부 제외) |
| `drawOverhead` 다음 | `drawLayer('overhead')` |
| 파티클 루프 다음, 조명 전 | `drawLayer('fx')` |
| `drawOverlay`: 이름표 전 / 후 / 카운트다운 후 | `overlay('under-tags')` / `overlay('over-tags')` / `overlay('top')` |

`runHooks`는 훅마다 try/catch → `scope.report(e)`. 할당 없는 for 루프.

### 5.4 배너 개선 (`banner`, `nextBanner`)
- 시그니처 확장: `banner(text, msOrOpts = 5000, kind = '')` — 두 번째 인자가 객체면 `{ ms, kind, priority }`. 기존 호출 그대로 동작.
- `priority:'high'`는 큐에서 일반 항목 앞(높은 것끼리는 순서 유지).
- 도착 배너(sync에서 만드는 것)에 내부 표식 `arrival: true` → 큐에 도착 배너가 3개 이상이면 하나로 합침: KO `🎉 {first}님 외 {n}명이 도착했어요!` / EN `🎉 {first} and {n} others arrived!`
- 조용 모드: 표시 보류(큐 유지), 해제되면 합쳐서 진행.
- ⚠ core-events의 레벨업 배너 대기(60초)는 그대로 통과해야 함 (레벨업은 high).

### 5.5 조용 모드 (`live.quiet`)
`chime()`·`launchFireworks()`·레벨4 랜덤 불꽃·`updateSnaps`(폴라로이드)·스포트라이트·배너 표시를 막음.
폰: `#quiet-chip` 표시 (KO "본식 진행 중이에요" / EN "Ceremony in progress"). `body.quiet` 클래스 (기능 CSS용).

### 5.6 스포트라이트 중재
가운데 자리 1개를 `polBusy`로 함께 관리: `spotlight.show`는 큐에 넣고, `updateSnaps`가 비었을 때(폴라로이드 없음·이벤트 없음·조용 아님) 꺼내 표시.
폴라로이드와 기능 스포트라이트가 번갈아 나오게(같은 종류 연속 최대 2회). 표시 중 기능이 꺼지면 즉시 닫힘.

### 5.7 폰 하단 바 · 시트 · 탭
- `actions`: `#mremote`의 📷 뒤에 기능 자리 1칸 (02 §7.6 규칙). "⋯"는 `#fsheet`로 목록 표시.
  ME가 없는 폰(`showSignBar()` — 바에 `a.sign` 링크 하나): 같은 기능 자리 1칸을 **링크 오른쪽**에 (링크는 남은 너비를 채움, 기능 버튼은 54×54).
  `when()` 재평가 시점: sync 끝 · `live`·`settings` 이벤트 · `actions.refresh()`. TV(HOST)에서는 바가 없으므로 등록만 받고 그리지 않음.
- `sheet.open`: `#snap-sheet`가 열려 있으면 닫고 `#fsheet` 열기. ESC·배경 클릭·✕로 닫기 → onClose.
- `onTap`: 기존 `endDrag`의 "움직이지 않음" 분기 + TV 마우스 클릭에서 월드 좌표 계산 `wx = (clientX - baseX + camX) / S` (TV는 `view.x`·`view.y` 보정),
  가장 가까운 주민(스프라이트 상자 안) → `emit('village:tap', …)` + 등록 훅 호출. 버튼·시트 위 탭은 제외(기존 pointerdown 필터와 같게).

### 5.8 장면 (`runScene`)
기존 `event` 변수와 `pendingEvents` 큐를 그대로 사용: `event = { type: 'scene', key, t, s, def }`. `updateEvent`에 `scene` 분기 추가
(`def.update(s, dt)`, `s.count`를 기존 카운트다운 오버레이가 읽게 `event.count = s.count`). `maxSec` 초과 시 강제 `endEvent()`.
`endEvent()`에서 다음 대기 항목이 scene이면 `startScene`. `seeded(seed)` 재사용. `village:event` start/end emit.

### 5.9 출석·도착·티커
- `sync(list)`: 첫 줄에서 `lastList = list` 저장. `guests = list.filter(g => !g.hidden && presence(g))` (presence 기본 = 항상 true).
- `fresh` 판정에 `arrivals.has(g.id)` 추가 (사용 후 삭제). `arrive`로 표시된 도착(via ≠ 'new')은 입장 연출(문·반짝임·점프)은 하되
  **코어 기본 도착 배너는 생략** (기능이 자기 문구 배너를 띄움). `village:arrived`의 via에 그 값. `v.refresh()` = `sync(lastList)`.
- 티커: `.ticker`에 `<span class="pre2"></span>`(앞머리, 메시지 앞 같은 줄·작은 글씨)와 `<span class="msg2"></span>`(둘째 줄) 추가 — 비어 있으면 숨김.
  `showTicker(g)`에서 `tickerPrefix?.(g)`·`tickerExtra?.(g)` 결과를 `textContent`로. CSS로 2줄일 때 높이 자동.
- 한 기능 전용: `setPresence` → `scope.claim('presence')`, `setTickerExtra` → `claim('tickerExtra')`, `setTickerPrefix` → `claim('tickerPrefix')`,
  `setCoupleSprites` → `claim('coupleSprites')` (02 §7.8 — 다른 기능이 쥐고 있으면 owner-conflict).

### 5.10 신랑신부 · 키 · 제스처
- `couple[i]`에 `walkTo(x, y, speed=24)`(직선 이동, update에서 진행) · `home()` · `face(dir)` 추가. 기존 필드 유지.
- `setCoupleSprites`: `couple[i].sprite` 교체 (null = config 기본).
- 키: 기존 keydown 핸들러 끝에서 `keyHooks.get(key)?.()` — 예약 키 등록 시 throw.
- 제스처: `wake()` 안에서 `gestureHooks` 호출 (사용자 활성화 문맥 유지).

### 5.11 버스 이벤트
`village:ready`(onFirstSync) · `village:guests`(sync 끝) · `village:arrived`(fresh 생성) · `village:emote`(onEmote 적용 시) ·
`village:event`(startBouquet/startGroupPhoto/launchFireworks/scene의 시작·끝) · `village:level`(renderLevel 변화 시) · `village:tap` ·
`village:snaps`(onSnaps 끝, HOST만, `{ count: snaps.length }`) ·
`remote:sent`(폰 바 전송 성공) · `lang`(부팅).

### 5.12 구현 기록 (세션 ③ 완료, 2026-10-07)
- 코드는 `village.js`의 "v4 extension points" 구역(`ctx.v` · 배너 · 조용 모드 · 스포트라이트/폴라로이드 중재 · 폰 바/시트 · 장면 · 출석/도착/티커 · 커플 · 키/제스처 · 버스 이벤트)과 부팅 순서(`whenGateReady` 뒤 첫 sync).
  `village.html`은 `.hud` 끝에 `hz-tl/tc/tr/rm` 4존 · `#quiet-chip` · `#fsheet`, `style.css`는 "v4 village" 구역, `i18n.js`는 코어 문구 3개(`arrived_many` · `quiet_chip` · `fa_more`). 세부 계약은 02 §7 "구현 메모".
- **도착 배너 모으기(0.8초)**: 대기열에 도착 배너만 있으면 첫 배너를 0.8초 늦춰 한꺼번에 오는 도착을 모읍니다 (`ARRIVAL_GATHER_MS`). 3명 이상이면 "🎉 X님 외 N명이 도착했어요!" 1개로 합치고 레벨업(high)이 먼저 나갑니다(A4).
  **혼자 도착하는 하객의 배너도 0.8초 늦게 뜹니다** — 데모의 `L`처럼 한 명씩 순서대로 들어오는 경우 첫 배너가 혼자 나가 합치기가 안 되는 문제를 고친 대가이고, 다른 배너(레벨업·장면 등)에는 영향이 없습니다.
- **조용 모드**(`live.quiet`): 배너·차임·불꽃·폴라로이드·스포트라이트를 보류하고 끄면 합쳐서 한 번에 보여 줍니다(A5). 폰은 `#quiet-chip`("본식 진행 중이에요")을 띄우며, 폰에서는 `tc` 존이 칩 아래로 내려갑니다.
- **출석 필터**(A6): `presence`는 참/거짓(truthiness)으로 판정하고 **예외가 나면 그 하객을 보여 줍니다(fail-open)** — 예외는 서킷브레이커에 집계됩니다. 필터가 숨겼던 하객이 다시 나타날 때는 "도착" 연출 없이 조용히 나타납니다
  (`heldBack`은 필터를 풀거나 `clearPresence()` 해도 비우지 않음 — 비우면 기존 하객 전부가 새로 온 것처럼 도착 배너가 터집니다). `arrive(gid, { via })`의 기본값 `'checkin'`은 코어 도착 배너만 생략하고 `'new'`는 배너까지 냅니다.
- **스포트라이트·폴라로이드**는 `polBusy` 한 슬롯을 나눠 씁니다. 스포트라이트가 끝나면 0.7초 페이드아웃 뒤에 흔적(`#spot` 내용)을 지웁니다.
- **폰 바**(A8): 기능 액션 1개 → 인라인, 2개 이상 → 첫 개 + "⋯"(`#fsheet`, 소유자 `core` — 시트는 한 번에 하나). 표시 내용이 바뀌지 않으면 다시 그리지 않습니다. 320px 폭에서 버튼이 8개일 때 `.fa`가 9px로 눌리던 것을 `@media (max-width: 359px)` 규칙으로 고쳤습니다(`:has(.fa)`일 때만 간격·패딩 축소).
- 장면(`runScene`)은 기존 `event`/`pendingEvents` 큐를 그대로 씁니다(장면 중 부케·단체사진 충돌 없음). 키·제스처 훅은 pointerdown/click/keydown에서 불리며, 훅 배열은 변경하지 않고 통째로 교체합니다(순회 중 등록·해제 안전).
- `_selftest`의 마을 부분은 `features/_selftest/village.js`(`ctx.v.hud`가 있을 때만 쓰임 — 00b 로더 시험의 빈 `ctx.v`와 구분). 모든 `ctx.v` API를 한 번씩 쓰고 `data-st` 표식을 남기며, 시험이 `st-cmd` 명령 채널(`info/state/banner/toast/chime/fx/camfocus/couple/vil/prop/spot/sheet-*/actions-mode/scene/presence/refresh/arrive/misuse`)로 조종합니다.
  그리기 훅은 층마다 색 표식(ground 빨강 · prop 보라 · overhead 초록 · fx 파랑)을 찍어 순서를 픽셀로 검사합니다.
- 시험: `core-extension`에 마을 단계 추가(161 체크 — 전부 꺼짐/A1 · `_selftest` 전체 · A2 핫 토글 · A3 fcrash 부케 · A4 합친 배너 · A5 조용 모드 · A6 출석 필터 · A8 폰 바(1개/2개/ME 없음/320px) · A12 한 기능 전용 · A13 gate 순서) —
  `EXT_ONLY=village`로 이 단계만 돌릴 수 있습니다. `core-features-matrix` 신설(83 체크, `slow`+`exclusive`): 기능 폴더가 있는 기능마다 ① 단독 ② fcrash ③ 전부 켜고 레이아웃·fps(TV 60fps) ④ 4개 페이즈 × 전부 켜기. 기능 폴더가 생기면 자동으로 포함됩니다.
  fcrash 단계는 기능이 `every`/`bus` 같은 **보호된(guarded) 콜백**을 써야 브레이커가 열립니다 — 실제 기능의 스위트도 이를 만족해야 합니다.
- 알려진 한계: ① TV의 "시작 안내" 막대가 첫 클릭 전까지 `tc` 존을 가립니다(기능 칩은 첫 클릭 뒤에 보임) ② 폰 티커는 `.msg2`를 숨깁니다 ③ 사전 등록(pre) 페이즈에서는 하객 완료·내 공간 화면의 스냅·리모컨이 숨겨집니다(의도).

## 6. `_selftest` 완성판 (데모 전용)
모든 API를 1번씩 쓰고, 각 사용처에 `data-st="<항목>"` 표식을 남겨 테스트가 찾게 합니다 (04 §3.3 목록).
`ctx.v.keys.add('t', …)` (선택 키 't'), 장면 key `f-_selftest-wave` (모두 손 흔들기 3초).
한 기능 전용 API(`setPresence`·`setTickerExtra`·`setTickerPrefix`·`setCoupleSprites`)는 `?st=<이름,…>`(데모 전용)일 때만 사용 —
평소에 쥐고 있으면 실제 기능(prereg·translate…)과 owner-conflict가 나기 때문. `?st=` 값: `presence` `tickerExtra` `tickerPrefix` `coupleSprites` `gate`
(`gate` = features.js가 데모에서만 `_selftest`를 gate 기능으로 취급하고, `_selftest` setup이 2초 기다림 — A13용).
`ctx.rootClass('on')` + `html.f-_selftest-on .hud .hz { outline: 1px dashed … }` (루트 클래스 CSS 경로 확인용).

## 7. 테스트
- 기존 12개 스위트: **수정 없이** 초록 (예외: core-layout ALLOW_SMALL 2줄 삭제 — §4.6)
- 00b 의 `core-units`(246) · `core-units-loader`(417) · `core-features-static`(139): **수정 없이** 초록 — 로더·`pageApi`를 건드리는 세션마다 `node tests/run.mjs core-units-loader`를 직접 실행 (`slow` 태그라 `test:quick`에는 없음, ~35초)
- `core-extension.mjs`: 04 §3.3 전부 (4개 페이지 × _selftest)
- `core-features-matrix.mjs`: 04 §3.4 구조 (지금은 대상이 _selftest뿐, 기능 폴더가 생기면 자동 포함)
- perf: 모든 기능 꺼짐 상태 fps가 00a 기준 대비 하락 < 10%

## 8. 수용 기준
| # | 기준 |
|---|---|
| A1 | 기능 전부 꺼짐: 기존 스위트 전부 초록, 골든 동일, perf 하락 < 10%, core-layout 겹침 0 (ALLOW_SMALL 비어 있음) |
| A2 | `_selftest` 켜기/끄기: 4개 페이지에서 흔적 0, 리스너·타이머 누수 0 |
| A3 | `fcrash=_selftest`: TV에서 부케 이벤트가 정상 완료 (기능 오류가 코어 이벤트를 리셋하지 않음) |
| A4 | 배너: 도착 5명 동시 → 합친 배너 1개 + 레벨업(high) 먼저 |
| A5 | 조용 모드: 켜는 동안 배너·차임·불꽃·폴라로이드 0, 끄면 보류된 것 합쳐서 표시 |
| A6 | 출석 필터: `_selftest`가 presence=짝수 id만 → TV에 해당 하객만, `refresh` 후 즉시 반영 |
| A7 | 관리자 ⚙️ 설정: 플래그 3단 스위치·안전 모드·페이즈 강제가 app/settings에 저장되고 다른 탭(TV)에 1초 안 반영 |
| A8 | 폰: 기능 액션 1개 → 인라인, 2개 → 1개 + ⋯ ; 시트 하나만 열림 · ME 없는 폰: 액션이 "방명록 쓰기" 링크 오른쪽, 겹침 0 |
| A9 | 하객: pre 페이즈에서 완료 화면 스냅·리모컨 숨김, live에서 v3.2와 동일 |
| A10 | 문구 덮어쓰기: `_selftest`의 `ctx.texts` → 환영 화면 글자 바뀜, `lang` 이벤트 0번, 끄면 원문 · `rootClass` 켜고 끄기 |
| A11 | 키오스크: 기능 화면에서 `ctx.guest.reset()` → 환영 화면, 입력·사진 비움, `guest:reset` + `guest:mine` null |
| A12 | 한 기능 전용: `?st=presence`로 `_selftest`가 presence를 쥔 상태에서 두 번째 주인(테스트용 가짜 기능) → owner-conflict, `_selftest`는 정상 |
| A13 | 마을 첫 sync는 `whenGateReady` 뒤 — `?st=gate`(데모 전용: `_selftest`를 gate로 취급하고 setup을 2초 끔)에서 첫 `village:guests`가 그 setup이 끝난 뒤에 나옴 (8초 상한은 00b core-units-loader가 검사) |

## 9. 수동 QA
| 기기 | 확인 |
|---|---|
| iPhone Safari | 하객 4단계 → 완료 → 허브(_selftest) 스크롤 · 마을 하단 바 ⋯ 시트 |
| Android Chrome | 같은 확인 + 가로 모드 |
| TV 노트북 | `village.html?demo=1&seed=30&ff=_selftest` — HUD 4존, 스포트라이트, 장면, 키 't' |
| 관리자 (폰·노트북) | ⚙️ 설정 표 가독성, 라이브 패널 버튼 크기 |

## 10. 롤백
`git revert` (세션별 커밋). 실서버에는 기능이 하나도 없으므로(전부 planned) 배포해도 하객 화면 변화는 페이즈 pre 숨김뿐.

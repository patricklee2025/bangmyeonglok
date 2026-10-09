# 02 · 계약 (Contracts) — 기능 모듈이 쓰는 모든 API

> 이 문서는 **v4 기능(feature) 코드와 코어(core) 코드 사이의 약속**입니다.
> 기능 WP(WP-01 ~ WP-18)는 여기 적힌 API만 사용합니다. 여기에 없는 것이 필요하면 코드를 고치지 말고
> `docs/v4/QUESTIONS.md`에 질문을 남기고 멈춥니다.
> 코어 WP(WP-00b, WP-00c)는 이 문서를 **그대로** 구현합니다. 이름·인자·반환값·에러 코드를 바꾸지 않습니다.

용어
- **코어(core)**: v3.2 앱(`public/js/*.js`, `public/*.html`, `public/css/style.css`) + `public/js/core/` (WP-00b/00c가 만드는 공용 모듈)
- **기능(feature)**: `public/js/features/<id>/` 폴더 하나 = 기능 하나. 켜고 끌 수 있고, 꺼져 있으면 흔적이 0.
- **페이지(page)**: `guest`(index.html, 하객 폰) · `kiosk`(kiosk.html, 입구 태블릿) · `village`(village.html, TV와 폰 마을) · `admin`(admin.html)
- **페이즈(phase)**: `pre`(결혼식 전) · `live`(결혼식 당일) · `after`(결혼식 후) · `anniversary`(기념일 주간)
- **ctx**: 코어가 기능의 `setup(ctx)`에 넘겨주는 객체. 기능은 **ctx를 통해서만** 코어와 대화합니다.

---

## 1. 이름 규칙 (전부 정적 테스트로 검사)

| 대상 | 규칙 | 예 (`poll`) |
|---|---|---|
| 기능 id | `^[a-z][a-z0-9]{1,15}$` — 폴더명과 같음 | `poll` |
| 폴더 | `public/js/features/<id>/` | `public/js/features/poll/` |
| 진입 파일 | `features/<id>/index.js` (필수) | |
| 문구 파일 | `features/<id>/i18n.js` (필수) — `const D = {…};` + `export default D;` | |
| 스타일 파일 | `features/<id>/style.css` (선택) | |
| 테스트 | `tests/features/<id>.mjs` (필수) | |
| 사용 안내서 | `docs/guide/<id>.md` (필수, 신랑·신부용 한국어) | |
| CSS 선택자 | 모든 선택자는 `.f-<id>-…` · `[data-f="<id>"]` · `html.f-<id>-…`(루트 클래스, §4 `ctx.rootClass`) 중 하나로 시작. `@keyframes f-<id>-…` | `.f-poll-bar` · `html.f-archive-mode .qr` |
| DOM id | `f-<id>-…` | `f-poll-sheet` |
| DOM 소유 표시 | 기능이 만드는 **최상위** 노드에는 `data-f="<id>"` (ctx.el이 자동으로 붙임) | |
| i18n 키 | `<id>_…` | `poll_title` |
| localStorage 키 | `wgb_f_<id>_…` | `wgb_f_poll_voted` |
| 버스 이벤트(기능이 내는 것) | `<id>:<이름>` 또는 이 문서 §5 표에 있는 이름 | `vote:cast` |
| 키보드 단축키 | 코어 예약 키 사용 금지 (§7.10) | |
| 화면(screen) 이름 | `f-<id>` 또는 `f-<id>-<이름>` | `f-fourcut-cam` |
| 허브/액션/탭 key | `f-<id>` 또는 `f-<id>-<이름>` | `f-poll` |

기능 코드는 **다른 기능 폴더를 import 하지 않습니다.** 기능끼리는 버스 이벤트(§5)로만 대화합니다.
여러 기능이 같이 쓰는 도우미는 코어(`core/ui.js`, §11)에 있습니다.

### 1.1 기능이 import 할 수 있는 코어 모듈 (이 표 밖은 전부 금지 — `core-features-static`이 검사)

| 모듈 (기능 폴더 기준 경로) | 가져와도 되는 것 | 비고 |
|---|---|---|
| `../../core/ui.js` | 전부 (§11) | 공유 도우미 |
| `../../core/phase.js` | `PHASES` · `phaseAt` · `liveWindow` (순수 함수만) | 지금 페이즈는 `ctx.phase()` |
| `../../config.js` | `CONFIG` (읽기 전용) | 데모 여부는 `ctx.demo` (`DEMO` 대신) |
| `../../avatar.js` | 상수와 순수 함수: `getSprite` `normalizeAvatar` `FRAMES` `SPRITE_W` `SPRITE_H` 팔레트(`SKIN` `HAIR` `COLORS`) 색 도구(`shade` `mix`) · WP-02 이후 `coupleLook` `COUPLE_OUTFITS` | 읽기 전용. 반환된 스프라이트를 고치지 않음 |
| `../../scene.js` | `W` `H` `TILE` `Z` `buildGround` `buildProps` | 카드·입장권 배경 그리기용. 마을 안에서는 `ctx.v.*` 사용 |
| `../../report.js` | `computeReport` | 포토북 통계 |
| `./…` (자기 폴더) | 전부 | |

- 그 밖의 코어 파일은 import 하지 않습니다: `store.js`(→ `ctx.store()`·`ctx.db`) · `guest.js` `village.js` `admin.js`(→ `ctx.guest`·`ctx.v`·`ctx.admin`) ·
  `core/bus.js` `features.js` `docdb.js` `settings.js` `schema.js`(→ `ctx`) · `i18n.js`(→ `ctx.t`) · `snaps.js`(→ `ctx.guest.uploadSnap`, `core/ui.compressImage`) ·
  `face.js` · `vendor/*`(QR은 `core/ui.qrCanvas`).
- import 경로는 **고정 문자열**만 (동적 `import()`는 자기 폴더 파일을 고정 문자열로 부를 때만 허용).

---

## 2. 매니페스트 — `public/js/features/index.js`

WP-00b가 **18개 기능 + 자체 점검용 `_selftest`** 항목을 전부 미리 적어 둡니다 (`status: 'planned'`).
각 기능 WP는 **자기 줄의 `status`(필요하면 `default`)만** 바꿉니다. 다른 줄은 건드리지 않습니다.

```js
// public/js/features/index.js  (WP-00b가 작성 · 각 WP는 자기 줄의 status 만 수정)
export const FEATURES = [
  {
    id: 'poll',                          // 폴더명 = CSS 접두사(f-poll-) = i18n 접두사(poll_)
    wp: 'WP-10',
    name: { ko: '실시간 투표', en: 'Live polls' },
    pages: ['guest', 'village', 'admin'],// 'guest' | 'kiosk' | 'village' | 'admin'
    phases: ['live'],                    // 'pre' | 'live' | 'after' | 'anniversary'
    simple: true,                        // 간편(어르신) 모드에서도 보임
    liveSafe: false,                     // "본식 안전 모드"에서도 켜 둠
    gate: false,                         // true = 마을 첫 동기화가 이 기능의 setup을 기다림 (prereg 전용, §2.2 끝)
    status: 'planned',                   // 'planned' → 'beta' → 'ready'
    default: true,                       // status === 'ready' 일 때만 의미 있음
    load: () => import('./poll/index.js'),
  },
  // …
];
```

### 2.1 status의 의미

| status | 뜻 | 누가 바꾸나 |
|---|---|---|
| `planned` | 아직 구현 전. **데모 모드에서 `?ff=<id>`로만** 로드됨 (개발 중 확인용). 실서버에서는 절대 로드 안 됨 | WP-00b가 설정 |
| `beta` | 구현 + 테스트 통과. **관리자가 켜거나 `?ff=`로만** 켜짐 (`default` 무시 = 기본 꺼짐) | 해당 기능 WP 마지막 단계 |
| `ready` | 리허설 통과. `default` 값 적용 | Patrick(리허설 후) — WP가 아님 |

`ready` 권장 시점: **prereg는 결혼식 전에** (TV가 설정 문서를 늦게 받아도 기본으로 켜져서 출석 필터가 빠지지 않음 — §2.2 gate),
**archive는 아카이브 모드 배포 전에** (WP-14 §5). 나머지는 리허설 결과에 따라.

### 2.2 켜짐 판정 — `resolveEnabled()` (core/features.js, 순수 함수)

```text
입력: entry, { page, phase, url, remote, safe, demo, tripped }      (url = parseFF 결과 { all, none, on:Set, off:Set })
 1. page ∉ entry.pages                            → OFF ('page')
 2. page ≠ 'admin' && phase ∉ entry.phases        → OFF ('phase')    ← ?ff= 로도 못 뒤집음 (페이즈는 ?phase= 로 바꿈)
                                                     관리자 페이지는 페이즈와 무관 = 결혼식 전에 투표·식순·엽서를 미리 준비할 수 있게
 3. tripped (이번 세션 서킷 브레이커 작동)          → OFF ('tripped')
 4. url.none 이거나 url.off 에 id                  → OFF ('url')      ← 끄기는 언제나 가능
 5. status === 'planned'                          → (demo && URL켜기) ? ON ('url') : OFF ('planned')
 6. !demo && safe && !entry.liveSafe              → OFF ('safe')     ← 실서버: 안전 모드와 관리자 "끄기"가 URL 켜기보다 우선
 7. !demo && remote.features[id] === false        → OFF ('admin')       (당일 관리자가 끈 기능을 누가 ?ff= 링크로 되살릴 수 없게)
 8. URL켜기                                       → ON ('url')
 9. safe && !entry.liveSafe                       → OFF ('safe')     (데모는 8번이 먼저 = 테스트가 무엇이든 켤 수 있음)
10. remote.features[id] 가 true/false 이면         → 그 값 ('admin')
11. status === 'ready'                            → entry.default ('default')
12. 그 외 (beta)                                  → OFF ('beta')
URL켜기 = url.on 에 id  ||  (url.all && id 가 '_' 로 시작하지 않음)
출력: { on: boolean, source: 'page'|'phase'|'tripped'|'url'|'planned'|'safe'|'admin'|'default'|'beta' }
```

- `?ff=` 문법: `?ff=poll,bingo` 켜기 · `?ff=-bgm` 끄기 · `?ff=all` (전부 켜기 — **`_`로 시작하는 id 제외**, planned는 데모일 때만) ·
  `?ff=none` (전부 끄기) · `?ff=` (빈 값 = 탭 기억 삭제). `_selftest`는 `?ff=_selftest`로만 켜집니다.
  탭 안에서 페이지를 옮겨도 유지되도록 `sessionStorage['wgb_ff']`에 기억합니다 (데모 모드 `wgb_demo`와 같은 방식).
- 간편 모드(`simple`)는 **로드 여부가 아니라 보이는 여부**입니다. `simple: false` 기능의 허브 카드·환영 슬롯·액션은
  간편 모드일 때 코어가 자동으로 숨깁니다 (§6).
- 판정은 `settings` · `phase` 버스 이벤트가 올 때마다 다시 하고, 바뀐 기능만 **핫 토글**(dispose / setup) 합니다.
- **gate** (`gate: true`, prereg 전용): 마을은 첫 동기화(`subscribeGuests`) 전에 `whenGateReady(8000)`을 기다립니다 =
  ① 설정 문서의 **실제 첫 값**(서버 또는 영구 캐시 — 2초 기본값 타임아웃이 아님)이 오고 ② 그 판정에서 켜진 gate 기능의 setup이 끝날 때까지,
  **최대 8초**. 그래야 체크인 안 한 사전 입주자가 TV에 잠깐 우르르 나타났다 사라지지 않습니다 (01 §3). gate가 아닌 기능은 기다리지 않습니다.

---

## 3. 기능 모듈 계약 — `features/<id>/index.js`

```js
// public/js/features/poll/index.js
import D from './i18n.js';

export const i18n = D;                 // 필수. 키는 전부 'poll_' 로 시작
export const css = true;               // 선택. true 면 코어가 ./style.css 를 <link data-f="poll"> 로 붙임 (로드 완료 후 setup 호출)

export async function setup(ctx) {     // 필수. 페이지마다 1번 (핫 토글이면 dispose 후 다시)
  if (ctx.page === 'village') return setupVillage(ctx);
  if (ctx.page === 'admin') return setupAdmin(ctx);
  return setupGuest(ctx);             // 'guest' 또는 'kiosk'
}
```

규칙
1. `setup`은 **3초 안에** 끝나야 합니다 (느린 일은 기다리지 말고 백그라운드로). 3초를 넘기거나 throw 하면 그 기능은
   이번 세션 동안 꺼지고 `feature:error`가 나갑니다. 코어 화면은 아무 영향 없이 계속 동작합니다.
2. **setup은 여러 번 불릴 수 있습니다** (켜기 → 끄기 → 켜기). 모듈 최상위 변수에 상태를 두지 말고 setup 안의 지역 변수로 두세요.
   모듈 최상위에서는 상수 정의와 import 외에 **아무 일도 하지 않습니다** (DOM 접근, 타이머, 구독 금지).
3. 정리(dispose)는 코어가 합니다: ctx로 등록한 모든 것(리스너, 타이머, 구독, 훅, 허브 카드, 탭, HUD, 소품, 키…)이
   자동 해제되고, `[data-f="<id>"]` 노드와 `<link data-f>`가 제거되고, 문구 덮어쓰기가 원래대로 돌아갑니다.
   ctx로 등록할 수 없는 정리가 있으면 `ctx.onCleanup(fn)`.
4. **전역 오염 금지**: `window.xxx =`, 프로토타입 수정, `document.body.className`·`<html>` 클래스 직접 변경, 다른 기능/코어의 DOM 수정 금지.
   예외는 두 가지뿐이고, 둘 다 **WP 문서에 적힌 키·요소만**: 코어 문구 바꾸기 = `ctx.texts()` ·
   코어 요소 숨기기/배치 바꾸기 = `ctx.rootClass(name)` + 기능 CSS `html.f-<id>-<name> <코어 선택자> { … }`.
5. 기능이 만드는 콜백은 코어 레지스트리가 자동으로 `guard`합니다. 60초 안에 오류 5번 → 그 기능만 차단(trip).
6. **꺼진 뒤 정리(off hook)**: 기능이 기기에 오래 남는 것(서비스워커 등)을 만들면 `ctx.markOffHook()`를 호출하고 `features/<id>/off.js`에
   `export async function off() {…}`를 둡니다. 그 기기에서 나중에 이 기능이 **꺼진 상태로 부팅**되면 코어가 `off()`를 1번 호출하고 표식을 지웁니다.
   (표식 = `localStorage['wgb_f_<id>__offhook']`, 코어가 관리)

---

## 4. ctx 공통 API (모든 페이지)

```ts
ctx.id: string                       // 'poll'
ctx.page: 'guest' | 'kiosk' | 'village' | 'admin'
ctx.demo: boolean                    // ?demo=1 데모 모드
ctx.entry: ManifestEntry             // 자기 매니페스트 항목 (읽기 전용)

ctx.lang(): 'ko' | 'en'
ctx.phase(): 'pre' | 'live' | 'after' | 'anniversary'
ctx.t(key: string, vars?: object): string
      // 자기 문구 → 코어 문구 순으로 찾음. vars: { n: 3 } 이면 '{n}'을 치환. 없는 키는 키 그대로 반환
ctx.texts(dict: { ko?: {key: string}, en?: {key: string} }): void
      // 기능이 켜져 있는 동안만 **코어 문구를 덮어씀** (WP 문서에 허락된 키만). 다시 부르면 이 기능의 덮어쓰기를 통째로 교체.
      // 코어가 페이지의 refreshTexts()로 화면 글자를 다시 칠함 ('lang' 이벤트는 나가지 않음 → lang 핸들러 안에서 불러도 안전).
      // 꺼지면 자동 원복 + 다시 칠함
ctx.rootClass(name: string): () => void
      // <html>에 클래스 'f-<id>-<name>' 추가 (name: ^[a-z0-9-]{1,20}$). 끄기·dispose 때 자동 제거, 반환 함수로 즉시 제거.
      // 기능 CSS가 'html.f-<id>-<name> …' 아래에서 코어 요소를 숨기거나 옮길 수 있게 하는 유일한 방법 (예: WP-14 'f-archive-mode')

ctx.el(tag: string, opts?: { cls?: string, text?: string, attrs?: object, style?: object,
                             on?: { [event]: fn }, kids?: (Node|string)[] }): HTMLElement
      // data-f=<id> 자동. on 핸들러는 guard 됨. text 는 textContent (HTML 아님)
ctx.listen(target: EventTarget, type: string, fn, opts?): () => void       // 자동 해제
ctx.every(ms: number, fn): () => void                                        // setInterval, 자동 해제
ctx.after(ms: number, fn): () => void                                        // setTimeout, 자동 해제
ctx.raf(fn: (dt: number, now: number) => void): () => void                   // 자체 애니메이션 루프 (guest/admin 용)
ctx.onCleanup(fn): void
ctx.guard<F>(fn: F): F                                                       // 오류를 서킷 브레이커에 집계

ctx.bus.on(type, fn, { replay?: boolean }): () => void   // replay: 스티키 이벤트의 마지막 값을 바로 한 번 받음. 자동 해제
ctx.bus.emit(type, payload): void                        // §5 표에 있는 이벤트만
ctx.bus.last(type): any

ctx.db: DocDB                         // §9. 자동 해제되는 watch
ctx.settings(): Settings              // §10 정규화된 app/settings
ctx.cfg(): object                     // settings.cfg[<id>] || {}  (관리자가 저장한 이 기능 설정)
ctx.live(): Live                      // §10 정규화된 app/live
ctx.onSettings(fn): off ; ctx.onLive(fn): off   // replay 포함 (바로 1번 + 바뀔 때마다)
ctx.store(): Promise<Store>           // v3.2 코어 스토어 (addSnap, sendEmote, getPhoto(관리자) …). 읽기 위주로 사용
ctx.log(...args): void                // [f:<id>] 접두사. 데모 또는 ?debug=1 일 때만 출력
ctx.markOffHook(): void               // §3 규칙 6 — 이 기기에 off.js 정리가 필요함을 표시

ctx.guest  // page가 guest/kiosk 일 때만 (§6)
ctx.v      // page가 village 일 때만 (§7)
ctx.admin  // page가 admin 일 때만 (§8)
```

코어 API가 던지는 오류 코드 (`e.code`, docdb 오류는 §9):
`owner-conflict` (한 기능만 쓸 수 있는 API를 다른 기능이 이미 쓰는 중 — §7.8) · `reserved-key` (코어 예약 키 등록 — §7.10) ·
`snap-limit` (스냅 5칸 다 참 — §6) · `bad-name` (rootClass·화면·허브 key 형식 위반).
setup 안에서 던져지면 그 기능은 setup 실패로 꺼지고 `feature:error`가 나갑니다 (§3 규칙 1).

**구현 메모 (WP-00b ③에서 확정 — 계약을 정확히 한 것뿐, 위의 호출은 그대로 동작)**

로더 (`core/features.js`)
- `bootFeatures(page, pageApi, opts?)`는 페이지당 한 번만 일합니다 (두 번째 호출은 같은 Promise). reject 는 인자가 틀렸을 때(`TypeError`)뿐 — 기능이 실패해도 부팅은 reject 하지 않습니다.
  resolve = 처음 켜질 기능들의 setup 이 끝났을 때, 또는 `readyTimeoutMs`(기본 3000) 후. `opts` 의 `manifest` · `readyTimeoutMs` · `setupTimeoutMs` · `loadTimeoutMs` · `cssTimeoutMs` 는 **시험 전용**입니다
  (기본값 = 계약 값: setup 3초 · 모듈 import 10초 · style.css 2초 · off hook 3초).
- 첫 판정은 설정 문서의 첫 값(또는 `startSettings`의 2초 기본값)이 오면 합니다. id 가 `_`로 시작하는 `_selftest` 는 **데모에서만** 로드됩니다 (실서버에서는 `?ff=`·관리자 설정이 있어도 `planned` 로 꺼짐).
- 실패 = 그 세션 동안 꺼짐 + `feature:error { tripped: true }`: ① import 실패·10초 초과 ② 모듈 검사 실패 (`setup` 함수와 `i18n` 객체가 없으면 `bad-module`) ③ setup throw·3초 초과.
  **style.css 가 안 붙는 것은 실패가 아닙니다** (`console.warn` 한 줄 → setup 계속). 아직 폴더가 없는 `planned` 기능을 `?ff=all`·`?ff=<id>`로 켜면 `console.error` 대신 `console.warn` 한 줄만 (개발 중 "전부 켜기"가 오류 0 검사를 깨지 않게 — 그래도 그 기능은 꺼지고 `feature:error`는 나감).
- 켜기/끄기는 **기능마다 한 번에 하나**씩 직렬로 처리하고 마지막 판정만 남깁니다. 켜는 도중(import 뒤 · css 뒤 · setup 뒤)에 끄는 판정이 오면 그 자리에서 정리하고 끝냅니다 (`feature:state { on: true }`는 나가지 않음).
- off hook: `off.js`가 없거나 실패(3초 초과 포함)해도 표식은 지워집니다 (`console.warn` 한 줄).
- `featureStates()` 항목 = `{ id, name, status, on, source, tripped, errors, lastError, live: { listeners, timers, raf, watchers, bus } }` — `live` 는 **지금 등록돼 있는 개수**라서 꺼진 뒤 전부 0 이어야 합니다 (A7).
  `trip(id, reason)` = 그 기능을 이번 세션 동안 끔 (모르는 id 면 `false`). 테스트 전용 장치 `?st=gate` · `?fcrash=<id>` 는 데모에서만 읽습니다.

ctx
- `ctx.guard(fn)` 가 돌려주는 함수는 인자를 **6개까지** 그대로 전달합니다 (프레임마다 불리는 훅에서 배열을 만들지 않으려고). 꺼진 뒤에는 아무 일도 하지 않고 `undefined`.
- `ctx.raf(fn)` 의 `fn(dt, now)` 는 둘 다 **초** 단위입니다 (마을 `onUpdate`와 같은 단위 · `dt` ≤ 0.1 · 첫 프레임은 0).
- `ctx.onCleanup(fn)`을 이미 꺼진 뒤에 부르면 그 자리에서 바로 한 번 실행합니다 (오류는 삼킴). 꺼진 ctx 의 `listen` · `every` · `after` · `raf` · `bus.on` · `texts` · `rootClass`(이름 형식 검사는 그대로) = 아무 일도 안 하고 빈 해제 함수.
- `ctx.db`: `watch` 는 자동 해제 · 콜백은 guard · 경로 오류는 `watch` 에서 바로 throw (§9). 꺼진 뒤: 문서 `get` → `null` · 컬렉션 `get` → `[]` · `add` → `null` · 쓰기·`batch().commit()` → 아무 일 없이 resolve · `watch` → 빈 해제 함수.
- `ctx.el(tag, opts)`: 태그는 `^[a-z][a-z0-9-]{0,30}$` 이고 `script iframe frame frameset object embed base meta link style` 은 금지. `attrs` 에 `on*` · `srcdoc` · `style`(→ `style` 옵션을 쓰세요) · `data-f` 는 금지.
  URL 속성(`href src action formaction poster data xlink:href`)은 값에서 **제어문자·공백을 모두 지운 뒤** `javascript:` · `vbscript:` · `data:text/html` · `data:application/xhtml+xml` 이면 거부합니다 (브라우저가 `java<탭>script:` 도 javascript 로 읽기 때문). 모두 `bad-name`. `ctx.el(tag, null)` 도 됩니다.
  **꺼진 뒤에도 `el` 은 노드를 만들지만 추적하지 않습니다** — `await` 뒤에서 DOM 에 붙이는 코드는 그 사이에 꺼졌는지 모릅니다. 비동기 결과는 `ctx.guard(fn)` 으로 감싼 콜백에서 처리하세요 (꺼진 뒤에는 불려도 아무 일도 하지 않음).
  그래도 늦게 붙은 `[data-f]` 노드는 다음 dispose 의 청소에서야 지워집니다 (그 전까지 "꺼지면 흔적 0" 검사에 걸림).
- `ctx.bus.emit(type)` 은 `<id>:…` 이거나 §5 표에서 **그 기능이 내는** 이벤트(소유 기능만)일 때만 — 아니면 `bad-name`. 소유자 표는 코드(`EVENT_OWNERS`)와 이 문서의 §5 표를 `core-units-loader`가 맞춰 봅니다.
- `ctx.onSettings(fn)` · `ctx.onLive(fn)` = 지금 값으로 바로 1번 + 바뀔 때마다. `ctx.cfg()` 는 저장된 값이 없으면 얼린 빈 객체. `ctx.log` 는 데모 또는 `?debug=1` 일 때만 출력합니다.

페이지 연결 (WP-00c가 구현)
- `pageApi.forFeature(scope)` 는 **동기**여야 합니다 (Promise 를 돌려줘도 기능은 받지 못함). 돌려준 `{ guest | v | admin }` 키만 `ctx` 에 복사됩니다. `pageApi.refreshTexts()` 는 `ctx.texts` 와 문구 원복 때 1번씩 불립니다.
- `scope = { id, entry, alive(), add(fn), guard, el, report(err), claim(slot) }` — `add(fn)` 은 dispose 때 불리는 정리 등록 (이미 꺼졌으면 무시), `report(err)` 는 그 기능의 오류로 집계.
  `claim(slot)` 의 slot 은 `presence` · `tickerExtra` · `tickerPrefix` · `coupleSprites` 만 (그 밖은 `bad-name`). 다른 기능이 쓰는 중이면 `owner-conflict` 를 throw 하면서 **부른 기능**의 `feature:error` 로도 집계합니다. 반환 함수로 반납 (dispose 때 자동).

시험
- 로더·ctx·gate·핫 토글·ctx.el 보안·ctx.db·이벤트 소유권 시험은 `tests/suites/core-units-loader.mjs`, 공용 도구는 `tests/lib/units.mjs`(`inPage` `unitTools` `HELPERS`)와 `tests/lib/v4.mjs`.
  `public/js/core/` 에는 정확히 7개 모듈(`bus phase settings schema docdb features ui`)만 있어야 합니다 (`core-features-static` 검사).

---

## 5. 버스 이벤트 (`core/bus.js`)

스티키(✓) = 마지막 값이 저장되고 `{ replay: true }`로 바로 받을 수 있음.
기능은 아래 표의 "기능" 이벤트 중 **자기 것만** emit 합니다. 코어 이벤트를 emit 하지 않습니다.

| 이벤트 | payload | 스티키 | 내는 곳 | 언제 |
|---|---|---|---|---|
| `phase` | `{ phase, source: 'url'\|'admin'\|'auto' }` | ✓ | core/phase | 부팅, 변경 |
| `settings` | `Settings` | ✓ | core/settings | 부팅, 변경 |
| `live` | `Live` | ✓ | core/settings | 부팅, 변경 |
| `lang` | `{ lang }` | ✓ | 각 페이지 코어 | 부팅, 언어 변경 (`ctx.texts` 다시 칠하기 때는 안 나감) |
| `feature:state` | `{ id, on, source }` | – | core/features | 켜짐/꺼짐 |
| `feature:error` | `{ id, message, count, tripped }` | – | core/features | 기능 콜백 오류 |
| `guest:screen` | `{ name, prev }` | ✓ | guest.js `go()` | 화면 전환 |
| `guest:mine` | `{ id, name } \| null` | ✓ | guest.js | 부팅, 제출, `#me=` 처리, `remember()`, 키오스크 초기화(null) |
| `guest:submitted` | `{ gid, name, side, avatar, simple, kiosk, queued }` | – | guest.js | 방명록 저장 직후 |
| `guest:simple` | `{ on }` | ✓ | guest.js `setSimple()` | |
| `guest:reset` | `{}` | – | guest.js `resetAll()` | 초기화 — 키오스크 자동 초기화, "한 명 더 쓰기", `ctx.guest.reset()` (기능도 화면 상태를 비워야 함) |
| `snap:uploaded` | `{ gid, slot, caption, queued, where: 'done'\|'solo'\|'village'\|'feature' }` | – | snaps.js | 스냅 1장 저장 성공 |
| `remote:sent` | `{ gid, type, where: 'done'\|'solo'\|'village' }` | – | guest.js, village.js | 리모컨 1번 전송 |
| `village:ready` | `{ HOST, TOUCH, ME }` | ✓ | village.js | 첫 동기화 후 |
| `village:guests` | `{ list, allIds }` (list = 지금 마을에 있는 하객) | ✓ | village.js `sync()` | 동기화마다 |
| `village:arrived` | `{ gid, via: 'new'\|'checkin' }` | – | village.js | 새 하객이 문으로 입장 (첫 로드 제외) |
| `village:emote` | `{ gid, type }` | – | village.js `onEmote()` | 리모컨 반응이 적용됨 |
| `village:event` | `{ type, key, id, stage: 'start'\|'end' }` | – | village.js | 부케/단체사진/불꽃/기능 장면 |
| `village:level` | `{ level, celebrate }` | ✓ | village.js | 레벨 변경 |
| `village:snaps` | `{ count }` (TV에 보이는 스냅 수) | ✓ | village.js `onSnaps()` (HOST만) | 스냅 목록 변화 |
| `village:tap` | `{ wx, wy, gid }` | – | village.js | 마을을 탭/클릭 (드래그 아님) |
| `admin:guests` | `{ list }` (숨김 포함 전체) | ✓ | admin.js | 스냅샷마다 |
| `admin:tab` | `{ key }` | ✓ | admin.js | 탭 전환 |
| `checkin:done` | `{ gid, via }` | – | 기능 prereg | 내 체크인 저장 |
| `couple:sprites` | `{ look, groom: Frames, bride: Frames }` | ✓ | 기능 couple | 커플 모습 바뀜 (카드·입장권·감사 카드가 사용, 없으면 config 기본) |
| `bgm:state` | `{ track, playing, volume }` | ✓ | 기능 bgm | 재생 상태 변화 (테스트·관리자 표시용) |
| `poll:result` | `{ pid, top }` | – | 기능 poll | 투표 결과 발표 (TV) |
| `live:cue` | `{ cue, seq, fresh }` | ✓ | 기능 live | 큐 적용 (fresh=방금 누른 큐) |
| `vote:cast` | `{ pid, gid, choice }` | – | 기능 poll | 내 투표 저장 |
| `bingo:line` | `{ gid, lines, all }` (`all` = 16칸 전부) | – | 기능 bingo | 폰: 내 새 줄 완성 직후 · **TV(HOST): `bingo` 컬렉션에서 어떤 하객의 lines 증가를 감지했을 때** (첫 스냅샷 제외 — TV 효과음·배너가 이걸로 움직임) |
| `meter:milestone` | `{ temp, pct }` (`temp` = 50·70·85·100) | – | 기능 meter (TV) | 이정표 온도 50℃·70℃·85℃·100℃ 처음 도달 |

버스는 동기 호출입니다. 핸들러 오류는 그 핸들러의 기능에만 집계되고 다른 핸들러는 계속 불립니다.
버스는 **그 기기(그 탭) 안에서만** 흐릅니다. 하객 폰에서 난 일(투표·빙고·체크인)을 TV가 알려면 docdb 컬렉션을 구독해야 합니다 —
그래서 TV의 bingo 기능이 컬렉션 변화를 보고 `bingo:line`을 다시 내고, 온도계(WP-08)는 이벤트가 아니라 `bingo`·`votes` 컬렉션을 직접 셉니다.

---

## 6. 하객 페이지 API — `ctx.guest` (page = guest | kiosk)

```ts
ctx.guest.kiosk: boolean
ctx.guest.simple(): boolean
ctx.guest.me(): { id: string, name: string } | null
      // 이 폰이 기억하는 마지막 하객 (wgb_mine). 키오스크는 방금 제출한 하객(초기화 전까지)만
ctx.guest.screen(): string                          // 'welcome' | 'info' | 'photo' | 'custom' | 'act' | 'done' | 'remote' | 'f-…'
ctx.guest.go(name: string): void                    // 코어 화면 또는 기능 화면으로 이동
ctx.guest.back(): void                              // 직전 화면으로
ctx.guest.toast(msg: string, ms?: number): void
ctx.guest.villageUrl(gid?: string): string          // 'village.html?me=…' (데모면 &demo=1)
ctx.guest.remember({ id, name }): void              // 이 폰이 이 하객을 기억 (wgb_mine에 추가 + 'guest:mine'). 키오스크에서는 무시
ctx.guest.openMine(): boolean                       // 코어 "내 사진·리모컨" 화면(#s-remote)을 기억된 하객으로 열기 (없으면 false)
ctx.guest.reset(): void
      // 코어 resetAll()과 같음: 작성 중 내용·사진·음성 비움 → 'guest:reset' (키오스크면 'guest:mine' null, 기본 언어) → 환영 화면.
      // 키오스크 기능이 자기 흐름을 끝낼 때 사용 (예: WP-01 체크인 완료 20초 뒤). 폰에서는 "한 명 더 쓰기"와 같음 — 기억(wgb_mine)은 그대로
ctx.guest.setCoupleSprites(groom: Frames | null, bride: Frames | null): void
      // 환영 화면 신랑·신부 미니 무대의 스프라이트 교체 (null = config 기본). Frames = getSprite() 결과 형식.
      // 한 기능만 (couple) — 다른 기능이 이미 설정했으면 owner-conflict (§7.8 규칙)

// 기능 화면 — <section class="screen" id="s-<name>">를 main.app 안에 만들어 줌
ctx.guest.screens.add(name: 'f-<id>' | 'f-<id>-<x>', {
  render(section: HTMLElement): void,               // 처음 1번. 하단 버튼은 직접 .sticky-foot 으로 만들 것
  onEnter?(): void, onLeave?(): void,               // 화면 들어올 때/나갈 때 (카메라는 onLeave 에서 반드시 끔)
}): HTMLElement

// 허브 — 완료 화면(#s-done)과 "내 사진·리모컨" 화면(#s-remote)에 카드/행 추가
ctx.guest.hub.add({
  key: 'f-<id>' | 'f-<id>-<x>',
  order: number,                                    // 코어: 스냅 20 · 리모컨 30. 기능 순서는 05-ux §3.1
  size: 'row' | 'card',                             // row = 한 줄 런처(아이콘·제목·›), card = 펼친 상자
  icon?: string, title: string,                     // title 은 ctx.t() 결과
  render?(box: HTMLElement, who: { gid, name, where: 'done' | 'solo' }): void   // card 일 때
  onClick?(who): void,                              // row 일 때 (보통 ctx.guest.go('f-…') 또는 시트)
  when?(who): boolean,                              // false 면 숨김 (상태 바뀌면 ctx.guest.hub.refresh())
}): () => void
ctx.guest.hub.refresh(): void

// 환영 화면 슬롯 (#slot-welcome: 히어로 카드와 시작 버튼 사이)
ctx.guest.welcome.add(el: HTMLElement, { order: number }): () => void

ctx.guest.mountSnapUploader(box, { gid, name, onUploaded }): void   // 코어 스냅 업로더 재사용 (where:'feature')
ctx.guest.uploadSnap({ gid, name, dataURL, caption }): Promise<{ slot, queued }>
      // 이미 만든 JPEG(≤ 850KB)를 스냅 1칸으로 올림 (코어 store.addSnap + 이 폰의 스냅 개수 기록 + 'snap:uploaded' where:'feature').
      // 5칸이 다 찼으면 e.code 'snap-limit'. 남은 칸 수: ctx.guest.snapsLeft(gid)
ctx.guest.snapsLeft(gid): number
```

규칙
- 코어 화면(`welcome`…`remote`)의 DOM을 직접 고치지 않습니다. 끼어들 곳은 hub · welcome 슬롯 · 기능 화면뿐입니다.
- 키오스크: `wgb_mine`·`wgb_f_*`에 개인 정보를 남기지 않습니다. `guest:reset`을 받으면 기능 상태를 전부 비웁니다.
  키오스크에서 기능 흐름이 끝나면 직접 `go('welcome')` 하지 말고 `ctx.guest.reset()` (코어 입력·사진까지 함께 비워야 다음 사람이 안전).
- 간편 모드: `simple: false` 기능의 hub/welcome 항목은 코어가 자동으로 숨깁니다.
- 페이즈 `pre`에서는 코어가 완료 화면의 스냅 업로더·리모컨을 숨깁니다 (`html[data-phase="pre"]`). TV가 아직 없기 때문.

구현 메모 (WP-00c ①, 계약과 달라진 것 없음 — 모호했던 곳을 정한 것)
- `hub.add`의 `title`은 문자열 **또는 함수**. 함수면 언어가 바뀔 때·`ctx.texts` 뒤에 다시 불러 행 제목을 갱신합니다 (문자열은 기능이 정한 그대로 — 언어를 따라가게 하려면 함수로).
- 허브는 **화면에 들어올 때** 그리고 `hub.refresh()`·`hub.add()` 때 판정합니다. 같은 하객이면 카드를 다시 그리지 않습니다 (카드 안의 상태는 기능 것). (2026-10, WP-09) 이때 **함수 `title`은 다시 불러** 행 제목을 갱신합니다 — 빙고 "n줄 · d/16"처럼 숫자가 바뀌는 제목은 `hub.refresh()`로 갱신. `when()`이 `false`일 때만 숨김 — `undefined`는 보임, 던지면 숨김 + 오류 집계.
  이미 완료 화면을 보고 있는 하객에게 기능이 (핫 토글로) 켜지면 바로 나타납니다.
- `who`: 완료 화면 = 방금 제출한 하객, 내 공간 화면 = `openMine()`이 연 하객. 키오스크에는 허브가 없습니다 (환영 슬롯은 있음).
- 기능 화면이 꺼질 때: 그 화면에 있던 하객은 직전 화면(없으면 환영)으로, 키오스크는 `reset()`으로 옮깁니다 — 빈 화면이 남지 않음. 꺼진 뒤에는 `onLeave`가 불리지 않습니다 (기능의 `onCleanup`에서 카메라 등을 정리).
- `ctx.guest.go(name)`은 없는 화면이면 오류(`bad-name`)를 던집니다. `back()`은 직전 화면이 없어졌으면 환영으로.
- `guest:screen.prev`는 실제로 보이던 화면입니다 (`resetAll()`이 `current`를 먼저 `welcome`으로 바꿔도 마찬가지). 같은 화면으로 다시 `go`하면 `onLeave`→`onEnter`가 한 번씩 불립니다.
- `guest:simple`은 값이 **실제로 바뀔 때만** 나갑니다 (`paintTexts()`가 같은 값을 다시 적용해도 안 나감 — `ctx.texts`로 인한 반복 방지). 부팅 때 `{ on: false }` 1번.
- `snap:uploaded`는 snaps.js가 `setSnapSink`로 페이지가 꽂아 준 함수를 통해 냅니다 (기본 `where`는 `'village'` — 마을만 `where`를 안 넘김). 기능의 `uploadSnap`은 이 폰의 스냅 개수·썸네일 기록까지 같게 처리합니다.
- `setCoupleSprites(groom, bride)`의 프레임은 `.idle`이 필요 (`blink`·`wave`가 없으면 `idle`로 대신). 둘 다 `null`이면 기본으로 복귀. 다른 기능이 쥔 상태에서 부르면 `owner-conflict`.

---

## 7. 마을 API — `ctx.v` (page = village)

TV(HOST)와 폰(TOUCH, ME) 모두 같은 village.js 입니다. 기능은 `ctx.v.HOST`로 갈라서 그립니다.
좌표는 **월드 픽셀** (480 × 272, 타일 16px) 기준입니다. 오버레이 함수는 화면 픽셀 변환 도구를 받습니다.

### 7.1 상태 (읽기 전용)
```ts
ctx.v.HOST: boolean            // TV (전체 하객 반응 구독, QR 표시)
ctx.v.TOUCH: boolean           // 폰 레이아웃
ctx.v.ME: string | null        // 이 폰의 하객 id
ctx.v.W = 480, ctx.v.H = 272, ctx.v.TILE = 16
ctx.v.Z                        // scene.js 구역 사각형 (타일 단위, 끝 미포함) — 고치지 말 것
ctx.v.SP()                     // 현재 활동 스팟 { fish, dance, chat, eat, photo, walk, door, group } (레벨마다 바뀜)
ctx.v.state(): { night, level, quiet, phase, event: null | { type, key }, cam: { x, y, w, h, S } }
ctx.v.guests(): Guest[]        // 지금 마을에 있는 하객 (숨김·부재 제외). 수정 금지
ctx.v.allIds(): Set<string>    // 숨김 포함 전체 하객 id
```

### 7.2 주민 · 신랑신부
```ts
ctx.v.villager(gid): Villager | null ; ctx.v.villagers(): Villager[]
  // Villager = { gid, g, x, y, facing, state, act } (읽기) +
  //   .emote(type: 'heart'|'clap'|'dance'|'jump'|'greet', { glow?: boolean, short?: boolean })
  //   .glow(sec) · .hop() · .icon(ch: string, sec)   // 머리 위 작은 아이콘 ('!', '♥' …)
  //   .walkTo([tx, ty], face?) · .hold(face) · .free()   // 장면(scene) 안에서만 사용
ctx.v.couple(): [Couple, Couple]       // [신랑, 신부] = { x, y } + .wave() .hop() .face(dir) .walkTo(x, y, speed?) .home()
ctx.v.setCoupleSprites(groom: Frames | null, bride: Frames | null): void   // 한 기능만 (couple) — §7.8 규칙
```

### 7.3 그리기 훅 (전부 자동 해제 · 자동 guard)
```ts
ctx.v.addProp({ img?: CanvasImageSource, draw?(g, time), x, y, base, kind?, w?, h? }): { set(patch), remove() }
      // 월드 소품. base(발 위치 y)로 주민과 함께 y-정렬. img 또는 draw 중 하나. 탭 판정에 w/h 사용
ctx.v.onDraw(fn(g: CanvasRenderingContext2D, { time, dt, night, level }), { layer: 'ground' | 'overhead' | 'fx' })
      // ground: 바닥 위·주민 아래 · overhead: 줄전구 층 위 · fx: 파티클 다음(조명/불꽃 전)
ctx.v.decorate(fn(g, villager, { x, y, time }))     // 각 주민을 그린 직후 (왕관·배지 등)
ctx.v.onOverlay(fn(octx, { X, Y, k, fs, dpr, time, w, h }), { layer: 'under-tags' | 'over-tags' | 'top' })
      // 오버레이 캔버스(글자용). X(wx), Y(wy) = 화면 픽셀. fs = 현재 기본 글자 크기(px)
ctx.v.onUpdate(fn(dt: number, time: number))       // 매 프레임 그리기 전. 무거운 일 금지 (05-ux §6)
ctx.v.anchor(el, { x, y, w, h, interactive?: boolean }): { set(patch), remove() }
      // (2026-10, WP-20 신규) ctx.el 로 만든 DOM 상자를 월드 사각형(월드 px) 위에 붙임. #stage 안의 #wdom 층(소유자 core)이라
      // 카메라·확대와 함께 저절로 움직임(CSS %, 프레임마다 하는 일 없음). 월드 캔버스 위 · 이름표/말풍선(오버레이)·HUD 아래.
      // interactive: true 면 그 상자의 누름·끌기는 마을 탭(village:tap)·카메라 끌기가 아님. 글자 크기는 CSS 변수 --S(월드 1px의 화면 px)
      // el.dataset.f 가 이 기능이 아니면 throw('bad-arg'). 기능이 꺼지면 자동 제거
```

### 7.4 효과 · 알림
```ts
ctx.v.fx.heart(x, y) · .sparkle(x, y, n?, colors?) · .note(x, y) · .flash(x, y)
ctx.v.fx.fireworks(n?)          // 조용 모드면 무시
ctx.v.fx.confetti(x, y, n?)     // (WP-00c 신규) 색종이
ctx.v.banner(text, { ms?: 5000, kind?: '' | 'gold' | 'small', priority?: 'normal' | 'high' })
      // 큐. 'high' 는 앞에 끼움. 도착 배너가 3개 이상 밀리면 코어가 "○○님 외 N명" 으로 합침. 조용 모드면 보류
ctx.v.toast(text)                // 작은 배너, 20초에 1번
ctx.v.chime(big?: boolean)       // 소리 꺼짐/조용 모드면 무시
ctx.v.camFocus(x, y, sec)        // 폰: 잠깐 카메라 이동 (TV는 전체 화면이라 영향 적음)
```

### 7.5 HUD · 스포트라이트
```ts
ctx.v.hud.add(el, { zone: 'tl' | 'tr' | 'rm' | 'tc', order?: number, phone?: false | 'tl' | 'tc' }): () => void
      // TV 존: tl=레벨 패널 아래 · tr=QR 아래 · rm=오른쪽 가운데 · tc=위 가운데. phone: 폰에서 보일 존(기본 false=숨김)
      // 크기 단위는 CSS 변수 --s (월드 1px) — 05-ux §2
ctx.v.spotlight.show({ key, render(box): (() => void) | void, ms: number, priority?: 'normal' | 'high' }): Promise<void>
      // 화면 가운데 "한 번에 하나" 자리 (스냅 폴라로이드와 공유). 이벤트·조용 모드 중에는 대기. TV 전용
```

### 7.6 폰 UI
```ts
ctx.v.actions.add({ key, icon, label, order, when?(): boolean, onClick() }): () => void
      // 폰 하단 바의 기능 자리 1칸: 보이는(when) 기능 액션이 1개면 그 버튼,
      // 2개 이상이면 order가 가장 작은 1개 + "⋯"(나머지를 시트 목록으로) (05-ux §3.2)
      // 자리: 기억된 하객(ME)이 있으면 이모트 5개 + 📷 뒤 · ME가 없으면 코어 "✍️ 방명록 쓰기" 링크(a.sign) 오른쪽.
      // when() 은 sync·live·settings 변화 때 코어가 다시 평가 (ctx.v.actions.refresh() 로도). TV(HOST)에서는 아무것도 안 함
ctx.v.actions.refresh(): void
ctx.v.sheet.open({ key, title, render(body): (() => void) | void, onClose?() }): void   // 일반 바텀시트 (#fsheet), 한 번에 하나
ctx.v.sheet.close(): void
ctx.v.onTap(fn({ wx, wy, gid }))      // 마을을 탭/클릭 (드래그 아님). gid = 그 자리 주민 (없으면 null)
```

### 7.7 장면(scene) — 부케·단체사진과 같은 줄에 서서 하나씩
```ts
ctx.v.runScene({
  key: string,                 // 'f-live-kiss'
  seed: string | number,       // 같은 seed → TV와 모든 폰에서 같은 결과
  start(s): void,              // s.rand(), s.crowd(n) (seed로 섞은 주민 n명), s.formation(list, slots, face)
  update(s, dt): void,         // s.t(초), s.count = 3|2|1|null (카운트다운 숫자 표시), s.done() 으로 끝
  end?(s): void,               // 코어가 releaseAll 해줌
  maxSec?: number,             // 안전장치 (기본 40초 후 강제 종료)
}): void
ctx.v.formation(villagers, slots: [tx, ty][], face) · ctx.v.releaseAll()
```

### 7.8 출석(presence) · 문구 제공자
```ts
ctx.v.setPresence(fn(g: Guest) => boolean): void     // 지금 마을에 있는 하객 판정 (prereg 전용, 매니페스트 gate:true — §2.2)
ctx.v.clearPresence(): void                          // (dispose 시 자동)
ctx.v.arrive(gid, { via: 'checkin' }): void          // 다음 동기화 때 이 하객을 "방금 도착"으로 (문에서 입장 연출).
                                                      // via가 'new'가 아니면 코어 기본 도착 배너는 생략 → 기능이 자기 문구로 ctx.v.banner
ctx.v.refresh(): void                                // 마지막 하객 목록으로 동기화 다시 실행
ctx.v.setTickerExtra(fn(g: Guest) => string | null): void   // 하단 티커 둘째 줄 (WP-06 번역)
ctx.v.setTickerPrefix(fn(g: Guest) => string | null): void  // 티커 메시지 앞머리, 같은 줄 앞에 작게 (WP-18 "1년 전 오늘 · ")
```
**한 기능 전용 API** (`setPresence` · `setTickerExtra` · `setTickerPrefix` · `setCoupleSprites`(마을·하객)):
- 처음 부른 기능이 주인. 같은 기능이 다시 부르면 교체. 그 기능이 꺼지면(dispose) 자동 해제 → 코어 기본으로.
- **다른 기능이 이미 주인이면** `owner-conflict` 오류를 throw 하고 `feature:error { id: <부른 기능> }`를 냅니다 (조용히 덮어쓰지 않음).
  매니페스트상 주인은 하나뿐이므로 이 오류는 "새 기능이 남의 자리를 쓰려 함" = 설계 위반 신호입니다.

### 7.9 소리 · 입력
```ts
ctx.v.audio(): AudioContext | null      // 첫 사용자 동작 후 생김
ctx.v.soundOn(): boolean                // M 키 상태
ctx.v.onGesture(fn)                     // 사용자 동작(클릭/키/탭) 이벤트 핸들러 안에서 호출됨 (오디오 해제, Translator.create)
ctx.v.keys.add(key: string, fn, label: { ko, en }): () => void
```

### 7.10 예약 키 (TV 키보드)
`f h q m n s b g x d l e` 와 `Escape`, 방향키, 스페이스. 기능은 이 키를 쓰지 않습니다(등록하면 `reserved-key` 오류). 기능 키는 WP에 지정된 것만
(지금 배정: `u` = WP-07 bgm · `t` = `_selftest`).

### 7.11 조용 모드 (코어가 처리)
`live.quiet === true` 이면 코어가: 배너 보류(끝나면 합쳐서 표시) · 효과음/차임 무시 · 불꽃놀이 무시 · 스포트라이트 대기 ·
폰 상단에 "🤫 본식 진행 중" 칩. 기능은 `ctx.v.state().quiet`을 보고 **자기 소리·움직임도 멈춥니다**.

구현 메모 (WP-00c ③, 계약과 달라진 것 없음 — 모호했던 곳을 정한 것 · 작은 추가는 ★)
- **배너 큐**: 보이기 시작하는 시점을 한 마이크로태스크 뒤로 미뤄서 한 번의 동기화에서 쏟아진 배너가 정렬·합쳐진 뒤 처음 하나가 나갑니다. 큐에 **도착 배너만** 있을 때는 0.8초 모읍니다
  (체크인이 몇 초 사이에 줄줄이 들어와도 합쳐지고, 그 사이에 올라가는 레벨업(`high`)이 먼저 나가도록 — 한 명만 도착하면 0.8초 늦게 나올 뿐). 합친 문구: KO `🎉 {첫 이름}님 외 {n}명이 도착했어요!` / EN `🎉 {name} and {n} others arrived!`.
  조용 모드가 풀리면 보류분이 같은 규칙으로 합쳐져 나갑니다. `ctx.v.banner`의 `ms`는 1.5~15초로 잘리고, 글자는 120자까지.
- **출석(presence)**: 규칙의 반환값은 참/거짓으로만 봅니다. 규칙이 **예외를 던지면 그 하객을 보여 주고(fail-open)** 오류는 그 기능 몫으로 셉니다 (마을이 텅 비는 것보다 낫고, 5회/60초면 서킷 브레이커가 기능을 끕니다).
  규칙에 걸러졌던 하객이 나중에 나타나면(규칙 해제 · 기능 꺼짐 · 조건 충족) **`arrive()`가 없으면 "새 도착"이 아닙니다** — 입장 연출·배너·차임 없이 조용히 들어옵니다 (prereg가 갑자기 꺼져도 마을에 폭죽이 터지지 않게).
  `arrive(gid)`의 `via` 기본값은 `'checkin'`. `village:arrived`의 `via`는 그 값(코어가 만든 도착은 `'new'`). `via`가 `'new'`가 아니면 코어 도착 배너만 생략되고 입장 연출·차임·티커는 그대로입니다.
  `refresh()`를 동기화 안에서 부르면 한 틱 뒤에 실행됩니다. 이미 마을에 있는 하객에게 `arrive()`를 불러도 소용없습니다(다음 동기화에서 버려짐).
- **★ `village:tap`·`onTap` 페이로드**: `{ wx, wy, gid }`에 더해, 탭한 자리가 `addProp`의 `w × h` 상자 안이면 `prop: <그 소품의 kind>`가 붙습니다 (없으면 키 자체가 없음). 가장 앞(화면 아래)의 소품 하나. HUD의 기능 칩 위 탭 · 버튼 · 시트 위 탭은 월드 탭이 아닙니다.
- **제스처 훅**은 `pointerdown` · `click` · `keydown`마다 불립니다 (사용자 활성화 문맥 안) — 같은 일을 여러 번 해도 되게(멱등) 만드세요. 오디오 해제처럼 "이미 했으면 건너뜀"인 일에 맞습니다.
- **스포트라이트 · 폴라로이드**는 가운데 자리 하나를 번갈아 씁니다 (폴라로이드가 기다리고 있으면 스포트라이트 다음 차례는 폴라로이드). `ms`는 1.5~20초(기본 7초), `priority:'high'`는 대기열 앞(높은 것끼리는 순서 유지). 표시가 끝나면 0.7초 페이드 뒤에 `#spot`이 비워지고 Promise가 풀립니다. 폰에서는 바로 풀립니다. 표시 중·대기 중 기능이 꺼지면 즉시 닫히고 Promise가 풀립니다 (render 정리 함수 호출).
- **코어가 가진 컨테이너**(`#spot` · `#fsheet`)에는 `data-f`를 달지 않고 `data-owner`(+`data-key`)를 답니다 — 로더가 꺼진 기능의 `[data-f="<id>"]` 노드를 지우기 때문에, 코어의 자리가 같이 지워지면 안 됩니다. 폰 하단 "⋯" 시트의 주인은 `core`입니다.
- **폰 하단 바**: 보이는 액션이 1개면 인라인, 2개 이상이면 첫 번째 + "⋯"(나머지 목록 시트). 버튼은 `data-f="<id>"` · `data-fa="<key>"`. 그림이 같으면 다시 그리지 않습니다 (탭 중에 버튼이 사라지지 않게).
  ME 없는 폰은 `a.sign` 링크 오른쪽에 54×54 한 칸. 폭 ≤ 359px에서 `:has(.fa)`가 있으면 간격·안쪽 여백을 줄여 8버튼(이모트 5 + 📷 + 액션 + ⋯)이 한 줄에 들어갑니다 (각 ≥ 32px).
  조용 칩은 폰 `tc` 띠에 있고, 켜져 있는 동안 `tc` 존은 그 아래로 내려갑니다. 폰에서는 티커 둘째 줄(`msg2`)을 그리지 않습니다 (한 줄 티커). TV 위쪽 가운데는 처음 클릭할 때까지 키 안내줄이 `tc` 존을 덮습니다.
- **그리기 훅** 배열은 등록·해제 때 **새 배열로 교체**합니다 (순회 중 해제해도 안전). 프레임마다 쓰는 info 객체(`time`·`dt`·`night`·`level` / `{x, y, time}` / 오버레이 도구)는 재사용되므로 **저장하지 마세요**. 훅 하나가 던지면 그 훅만 `scope.report`로 집계되고 같은 프레임의 나머지는 계속 그려집니다.
  `decorate`는 주민에게만 (신랑신부 제외). `addProp`의 `base`로 주민·소품이 y-정렬되고, `ground` 층은 땅 위·모든 월드 항목 아래라 코너의 나무가 가립니다.
- **장면**: 코어의 `event`/`pendingEvents` 줄에 서서 하나씩 실행합니다 (`event = { type: 'scene', key, … }`). `s.count`는 기존 카운트다운 오버레이가 읽고, `maxSec` 기본 40초가 지나면 강제로 끝냅니다. 같은 `seed` → TV와 폰에서 같은 `s.crowd(n)`·`s.rand()`.
  `Villager.walkTo/hold/free`는 장면 안에서만 (밖이면 `not-in-scene`). `village:event`는 `{ type, key, id, stage: 'start'|'end' }` — 코어 이벤트의 `key`는 `bouquet` · `group` · `fireworks`, 장면은 `runScene`의 `key`, `id`는 `seed`.
- **커플**: `walkTo(x, y, speed = 24)`는 직선 이동 · `home()`은 제자리로 · `face(dir)`은 `up|down|left|right` 아니면 `bad-arg`. `setCoupleSprites`는 `blink` · `wave` · `back`이 없으면 `idle`로 채웁니다 (부케 던질 때 신부가 뒤돌아야 하므로 `back`이 꼭 필요).
- **오류 코드**: `reserved-key` · `bad-key`/`bad-arg` · `duplicate` · `bad-name`(`f-<id>-…` 이름 규칙) · `not-in-scene` · `owner-conflict`(메시지에 지금 주인의 id가 들어감). 기능이 직접 잡아서 처리한 코드 오류는 그 기능의 오류로 세지 않습니다.
- **`_selftest` 전용 `?st=`**(데모 전용): `presence` · `tickerExtra` · `tickerPrefix` · `coupleSprites` · `gate`(setup이 2초 걸리는 gate 기능으로 취급 — A13). 점검용 출석 규칙은 "아이디 글자 코드 합이 짝수".

---

## 8. 관리자 API — `ctx.admin` (page = admin, 로그인된 관리자만)

관리자 페이지에서는 기능이 **페이즈와 무관하게** 로드됩니다 (§2.2 2번). 그래서 결혼식 전(pre)에도 식순·투표·엽서·번역을 미리 준비할 수 있습니다.
지금 페이즈가 그 기능의 phases 밖이면 코어 ⚙️ 설정 표가 "⏸ 지금은 하객 화면에 안 보임 (페이즈)"이라고 알려 줍니다 — 기능이 따로 안내할 필요 없음.
관리자 쪽 기능 코드는 "지금 페이즈"에 따라 동작을 바꾸지 않습니다 (예외는 WP에 적힌 경우만).

```ts
ctx.admin.tabs.add({ key: 'f-<id>', label: string, order: number, render(section): void, onShow?(), onHide?() }): () => void
      // 코어 탭 order: 방명록 10 · 하객 스냅 20 · 타임캡슐 30 · 리포트 40 · ⚙️ 설정 90
ctx.admin.live.add(el, { order: number }): () => void      // 상단 "TV 마을 이벤트" 패널 옆 라이브 슬롯 (#live-slot)
ctx.admin.settings.add({ render(box): void }): () => void  // ⚙️ 설정 탭의 이 기능 줄 아래 접이식 영역
ctx.admin.guests(): Guest[]                                 // 숨김 포함 전체 (코어가 구독 중인 목록)
ctx.admin.user(): { email: string }
ctx.admin.saveCfg(patch: object): Promise<void>             // app/settings.cfg.<id> 에 병합 저장
ctx.admin.setLive(patch: Partial<Live>): Promise<void>      // app/live 병합 저장 (updatedAt 자동)
ctx.admin.alert(msg: string): void                          // 상단 상태 줄
ctx.admin.photo(gid): Promise<string | null>                // 원본 사진 (캐시)
ctx.admin.backup.add(name: string, fn: async (zip, { safe, addB64 }) => void): () => void
      // "⬇ 전체 백업(ZIP)"에 백업 파트 추가. name = 파트 이름(보통 대표 파일 'f-<id>/xxx.json').
      // fn 안에서 zip에 넣는 모든 경로는 'f-<id>/' 로 시작 (코어가 검사 — 어기거나 오류면 그 파트만 MISSING.txt 에 기록, 나머지 백업은 계속)
ctx.admin.download(name, href) · ctx.admin.downloadBlob(name, blob)   // safeData 검사 포함
```

구현 메모 (WP-00c ②, 계약과 달라진 것 없음 — 모호했던 곳을 정한 것)
- `tabs.add`: `key`는 `f-<id>` 또는 `f-<id>-<x>`(아니면 `bad-name`), `label`은 문자열 **또는 함수**(언어가 바뀌거나 `ctx.texts` 뒤에 다시 불러 버튼 글자를 갱신), `render(section)`은 필수이며 탭을 만들 때 1번 불립니다(보일 때마다가 아님 — 매번 다시 그리려면 `onShow`).
  버튼은 `order` 순서로 끼워 넣어집니다(`guests 10 · snaps 20 · capsules 30 · report 40 · settings 90`). 같은 key가 이미 있으면 `duplicate`. 보고 있던 탭이 꺼지면 방명록 탭으로 돌아가고 `admin:tab { key: 'guests' }`가 나갑니다 (이때 꺼진 기능의 `onHide`는 불리지 않음).
- `onShow`는 탭 버튼을 누를 때마다(같은 탭을 다시 눌러도), `onHide`는 다른 탭으로 옮겨 갈 때만 불립니다. `admin:tab`은 `onShow`보다 먼저 나갑니다. 부팅 직후 `admin:tab { key: 'guests' }` · `lang` 이 한 번씩 나갑니다 (스티키라 `replay`로 받을 수 있음).
- `live.add(el, { order })`: `#live-slot` 안에서 `order` 순으로 정렬 (같으면 먼저 넣은 것 앞). 비어 있으면 자리를 차지하지 않습니다.
- `settings.add({ render(box) })`: 그 기능의 ⚙️ 표 줄 아래 접이식 영역이 생기고(`render`는 1번), 기능이 꺼지면 영역이 사라지며 줄의 접이식도 숨겨집니다. 한 기능이 여러 번 등록하면 등록 순서대로 쌓입니다.
- `backup.add(name, fn)`: `fn(zip, { safe, addB64 })`의 `zip`은 `file(path, data, opts)` · `folder(name)`만 있는 래퍼 — 파트가 **끝까지 성공해야** 진짜 ZIP에 들어갑니다. 경로 규칙(`f-<id>/`로 시작, `..` · `\` 금지, 200자 이하)을 어기거나 오류 · 30초 초과면 그 파트의 파일은 하나도 안 들어가고 `MISSING.txt`에 `기능 <id>: <name> — <이유>` 한 줄. 코어 파일 → `app/settings.json` · `app/live.json` → 기능 파트 → `MISSING.txt` 순서.
- `guests()` · `emit('admin:guests')`의 `list`는 사본입니다. `user()`는 `{ email }`(데모는 `'demo'`). `alert(msg)`는 `#admin-alert`(8초 뒤 사라짐). `saveCfg` · `setLive`는 꺼진 뒤에는 아무 일도 하지 않고 resolve.
- 기능은 로그인한 관리자에게만 부팅합니다(`bootFeatures('admin')`은 로그인 확인 뒤 1번). 로그아웃·재로그인에서는 같은 로더를 재사용합니다. 관리자 페이지는 한국어 전용이지만 기능의 `ctx.t`는 기기의 `wgb_lang`을 따릅니다 (관리자 쪽 문구를 한국어로 고정할지는 열린 질문).

---

## 9. 문서 DB — `ctx.db` (`core/docdb.js`)

v3.2 `store.js`는 그대로 두고, v4 데이터는 전부 docdb로 읽고 씁니다. 같은 Firestore 인스턴스(store.backend)를 공유합니다.
**경로는 `core/schema.js`에 선언된 것만** 쓸 수 있습니다 (03-data-and-rules §2). 선언 안 된 경로 → `unknown-path` 오류.

```ts
ctx.db.backend: 'firebase' | 'demo' | 'archive'

ctx.db.doc(path: string): DocRef            // 'app/live' · 'polls/p1' · 'votes/p1_gAbc'
  .get(): Promise<Data | null>              // Data = { id, ...fields }, Timestamp 는 ms 숫자로
  .watch(fn: (data: Data | null) => void): () => void
      // 바로 1번(캐시) + 바뀔 때마다. 끊기면 자동 재연결(백오프) + 'wgb-sync' 이벤트. 자동 해제
  .create(data): Promise<void>              // 이미 있으면 'already-exists' (파이어베이스: 트랜잭션 = 읽기 1회 추가)
  .set(data, { merge?: boolean }): Promise<void>
  .update(patch): Promise<void>             // 없으면 'not-found'
  .delete(): Promise<void>

ctx.db.col(name: string): Query
  .where(field, op: '==' | 'in' | '>' | '>=' | '<' | '<=', value): Query   // 체이닝, 원본 불변
  .orderBy(field, dir?: 'asc' | 'desc'): Query
  .limit(n): Query
  .get(): Promise<Data[]>
  .watch(fn: (docs: Data[], changes: { type: 'added' | 'modified' | 'removed', id, data }[]) => void): () => void
  .add(data): Promise<string>               // 자동 id

ctx.db.ts()          // 서버 시각 (데모: Date.now())   — createdAt / updatedAt 은 항상 이것
ctx.db.inc(n)        // 증가
ctx.db.batch(): { set(path, data, opts?), update(path, patch), delete(path), commit(): Promise<void> }
```

오류 코드 (`e.code`): `permission-denied` · `already-exists` · `not-found` · `unknown-path` · `invalid-argument`(스키마 위반) ·
`unavailable`(오프라인) · `archived`(아카이브 모드에서 쓰기).

병합 의미 (Firestore와 동일하게 데모도 구현)
- `set(data, { merge: true })`: 맵은 **깊게 병합** (기존 하위 키 유지). 키를 지우려면 `update`로 그 필드 전체를 교체.
- `update(patch)`: 최상위 키 또는 한 단계 점 경로(`'cfg.poll'`)의 값을 **통째로 교체**.

규칙
- 쓰기 전에 코어가 `schema.js`로 **모양 검사**를 합니다 (데모·파이어베이스 둘 다). 데모는 권한(관리자 여부·하객 존재)까지 검사해서
  실제 규칙과 같은 결과를 냅니다 = **데모에서 통과하면 실서버에서도 통과**가 목표.
- 하객 문서 목록(`guests`)은 **읽기만** 가능합니다 (`ctx.db.col('guests').get()`). 쓰기는 코어 store.addGuest 만.
- 리스너 수와 읽기 횟수 예산은 WP에 적힌 범위를 넘지 않습니다 (03 §5 할당량 표).
- 오프라인: Firestore는 쓰기를 기억했다가 다시 보냅니다. UI는 "보내는 중"을 보여주고 막지 않습니다.

**구현 메모 (WP-00b ②에서 확정 — 계약을 넓힌 것뿐, 위의 호출은 그대로 동작)**
- `doc.watch(fn, onError?)` · `col.watch(fn, onError?)`: 두 번째 인자 `onError(e)`는 선택. 없으면 `console.error`. 영구 오류(`permission-denied`, 색인 필요)는 다시 붙지 않고 `onError`로만 알립니다.
  `watch`는 경로·인자를 **동기적으로** 검사해 `unknown-path` / `invalid-argument`를 바로 throw 합니다. 그 밖의 모든 호출은 **reject** 로 오류를 돌려줍니다 (`doc()` · `col()`은 참조만 만들 뿐 throw 하지 않음).
- 문서 안의 시각은 읽을 때 **ms 숫자**, 쓸 때는 **반드시 `ts()`** (숫자·Date 를 시각 필드에 쓰면 `invalid-argument`). `ts()` · `inc()`는 배열 안에 넣을 수 없습니다.
  읽은 문서를 통째로 `set`으로 되돌려 쓰지 마세요 (읽은 시각 필드가 숫자로 저장됨) — 바뀐 필드만 `update`.
- 저장할 수 있는 값: 문자열 · 유한한 숫자 · 불리언 · null · 배열 · 일반 맵(깊이 ≤ 20). `undefined` · NaN/Infinity · Date · 함수 · Map/Set · 클래스 인스턴스 · `$sv`/`$ts`/`__x__`/빈 이름의 키는 `invalid-argument`.
- 쿼리는 **복합 색인이 필요 없는 것만**: 필드 하나의 범위·정렬, 또는 `==`·`in` 필터들(서로 다른 필드여도 됨). 그 밖의 조합(`==` + 다른 필드 `orderBy`, 범위 + 다른 필드, `orderBy` 둘 이상)은
  실서버에서 `failed-precondition`이 되므로 데모·실서버 모두 `invalid-argument`로 미리 거절합니다 (`col.get()`은 reject, `col.watch()`는 throw). 범위 필터에 `orderBy`가 없으면 그 필드 오름차순 (Firestore와 같음), 동점은 문서 id.
- `update(patch)`의 점 경로는 여러 단계도 됩니다 (`'cfg.poll.x'`) — 없는 중간 맵은 만들어집니다. 없는 문서에 `delete`는 오류가 아닙니다.
- `batch`: 같은 문서를 두 번 쓰거나 500개를 넘으면 `invalid-argument`. **전부 또는 전혀** — 한 항목이 규칙 위반이면 아무것도 쓰지 않습니다. 규칙의 `get()`처럼 **배치 이전의 상태**를 봅니다
  (같은 배치에서 만든 poll 은 그 배치의 vote 에게 보이지 않음). 구독자는 배치당 한 번만 불립니다.
- 오류 종류: 모양(키 · 타입 · 길이 · `ts()` 필드) 위반 = `invalid-argument`, 권한 · 존재 · 시간 위반 = `permission-denied`. 규칙에 적힌 순서대로 **먼저 걸리는 조건**이 정합니다.
  실서버에서는 브라우저가 모양만 미리 검사하고(관계 검사 `relational: false`) 나머지는 서버 규칙이 판정합니다.
- 확장 지점: `registerBackend(kind, factory)`로 백엔드를 등록 (WP-14 `archive`). `docdb()` = 바로 쓸 수 있는 문(내부에서 스토어를 기다림) · `getDB()` = 백엔드가 준비된 뒤 resolve. 같은 객체입니다.
- `deleteMany`(store.js): 하객을 지우면 그 하객의 v4 문서(`checkins` `bingo` `translations` `anniv` · 모든 투표 `votes/<poll>_<gid>` · `gid`가 같은 `thanks` 카드)도 같이 지웁니다.
  v3.2 부분이 먼저(그대로), v4 부분은 **별도 배치·실패해도 무시** — v4 규칙을 게시하기 전에도 하객 삭제는 안전합니다.

---

## 10. 설정 · 라이브 · 페이즈

```ts
type Settings = {
  features: { [id: string]: boolean },   // 관리자 켜기/끄기 (없으면 매니페스트 기본)
  safe: boolean,                         // 본식 안전 모드 (liveSafe 아닌 기능 전부 끔)
  phase: 'auto' | 'pre' | 'live' | 'after' | 'anniversary',   // 비상용 강제 페이즈 (리허설은 ?phase= 사용)
  cfg: { [id: string]: object },         // 기능별 설정 (ctx.cfg())
  updatedAt: number | null,
}
type Live = {
  cue: string | null,      // 현재 식순 큐 id (WP-05)
  cueSeq: number,          // 큐를 누를 때마다 +1 (같은 큐 다시 누르기 구분 + seed)
  cueAt: number | null,    // ms
  quiet: boolean,          // 조용 모드
  poll: string | null,     // 지금 열린 투표 id (WP-10)
  msg: { ko: string, en: string } | null,   // 관리자가 띄운 한 줄 공지 (TV tc 존)
  updatedAt: number | null,
}
```
- 문서가 없으면 위 기본값 (`features: {}`, `safe: false`, `phase: 'auto'`, `cfg: {}`, `cue: null`, `cueSeq: 0`, `quiet: false`, `poll: null`, `msg: null`).
- 모든 페이지가 이 두 문서를 각각 1개 리스너로 구독합니다 (기기당 2 리스너).
- 아카이브 모드(WP-14)에서는 `app/settings` = `archive/data.json`의 `settings` 스냅샷(`features`·`cfg`, 내보낼 때 저장) + 기본값,
  `app/live` = 기본값. 그래서 아카이브 후에도 결혼식 때의 기능 켜짐·기능 설정(스토리 간격, 커플 폐백 등)이 그대로 유지됩니다.
- 페이즈 결정: `?phase=`(탭 기억 `wgb_phase`, `?phase=auto`로 해제) > `settings.phase`(auto 아니면) > 시계 자동.
  시계 자동은 `CONFIG.schedule` (03 §1) 기준 순수 함수 `phaseAt(nowMs, schedule)`.
- `<html data-phase="…">`를 코어가 설정합니다. CSS는 이걸로 페이즈별 숨김을 처리합니다.

**구현 메모 (WP-00b ②)**: 두 문서를 읽을 수 없을 때(규칙이 아직 게시되지 않았거나 할당량 초과 → `permission-denied`) 기본값으로 계속 진행하고 `settingsArrived()`도 풀립니다 (`console.warn` 한 줄 — 앱은 v3.2처럼 동작).
그 밖의 지연은 2초 뒤 기본값으로 진행하지만 `settingsArrived()`는 **실제 값**이 올 때까지 기다립니다. `normalizeSettings` · `normalizeLive` 결과(와 `getSettings()` · `getLive()`)는 깊게 얼려 있습니다 — 바꾸려면 `setFeature` 등을 쓰세요.
`setFeature`는 features 40개까지 (규칙의 한도), 관리자가 아니면 `permission-denied`, 잘못된 id(`[A-Za-z0-9_]{1,32}` 밖)·페이즈·patch 는 `invalid-argument` 로 reject 합니다.

---

## 11. 코어 도우미 — `core/ui.js` (기능끼리 공유하는 것은 전부 여기)

```ts
guestCode(gid: string): string          // 4글자 하객 코드 (23456789ABCDEFGHJKMNPQRSTUVWXYZ). 입장권·카드·빙고가 공유. 인쇄물에 찍히므로 알고리즘 고정(골든 테스트)
detectLang(text: string): 'ko' | 'en'   // 한글이 있으면 ko
seeded(seed): () => number              // 결정적 난수 (village 와 같은 알고리즘, 0 이상 1 미만)
spriteCanvas(avatar | frames, frame = 'idle', scale = 1): HTMLCanvasElement
      // avatar 객체 또는 getSprite()가 돌려준 프레임 묶음(= couple:sprites 의 groom/bride). scale 은 정수로 반올림, 보간 없음(pixelated)
qrCanvas(url: string, { ecc = 'M', scale = 1, pad = 2 }): HTMLCanvasElement   // vendor/qrcode.mjs. 한 칸 = scale px, 둘레 흰 여백 pad 칸
fmtDate(ms, lang, style: 'date' | 'time' | 'datetime'): string
      // **식장 현지 시각**(CONFIG.schedule.utcOffset) 기준 — 기기 시간대와 무관. ko '2027년 4월 10일 오후 2:05' / en 'Apr 10, 2027, 2:05 PM'. 숫자가 아니면 ''
ensureFonts(): Promise<void>            // Galmuri 글꼴 로드 대기 (캔버스 글자 전에). 실패·3초 지연이어도 resolve
canvasText(g, text, x, y, { size = 16, bold, color, align, maxWidth, minSize = 8 }): number
      // 픽셀 글꼴 한 줄, y = 글자 윗선(top). maxWidth 가 있으면 글자를 1px씩 줄여 맞춤(minSize까지, 그래도 넘치면 가로로 압축). 실제로 쓴 크기를 돌려줌. 캔버스 상태는 복원
downloadDataURL(name, dataURL): boolean   // safeData 를 통과한 base64 이미지·오디오만 저장, 아니면 아무 일도 없이 false
downloadBlob(name, blob): boolean         // Blob 저장 (60초 뒤 주소 해제). 파일 이름의 / \ : * ? " < > | 는 _ 로
shareImage({ dataURL, filename, title, text }): Promise<'shared' | 'downloaded' | 'cancelled'>
      // 파일 공유가 되면 공유 시트, 아니면(또는 거부되면) 다운로드. 사용자가 시트를 닫으면 'cancelled'(오류 아님). 이미지가 아니면 reject(code 'invalid-argument').
      // 사용자가 누른 직후(클릭 핸들러)에서 호출 — 앞에 await 를 끼우지 말 것
compressImage(file, maxSide, q?): Promise<{ data, thumb }>                    // snaps.js 와 같은 함수 (≤ 850KB JPEG, 디코딩 실패는 code 'decode')
icsEvent({ title, start, end, location, description }): string
      // 캘린더 파일 텍스트(RFC 5545, CRLF, 75바이트 접기). start/end = ms · Date · ISO 문자열, end 가 없으면 start + 2시간. start 가 없으면 throw('invalid-argument'). 저장은 downloadBlob('wedding.ics', new Blob([text], { type: 'text/calendar' }))
// ---- (2026-10, WP-20 신규) 유튜브 — 외부 주소(www.youtube-nocookie.com)는 이 세 함수 안에만 있음 (03 §6). 기능 코드는 주소를 쓰지 않음
youtubeSource(input: string): { video: string } | { channel: string } | null
      // 관리자가 붙여 넣은 것 판독: 11자 영상 id · youtu.be/<id> · watch?v= · /live/ · /shorts/ · /embed/ · 채널 id(UC…24자) · /channel/<UC…>(/live). @핸들·다른 사이트 = null
youtubeFrame(src, { mute = true, autoplay = true, controls = true, title }): HTMLIFrameElement
      // youtube-nocookie embed(채널은 embed/live_stream?channel=) · playsinline · enablejsapi · 전체화면 허용. src 가 youtubeSource 결과가 아니면 throw('invalid-argument')
      // 돌려준 iframe 은 기능의 [data-f] 상자 안에 붙일 것 (꺼지면 상자와 함께 사라짐)
youtubeCommand(frame, func: 'mute' | 'unMute' | 'playVideo' | 'pauseVideo' | 'setVolume', args?): boolean
      // 플레이어에 postMessage 명령(유튜브 iframe API 형식). youtubeFrame 이 만든 iframe 이 아니거나 모르는 명령이면 false
```

---

## 12. 금지 목록 (정적 테스트 `core-features-static`가 검사)

1. 기능 폴더 밖 파일 수정 (WP에 "코어 접점"으로 적힌 것 제외) · `tests/suites/` 수정
2. `innerHTML`/`outerHTML`/`insertAdjacentHTML`에 변수·템플릿 문자열 사용 (고정 문자열만 허용) — 하객 이름·메시지는 항상 `textContent`
3. `eval`, `new Function`, `document.write`, 문자열 `setTimeout`
4. 외부 주소(`http://`, `https://`) — CDN, API, 폰트, 이미지 전부 (03 §6 예외 없음)
5. 새 npm 의존성, `public/js/vendor/`에 새 파일
6. `import('…' + 변수)` 같은 동적 경로 import, 다른 기능 폴더 import, **§1.1 표 밖의 코어 모듈 import**
7. 접두사 없는 CSS 선택자(허용 시작: `.f-<id>-` · `[data-f="<id>"]` · `html.f-<id>-`) / DOM id / localStorage 키 / i18n 키 ·
   `document.documentElement.classList`·`document.body.classList` 직접 조작 (→ `ctx.rootClass`)
8. `localStorage.clear()`, `sessionStorage.clear()`, IndexedDB 삭제
9. `console.log` (→ `ctx.log`)
10. 하객 개인 데이터(사진·음성·타임캡슐 원문)를 공개 컬렉션·로그·다운로드 파일명에 노출

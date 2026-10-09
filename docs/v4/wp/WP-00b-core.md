# WP-00b · 코어 기반 — 모듈 · 매니페스트 · 스키마 · 규칙 v4

| 항목 | 값 |
|---|---|
| 브랜치 | `wp/00b-core` |
| 선행 | WP-00a (완료) |
| 다음 | WP-00c (페이지 연결) — 00b는 **페이지 동작을 바꾸지 않습니다** |
| 규모 | 큼 (모듈 7개 + 테스트 3종). 세션 3개로 나눔 (의존 순서): ① bus·phase·ui·i18n 확장·config ② schema·docdb·**settings**(docdb를 씀)·규칙·store ③ features 로더·매니페스트·_selftest·테스트 마무리 |
| 허락된 코어 접점 | `public/js/store.js` (backend 노출, deleteMany 확장) · `public/js/config.js` (schedule, archive) · `public/js/i18n.js` (확장 API) · `firestore.rules` (전체 교체) · `tests/suites/core-static.mjs` (캡슐 날짜 검사를 capsules 블록에 고정하는 수정만) |

## 1. 목적
모든 기능이 의존하는 **공용 모듈**과 **데이터 계약**을 만든다. 페이지(guest/village/admin)에는 아직 연결하지 않는다.
끝나면: 02-contracts의 ctx 공통 API·버스·docdb·설정·페이즈가 동작하고, 테스트용 가짜 페이지 API로 기능 로더를 검증할 수 있다.

## 2. 범위 밖
- 페이지에서 `bootFeatures` 호출, 슬롯·HUD 존·관리자 설정 탭 → WP-00c
- 개별 기능 코드 → WP-01~18
- 아카이브 백엔드 구현 → WP-14 (00b는 등록 훅만)

## 3. 만들 파일

```
public/js/core/bus.js  phase.js  settings.js  schema.js  docdb.js  features.js  ui.js
public/js/features/index.js                 (매니페스트 — §5 그대로)
public/js/features/_selftest/index.js  i18n.js  style.css   (00b: 공통 ctx API만 사용하는 최소판)
firebase.json                                (에뮬레이터 설정)
tests/lib/v4.mjs  units.mjs                 (units.mjs = "빈 페이지 + 진짜 모듈" 단위 시험 도구 — core-units · core-units-loader 가 공용)
tests/suites/core-features-static.mjs  core-units.mjs  core-units-loader.mjs
tests/rules/run.mjs                          (에뮬레이터 REST 테스트, Patrick 컴퓨터에서 실행)
package.json                                 ("test:rules" 스크립트 추가)
```

## 4. 모듈 명세

### 4.1 `core/bus.js`
```js
export function on(type, fn, { replay = false, owner = null } = {}) // → off()
export function emit(type, payload)
export function last(type)                                         // 스티키 값 (없으면 undefined)
export function offOwner(owner)                                    // 기능 dispose 때 그 기능 구독 전부 해제
export function setErrorReporter(fn)                               // fn(owner, error) — features.js 가 등록
```
- 스티키 이벤트 목록 = 02 §5 표의 ✓ (상수 `STICKY`). 스티키는 emit 때 값 저장, `replay:true`면 on 즉시 1번 호출(마이크로태스크 아님, 동기).
- 핸들러마다 try/catch. 오류 → owner가 있으면 reporter, 없으면 `console.error('[bus]', type, e)`. 다른 핸들러는 계속.
- emit 중 on/off 해도 안전 (구독 목록 복사 후 순회).

### 4.2 `core/phase.js`
```js
export const PHASES = ['pre', 'live', 'after', 'anniversary'];
export function phaseAt(nowMs, schedule)                // 03 §1 알고리즘 그대로, 순수 함수
export function liveWindow(schedule)                    // { start, end } ms
export function urlPhase()                              // ?phase= (sessionStorage 'wgb_phase' 기억, 'auto' = 삭제), 잘못된 값 무시
export function resolvePhase({ now, settings, url })    // { phase, source: 'url' | 'admin' | 'auto' }
export function startPhase()                            // 1회만: 계산 → <html data-phase> → emit('phase') ; 30초마다 + 'settings' 마다 재계산, 바뀔 때만 emit
export function currentPhase()                          // 마지막 값
```

### 4.3 `core/settings.js`
```js
export const DEFAULT_SETTINGS = { features: {}, safe: false, phase: 'auto', cfg: {}, updatedAt: null };
export const DEFAULT_LIVE = { cue: null, cueSeq: 0, cueAt: null, quiet: false, poll: null, msg: null, updatedAt: null };
export function normalizeSettings(raw) / normalizeLive(raw)    // 모르는 키 버림, 타입 틀리면 기본값
export function startSettings()            // 1회만. docdb watch 2개 → emit('settings'/'live'). 첫 값(또는 2초 타임아웃=기본값) 후 resolve
export function settingsArrived()          // Promise: app/settings 의 **실제** 첫 값(캐시 또는 서버)이 온 순간 resolve. 타임아웃 기본값으로는 resolve 안 함 (gate용)
export function getSettings() / getLive()
// 관리자 도우미 (관리자가 아니면 permission-denied 그대로 throw)
export async function setFeature(id, on)   // on: true | false | null(기본값으로) — features 맵 전체를 update 로 교체
export async function setSafe(on)
export async function setPhaseOverride(p)  // 'auto' | PHASES
export async function saveCfg(id, patch)   // cfg.<id> = { ...현재, ...patch } (update 'cfg.<id>')
export async function setLive(patch)       // set merge + updatedAt: ts(). 큐 변경 시 호출자가 { cue, cueSeq: inc(1), cueAt: ts() }
```
문서가 없을 때 첫 저장은 `set`(전체 기본값 + 변경)으로 만들고, 이후는 `update`. `updatedAt`은 항상 `ts()`.

### 4.4 `core/schema.js` — 규칙의 JS 거울
```js
export const SCHEMA = [ { pattern: 'checkins/{gid}', read, create, update, delete }, … ]   // 03 §2의 모든 경로 (v3.2 포함)
export function matchPath(path)            // → { def, params } | null   ('votes/p1_gA' → params { vid: 'p1_gA' })
export async function check(op, path, next, prev, env)
      // op: 'create' | 'update' | 'delete' | 'get' | 'list'
      // env: { admin: boolean, now: number, guestExists(id): Promise<boolean>, get(path): Promise<data|null>, serverTime: (v) => boolean }
      // → null (허용) | { code: 'permission-denied' | 'invalid-argument', reason: string }
```
- 규칙(03 §4)의 각 조건을 **같은 순서·같은 의미**로 옮깁니다. 주석으로 대응하는 규칙 줄을 적으세요.
- 모양 위반(키·타입·길이) = `invalid-argument`, 권한·존재·시간 위반 = `permission-denied`.
- 서버 시각 필드: 사전 검사에서는 `env.serverTime(v)` (ts() 표식인지), 데모 저장 직전에는 now로 치환.
- v3.2 컬렉션(guests, photos, …)은 docdb에서 **쓰기 금지**(store.js 전용), guests만 읽기 허용으로 선언.

### 4.5 `core/docdb.js`
02 §9 API 그대로. 내부 구조:
```js
export async function getDB()              // → DocDB (store.backend.kind 에 맞는 백엔드, 1회 생성 후 캐시)
export function registerBackend(kind, factory)   // WP-14 archive 용
```
- **firebase 백엔드**: `store.backend.{fs, db, watch}` 사용. `doc.watch` = `watch('docdb:'+path, ref, snap => …)` (v3.2의 재연결 래퍼 재사용).
  `create` = `fs.runTransaction` (get → 있으면 already-exists). Timestamp→ms 재귀 변환. `ts()` = `fs.serverTimestamp()`, `inc(n)` = `fs.increment(n)`.
  쓰기 전 `schema.check`(모양만, env.admin = 로그인 사용자가 관리자 이메일인지, 관계 검사는 생략 → 규칙에 맡김).
- **demo 백엔드**: IndexedDB `wgb-demo`/`kv`, 키 `doc:<path>`. 한 쓰기 = 한 IDB 트랜잭션(읽기→검사→쓰기). 트랜잭션 완료 후
  BroadcastChannel `wgb-docdb`로 `{ path }` 전송 + 같은 탭 구독자 직접 호출. `watch`는 즉시 현재 값 1번 → 메시지 올 때 다시 읽어 바뀌었으면 호출.
  컬렉션 watch는 `IDBKeyRange.bound('doc:'+col+'/', 'doc:'+col+'/￿')` 스캔 → where/orderBy/limit 적용 → 이전 결과와 비교해 changes 계산.
  `env.admin` = `document.body.classList.contains('admin')`, `guestExists` = 데모 `wgb_demo_guests` 목록, `get` = IDB 읽기. 시간 제한(빙고 1초, 투표 2초)도 검사.
- 공통: 경로가 schema에 없으면 `unknown-path`. 문서 id 규칙: 경로 세그먼트에 `/` 금지, 길이 ≤ 100.
- 오류 객체: `Object.assign(new Error(msg), { code })`.

### 4.6 `core/features.js` — 로더 · 판정 · 핫 토글 · 서킷 브레이커
```js
export function parseFF(search, storage)              // → { all: boolean, none: boolean, on: Set, off: Set }  (02 §2.2 문법, sessionStorage 'wgb_ff')
export function resolveEnabled(entry, env)            // 02 §2.2 순수 함수 → { on, source }  (12단계 그대로, 순서 바꾸지 말 것)
export async function bootFeatures(page, pageApi, { readyTimeoutMs = 3000 } = {})
      // pageApi = { forFeature(scope) → { guest } | { v } | { admin },  refreshTexts() }   (00c가 구현. 00b 테스트는 가짜 구현)
      // scope = { id, entry, add(cleanupFn), guard(fn), el(tag, opts), report(err), claim(slot) }
      //   claim(slot): '한 기능 전용' 자리(02 §7.8)를 차지. 다른 기능이 쥐고 있으면 owner-conflict throw + feature:error,
      //   같은 기능이면 그대로, dispose 때 자동 반납. slot 이름: 'presence' 'tickerExtra' 'tickerPrefix' 'coupleSprites'
      // 반환: Promise — 처음 켜진 기능들의 setup 이 끝나거나 readyTimeoutMs 가 지나면 resolve (하객·관리자 페이지가 기다림)
export function whenGateReady(timeoutMs = 8000)       // 02 §2.2 gate: settingsArrived() 후 그 판정에서 켜진 gate 기능의 setup 완료(성공·실패 무관)까지.
                                                      // timeoutMs 가 지나면 그냥 resolve (reject 없음). 마을이 첫 sync 전에 await
export function featureStates()                       // [{ id, name, status, on, source, tripped, errors, lastError }]
export function trip(id, reason)
```
동작
1. `startPhase()`, `startSettings()` (이미 시작됐으면 재사용) → 'settings'/'phase' 구독 → 판정 → 차이만 적용.
2. 켜기: `entry.load()` → 모듈 검사(`setup` 함수, `i18n` 객체) → `i18n.addStrings(id, mod.i18n)` → `mod.css`면 `<link rel=stylesheet data-f=id href="js/features/<id>/style.css">` (onload/onerror까지 대기, 최대 2초)
   → ctx 생성 → `await withTimeout(mod.setup(ctx), 3000)` → 성공 시 `emit('feature:state', { id, on: true, source })`.
3. 끄기(dispose): 등록 역순으로 정리 함수 실행(각각 try/catch) → `bus.offOwner(id)` → `[data-f="<id>"]` 제거 → `<link data-f>` 제거 →
   `i18n.removeStrings(id)` → 문구 덮어쓰기 해제 → `emit('feature:state', { id, on: false })`. dispose 후 그 ctx의 함수 호출은 무시(no-op).
4. 서킷 브레이커: guard된 콜백 오류를 기능별로 기록, **60초 안에 5회** → `trip(id)` = dispose + 세션 동안 꺼짐 + `feature:error { tripped: true }`.
5. `fcrash` (데모 전용 시험 장치): `?fcrash=<id>` 이면 그 기능의 guard된 콜백이 처음 5번 일부러 throw → 브레이커 검증용.
   `?st=…gate…` (데모 전용): `_selftest`를 gate 기능으로 취급 (WP-00c A13 — gate 대기 검증용). 둘 다 실서버에서는 무시.
6. 동시성: 같은 기능의 켜기/끄기가 겹치면 직렬화(기능별 Promise 체인). 판정이 빠르게 여러 번 바뀌어도 최종 상태만 남게.
7. `_`로 시작하는 id(= `_selftest`)는 데모일 때만 로드하고, `?ff=all`에 포함되지 않음 (`?ff=_selftest`로만).
8. off hook (02 §3 규칙 6): 부팅 판정에서 OFF인 기능 중 `localStorage['wgb_f_<id>__offhook']`가 있으면 `import('./<id>/off.js')` → `off()` (3초 제한, 오류 무시) → 표식 삭제.
   `ctx.markOffHook()`은 표식을 씀. 핫 토글로 꺼질 때도 dispose 뒤 같은 `off()` 호출.
9. gate (02 §2.2): 매니페스트 `gate: true` 기능. `whenGateReady`는 `settingsArrived()`(최대 timeoutMs) → 그 시점 판정에서 ON인 gate 기능들의
   setup Promise(이미 진행 중이면 그것)를 기다림. settings가 끝내 안 오면 timeoutMs 뒤 resolve — 그때는 매니페스트 기본값 판정
   (그래서 prereg를 결혼식 전 `ready`로 권장, 02 §2.1).

ctx 공통 구현은 02 §4 그대로:
- `ctx.el`은 `data-f` 부여.
- `ctx.texts(dict)` = `i18n.overrideStrings(id, dict)` → `pageApi.refreshTexts()` (dispose 때 `overrideStrings(id, null)` → 다시 `refreshTexts()`).
  **`emit('lang')`을 쓰지 않습니다** — lang 핸들러 안에서 ctx.texts를 부르는 기능이 무한 반복에 빠지지 않게.
- `ctx.rootClass(name)` = 이름 검사(`^[a-z0-9-]{1,20}$`, 아니면 `bad-name`) → `document.documentElement.classList.add('f-'+id+'-'+name)` → 정리 등록.
- 한 기능 전용 API는 페이지 API(00c)가 `scope.claim(slot)`을 거쳐 구현.

### 4.7 `core/ui.js`
02 §11의 함수 전부. 세부:
- `guestCode(gid)`: FNV-1a 32bit(gid) → 4자리, 문자 집합 `23456789ABCDEFGHJKMNPQRSTUVWXYZ`(31자) — `n % 31`을 4번.
- `shareImage`: `navigator.canShare?.({ files: [file] })`면 `navigator.share`, 사용자가 취소하면 `'cancelled'` 반환(오류 아님), 불가하면 다운로드.
- `icsEvent`: RFC 5545 최소 (VCALENDAR/VEVENT, UID, DTSTAMP, DTSTART/DTEND UTC, SUMMARY, LOCATION, DESCRIPTION, CRLF, 75바이트 줄 접기).

### 4.8 `i18n.js` 확장 (기존 동작 그대로 + 추가)
```js
export function addStrings(id, D) ; export function removeStrings(id) ; export function overrideStrings(id, D)   // D = null → 이 기능의 덮어쓰기 해제
export const t = (k, vars) => …   // 덮어쓰기(마지막 등록 우선) → D[lang] → 기능 문구[lang] → D.ko → 기능 문구.ko → k ; vars 치환 '{n}'
```
`applyI18n()`은 그대로. 기존 호출부(`t(key)`)는 영향 없음.

### 4.9 `store.js` 변경 (추가만)
1. 두 어댑터 반환 객체에 `backend` (03 §3).
2. `deleteMany(ids)` 확장 (03 §2.1): v4 문서 삭제 추가. 파이어베이스는 시작 시 `polls` 목록 1회, `thanks`를 `where('gid','in', 10개씩)`로 조회 후 배치 삭제.
   데모는 docdb 데모 키를 같은 규칙으로 삭제. **기존 v3.2 삭제 동작·순서는 그대로** (core-regressions의 "삭제 시 스냅 삭제"가 계속 통과해야 함).

### 4.10 `config.js` 변경
03 §1의 `schedule`, `archive: null` 추가 (기존 키 순서 뒤, 주석 한국어).

### 4.11 `firestore.rules`
03 §4의 코드 블록으로 **전체 교체** (한 글자도 바꾸지 말 것). 바꿔야 할 것 같으면 QUESTIONS.md.

### 4.12 `firebase.json`
```json
{ "firestore": { "rules": "firestore.rules" }, "emulators": { "firestore": { "port": 8080 }, "ui": { "enabled": false } } }
```

## 5. 매니페스트 — `public/js/features/index.js` (이대로)

```js
// v4 기능 매니페스트. 각 WP는 "자기 줄의 status" 만 바꿉니다 (planned → beta). ready 는 Patrick 이 리허설 후 지정.
// 필드 설명: docs/v4/02-contracts.md §2
const F = (id, wp, ko, en, pages, phases, opt = {}) => ({
  id, wp, name: { ko, en }, pages, phases,
  simple: opt.simple ?? true, liveSafe: opt.liveSafe ?? false, gate: opt.gate ?? false,
  status: opt.status ?? 'planned', default: opt.default ?? true,
  load: () => import(`./${id}/index.js`),
});
const ALL = ['pre', 'live', 'after', 'anniversary'];

export const FEATURES = [
  F('prereg',      'WP-01', '사전 입주 · 체크인 · 입장권', 'Move-in & check-in', ['guest', 'kiosk', 'village', 'admin'], ['pre', 'live'], { liveSafe: true, gate: true }),
  F('couple',      'WP-02', '커플 캐릭터',               'Couple characters', ['guest', 'kiosk', 'village', 'admin'], ALL, { liveSafe: true }),
  F('dday',        'WP-03', 'D-day 마을',                'D-day village',     ['guest', 'village'], ['pre']),
  F('story',       'WP-04', '커플 스토리 표지판',         'Our story signs',   ['village', 'admin'], ALL, { liveSafe: true }),
  F('live',        'WP-05', '식순 라이브 모드',           'Live program',      ['village', 'admin'], ['live']),
  F('translate',   'WP-06', '덕담 번역',                 'Message translation', ['village', 'admin'], ['live', 'after', 'anniversary']),
  F('bgm',         'WP-07', '8비트 BGM · 효과음',         '8-bit music',       ['village', 'admin'], ALL, { default: false }),
  F('meter',       'WP-08', '마음 온도계',               'Love-o-meter',      ['village', 'admin'], ['live']),
  F('bingo',       'WP-09', '양가 섞이기 빙고',           'Mix & Mingle Bingo', ['guest', 'village', 'admin'], ['live'], { simple: false }),
  F('poll',        'WP-10', '실시간 투표',               'Live polls',        ['guest', 'village', 'admin'], ['live']),
  F('card',        'WP-11', '내 픽셀 카드',              'My pixel card',     ['guest', 'village'], ALL),
  F('fourcut',     'WP-12', '픽셀 네컷',                 'Pixel photo strip', ['guest'], ['live', 'after'], { simple: false }),
  F('offline',     'WP-13', '오프라인 대비',              'Offline support',   ['guest', 'kiosk', 'village', 'admin'], ALL, { liveSafe: true }),
  F('archive',     'WP-14', '추억 마을 아카이브',         'Memory Village archive', ['guest', 'village', 'admin'], ['after', 'anniversary'], { liveSafe: true }),
  F('thanks',      'WP-15', '하객별 감사 카드',           'Thank-you cards',   ['guest', 'admin'], ['after', 'anniversary']),
  F('photobook',   'WP-16', '포토북 PDF',               'Photobook PDF',     ['admin'], ['after', 'anniversary']),
  F('postcard',    'WP-17', '신혼여행 엽서',              'Honeymoon postcards', ['guest', 'village', 'admin'], ['after', 'anniversary']),
  F('anniversary', 'WP-18', '1주년 재개장',              '1st anniversary',   ['guest', 'village', 'admin'], ['anniversary']),
  // 코어 점검용 (데모 전용, 영원히 planned)
  F('_selftest',   'WP-00c', '코어 자체 점검',            'Core self-test',    ['guest', 'kiosk', 'village', 'admin'], ALL, { liveSafe: true, default: false }),
];
```
⚠️ 동적 import 경로가 템플릿 문자열이지만 **id는 이 파일의 상수**이므로 허용 (정적 검사에서 이 파일만 예외).

## 6. 테스트

### 6.1 `tests/lib/v4.mjs`
04-testing §4의 도우미 전부. `adminPage`는 같은 컨텍스트에 `admin.html?demo=1`을 열고 로그인(데모 자동) 대기.
00b 시점에는 페이지가 기능을 부팅하지 않으므로 `bootStub(h, page, pageName)` 도우미를 추가: 페이지 안에서 `bootFeatures(page, 가짜 API)` 호출.

### 6.2 `core-features-static.mjs` — 04 §3.1 전부 (+ 매니페스트 §5 형식, `_selftest` 예외 처리)

### 6.3 `core-units.mjs` + `core-units-loader.mjs` — 04 §3.2 전부, 그리고 (구현에서 로더 부분은 `core-units-loader.mjs` 로 나눔 — 공용 도구 `tests/lib/units.mjs`)
- 로더(가짜 페이지 API + `_selftest` 최소판): `?ff=_selftest` → setup 호출·`data-f` 노드 생성 → `setFlag(false)` 대신 `?ff=-_selftest` 재부팅 → 노드 0 ·
  `startSettings` 후 관리자 페이지에서 플래그 변경 → 다른 페이지 핫 토글 · `fcrash` → 5회 후 tripped · setup 3초 초과 → 꺼짐
- `resolveEnabled` 표: 12단계 각각 + 특히 ① 관리자 페이지는 페이즈 밖이어도 ON 가능 ② 실서버(`demo:false`)에서 safe·관리자 OFF가 `?ff=+id`를 이김
  ③ 데모에서는 `?ff=+id`가 safe를 이김 ④ `?ff=all`이 `_selftest`를 켜지 않음 ⑤ `?ff=-id`는 언제나 OFF
- `whenGateReady`: 가짜 gate 기능(setup 1초) → 1초 뒤 resolve · settings가 안 오면 timeoutMs 뒤 resolve · gate 기능이 OFF면 settings 도착 즉시
- `scope.claim`: 기능 A가 'presence' 차지 → B가 같은 slot → `owner-conflict` + `feature:error{id:B}` · A dispose 후 B 가능
- `ctx.texts` → `refreshTexts` 1번 호출, `lang` 이벤트 0번 · dispose → 원문 복귀 + `refreshTexts` 1번 · `ctx.rootClass` → `<html>` 클래스, dispose → 제거
- `deleteMany`(데모): 하객 + checkins/bingo/translations/anniv/votes/thanks까지 삭제

### 6.4 `tests/rules/run.mjs` — 04 §6. 03 §5 매트릭스 + 거부 사례 1–8. `npm run test:rules`.
- **시간에 묶인 규칙**은 에뮬레이터도 실제 시각(`request.time`)을 씁니다 → 그 날짜 전에는 **거부 쪽만** 검사:
  `anniv` 생성(2028-04-03 ~ 04-23 UTC만 허용)과 `capsules` 읽기(2028-04-10 이후 관리자만) — 지금 실행하면 "허용" 사례는 건너뜀(`SKIP: 날짜 전` 출력),
  날짜가 지나면 같은 코드가 자동으로 허용 사례까지 검사 (`if (Date.now() >= Date.UTC(2028, 3, 3))` 분기).

## 7. 수용 기준

| # | 기준 |
|---|---|
| A1 | 기존 12개 스위트 전부 초록 (`npm test`), golden-sprites 변화 0, perf 하락 < 20% |
| A2 | 페이지 4개의 화면·동작 변화 0 (00b는 페이지가 core/를 import 하지 않음 — `grep`으로 확인) |
| A3 | core-features-static 초록, core-units 초록, core-units-loader 초록 |
| A4 | `firestore.rules` = 03 §4와 바이트 단위 동일 (core-features-static이 문서와 비교) |
| A5 | schema 거울: 03 §5 거부 사례 1–8이 데모에서 전부 거부, 허용 사례는 전부 허용 |
| A6 | `phaseAt` 03 §1 경계값 8개 전부 일치 |
| A7 | 핫 토글 후 `[data-f]` 0, bus 구독 0, 타이머 0 (ctx 카운터로 확인) |
| A8 | 브레이커: 60초 5회 → tripped, 다른 기능·페이지 정상 |
| A9 | `tests/rules/run.mjs`가 문법 오류 없이 로드됨 (실행은 Patrick) |

## 8. 수동 QA
- (Patrick, 머지 후) `npm run test:rules` 1회 → 결과를 STATUS에 기록
- 규칙 게시 (03 §9) → v3.2 5분 점검 (README)

## 9. 롤백
페이지 연결 전이므로 브랜치를 되돌리면 끝. 규칙 v4는 v3.2 블록을 포함하므로 게시 후에도 v3.2 앱은 그대로 동작.

## 10. 보고서 (CLAUDE.md 양식) + STATUS·CHANGELOG 갱신

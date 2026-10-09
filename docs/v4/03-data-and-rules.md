# 03 · 데이터 · 보안 규칙 · 할당량

> 이 문서의 컬렉션·필드·규칙은 **WP-00b에서 한 번에 확정**됩니다. 기능 WP는 여기 없는 컬렉션·필드를 만들 수 없습니다.
> 바꿔야 하면 `QUESTIONS.md`에 적고 멈춥니다 (규칙 재게시는 Patrick 수동 작업이므로 최소화).

---

## 1. 설정 추가 — `public/js/config.js` (WP-00b, 기존 키는 그대로)

```js
  // ---- v4 일정 (페이즈 계산) --------------------------------
  schedule: {
    weddingDate: '2027-04-10',  // 식장 현지 날짜
    utcOffset: '-04:00',        // 올랜도 4월 = EDT
    liveStartHour: 6,           // 당일 06:00 ~ 다음날 06:00 = live
    liveHours: 24,
    anniversaryDays: 7,         // 매년 기념일 00:00부터 7일 = anniversary
  },
  // ---- v4 아카이브 (WP-14가 켬) ---------------------------------
  archive: null,                // 예: { url: 'archive/data.json' } → 읽기 전용 아카이브 모드
```

`phaseAt(nowMs, s)` (core/phase.js, 순수 함수) — 경계값은 단위 테스트로 고정:

```text
liveStart = Date.parse(`${s.weddingDate}T${pad2(s.liveStartHour)}:00:00${s.utcOffset}`)
liveEnd   = liveStart + s.liveHours * 3600e3
now <  liveStart                         → 'pre'
now <  liveEnd                           → 'live'
k ≥ 1 인 어떤 해 k 에 대해
  annStart = Date.parse(`${weddingDate의 연도+k}-${MM}-${DD}T00:00:00${s.utcOffset}`)
  annStart ≤ now < annStart + anniversaryDays*86400e3   → 'anniversary'
그 외                                    → 'after'
```
테스트 고정값: `2027-04-10T05:59:59-04:00 → pre` · `06:00:00 → live` · `2027-04-11T05:59:59 → live` · `06:00:00 → after` ·
`2028-04-09T23:59:59-04:00 → after` · `2028-04-10T00:00 → anniversary` · `2028-04-17T00:00 → after` · `2029-04-12 → anniversary`.

---

## 2. 컬렉션 전체 (v3.2 + v4)

공개 = 누구나 읽기(마을 화면이 로그인 없이 읽음). 비공개 = 관리자만.

| 경로 | 필드 (타입 · 제한) | 읽기 | 쓰기 | 만드는 곳 | 비고 |
|---|---|---|---|---|---|
| `guests/{gid}` | name(1–30) side message(≤300) **priv**(bool, v4) avatar activity hidden hasPhoto hasVoice hasCapsule createdAt | 공개 | 생성: 누구나 · 수정/삭제: 관리자 | v3.2 | `priv: true`면 message는 `''` (본문은 notes) · priv는 수정 불가 |
| `photos/{gid}` | data(JPEG dataURL <900KB) createdAt | **관리자** | guests와 같은 배치로만 생성 | v3.2 | |
| `voices/{gid}` | data(audio dataURL) mime createdAt | **관리자** | 같은 배치 | v3.2 | |
| `capsules/{gid}` | text(≤1000) name createdAt | **관리자, 2028-04-10 이후** | 같은 배치 | v3.2 | |
| `notes/{gid}` | message(1–300) createdAt | **관리자** | guests(`priv: true`)와 같은 배치로만 생성 · 수정 없음 | v4 코어 (2026-10) | "💌 신랑·신부에게만" 메시지. TV·방명록 모아보기(WP-19)에 안 나옴 |
| `snaps/{gid}_{k}` | gid name caption(≤60) data hidden createdAt | 공개 | 생성: 하객 존재·k 0–4 · 숨김: 관리자 | v3.2 | 네컷(WP-12)도 여기 1칸 사용 |
| `pulse/{gid}` | type n createdAt | 공개 | 하객 존재 · n+1 · 2초 간격 | v3.2 | |
| `events/{id}` | type(bouquet/group/fireworks) createdAt | 공개 | 관리자 | v3.2 | |
| `app/settings` | features{≤40} safe phase cfg{≤40} updatedAt | 공개 | 관리자 | WP-00b | 기능 플래그 |
| `app/live` | cue(≤24) cueSeq(int) cueAt quiet poll msg{ko,en ≤80} updatedAt | 공개 | 관리자 | WP-00b/05 | 식순·조용·열린 투표 |
| `checkins/{gid}` | via(phone/kiosk/entrance/admin) createdAt | 공개 | 생성만: 하객 존재 (via=admin은 관리자) · 삭제: 관리자 | WP-01 | |
| `translations/{gid}` | src(ko/en) ko(≤600) en(≤600) engine(≤20) updatedAt | 공개 | 관리자 | WP-06 | |
| `bingo/{gid}` | done[m0–m23 ≤16개] lines(0–10) updatedAt | 공개 | 하객 존재 · 칸은 늘어나기만 · 1초 간격 | WP-09 | |
| `polls/{pid}` | q{ko,en ≤120} kind(choice/guest) options[≤8] open order result createdAt updatedAt | 공개 | 관리자 | WP-10 | pid = `p[a-z0-9]{1,12}` |
| `votes/{pid}_{gid}` | pid gid choice(int 또는 하객 id) updatedAt | 공개 | 하객 존재 · 투표 열림 · 2초 간격 수정 | WP-10 | 1인 1표 |
| `thanks/{token}` | gid name note{ko,en ≤600} photo(JPEG/null) theme createdAt updatedAt | **토큰 아는 사람만 get** · 목록은 관리자 | 관리자 | WP-15 | token = `[A-Za-z0-9]{20,40}` |
| `postcards/{id}` | title{ko,en ≤60} msg{ko,en ≤300} place(≤40) theme thumb(JPEG, 480px ≈100KB) order createdAt updatedAt | 공개 | 관리자 | WP-17 | 목록은 썸네일만 내려받음 |
| `postcardImages/{id}` | data(JPEG ≤ 850KB) updatedAt | 공개 | 관리자 | WP-17 | 엽서를 열 때만 1장씩 |
| `anniv/{gid}` | text(≤300) createdAt | 공개 | 생성만: 하객 존재 · 2028-04-03 ~ 04-23 (UTC) | WP-18 | |

`core/schema.js`에 위 표의 **모든 경로**가 선언됩니다. 기능은 v4 경로만 docdb로 씁니다 (v3.2 컬렉션 쓰기는 store.js만).
`guests`는 docdb에서 **읽기 전용**으로 선언 (빙고 코드 확인 등).

### 2.1 하객 삭제 = 그 하객의 모든 것 삭제 (WP-00b가 store.js `deleteMany` 확장)

관리자가 하객을 지우면(개인정보 요청 포함) v3.2가 지우던 것 + v4 문서까지 한 번에:
`guests, photos, voices, capsules, pulse, snaps/{gid}_0..4` (v3.2) + `checkins/{gid}, bingo/{gid}, translations/{gid}, anniv/{gid}, notes/{gid}`
+ `votes/{pid}_{gid}` (모든 poll에 대해: polls 목록 1회 읽기) + `thanks` 중 gid가 같은 문서(관리자 목록 쿼리 1회).
배치 크기: 하객 1명당 문서 수 = 5 + 5 + 5 + (poll 수) + (감사 카드 수) → `floor(480 / perGuest)`명씩.
데모 백엔드도 똑같이 지웁니다 (테스트로 확인).

---

## 3. 데모 백엔드 매핑 (core/docdb.js · demo)

| 항목 | 실서버 (Firestore) | 데모 |
|---|---|---|
| 저장소 | Firestore (persistentLocalCache) | IndexedDB `wgb-demo` / store `kv` / 키 `doc:<경로>` (store.js 데모와 같은 DB, 키 공간 분리) |
| 실시간 | onSnapshot | BroadcastChannel `wgb-docdb` 메시지 `{ path }` → 구독자가 다시 읽음 (IDB 트랜잭션 완료 **후** 전송 → 탭 간 경합 없음) |
| 서버 시각 | `serverTimestamp()` | 쓰는 순간 `Date.now()` |
| 증가 | `increment(n)` | IDB 트랜잭션 안에서 읽고-더하고-씀 |
| create | 트랜잭션 (있으면 already-exists) | 있으면 already-exists |
| 권한 | firestore.rules | `schema.js` 의 같은 조건 (관리자 = `body.admin` 페이지에서만 true, 하객 존재 = 데모 guests 목록) |
| 컬렉션 조회 | 쿼리 | `IDBKeyRange.bound('doc:<col>/', 'doc:<col>/￿')` 스캔 후 JS로 where/orderBy/limit |
| 아카이브 모드 | – | `archive` 백엔드: JSON 읽기 전용, 모든 쓰기 `archived` 오류 · `app/settings` = data.json의 `settings` 스냅샷(features·cfg) + 기본값, `app/live` = 기본값 (WP-14 §5) |

`store.js` 변경 (WP-00b, 추가만): 두 어댑터가 `backend`를 노출 → docdb가 같은 인스턴스를 씁니다.
```js
// firebaseStore() 반환 객체에
backend: { kind: 'firebase', fs, db, auth, au, watch, late },
// demoStore() 반환 객체에
backend: { kind: 'demo', kv, bc },
```

---

## 4. 보안 규칙 v4 — `firestore.rules` 전체 (WP-00b가 이대로 교체)

v3.2 블록은 **한 글자도 바꾸지 않았습니다**. v4 블록은 뒤에 추가했습니다.
규칙 원칙: 모든 쓰기는 ① 필드 목록 고정(`keys().hasOnly`) ② 타입·길이 제한 ③ 시각은 서버 시각(`== request.time`)
④ 하객 관련 문서는 하객 존재 확인 ⑤ 연타 제한(초 단위) ⑥ 삭제는 관리자만.

```
rules_version = '2';
// 웨딩 픽셀 마을 방명록 — Firestore 보안 규칙 (v4)
// Firebase 콘솔 > Firestore Database > 규칙(Rules) 탭에 전체를 붙여넣고 "게시"하세요.
// ⚠️ 관리자 이메일 목록을 public/js/config.js 의 adminEmails 와 동일하게 맞춰주세요.
// ⚠️ 타임캡슐 공개일(capsules 블록의 timestamp.date)을 config.js 의 capsuleOpen 과 같게 맞춰주세요.
// ⚠️ 하객 1명당 스냅 수(snapSlotOk 의 ['0'..'4'] = 5장)를 config.js 의 snapLimitPerGuest 와 같게 맞춰주세요.
// v4 = v3.2 그대로 + app/settings · app/live · checkins · translations · bingo · polls · votes · thanks · postcards · postcardImages · anniv
//      + guests.priv · notes ("신랑·신부에게만" 메시지)
service cloud.firestore {
  match /databases/{database}/documents {

    function isAdmin() {
      return request.auth != null
        && request.auth.token.email_verified == true
        && request.auth.token.email.lower() in ['jihwan.patrick.lee@gmail.com', 'sunkyung0212@gmail.com'];
    }
    function guestPath(id) { return /databases/$(database)/documents/guests/$(id); }
    // avatar values are small ints / short names / #hex colors — bound every one so a guest doc can't be 1 MB
    function smallVal(m, k) { return !(k in m) || m[k] is int || (m[k] is string && m[k].size() <= 24); }
    function validAvatar(a) {
      return a is map
        && a.keys().hasOnly(['skin', 'hair', 'hairStyle', 'face', 'eyes', 'brows', 'mouth', 'beard', 'glasses', 'outfit', 'color', 'color2', 'acc', 'hp'])
        && smallVal(a, 'skin') && smallVal(a, 'hair') && smallVal(a, 'hairStyle') && smallVal(a, 'face') && smallVal(a, 'eyes')
        && smallVal(a, 'brows') && smallVal(a, 'mouth') && smallVal(a, 'beard') && smallVal(a, 'glasses') && smallVal(a, 'outfit')
        && smallVal(a, 'color') && smallVal(a, 'color2') && smallVal(a, 'acc')
        && (!('hp' in a) || (a.hp is map && a.hp.keys().hasOnly(['t', 'l', 'b', 'c', 'k'])
              && smallVal(a.hp, 't') && smallVal(a.hp, 'l') && smallVal(a.hp, 'b') && smallVal(a.hp, 'c') && smallVal(a.hp, 'k')));
    }
    function validGuestFields(d) {
      return d.name is string && d.name.size() > 0 && d.name.size() <= 30
        && d.message is string && d.message.size() <= 300
        && d.side in ['groom', 'bride', 'both']
        && validAvatar(d.avatar)
        && (!('activity' in d) || d.activity in ['walk', 'dance', 'fish', 'chat', 'eat', 'photo']);
    }
    // blobs must be base64 data: URLs of the right kind (never a javascript:/https: link that admin would open)
    function isJpeg(v) { return v is string && v.size() < 900000 && v.matches('data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+'); }
    function isAudio(v) { return v is string && v.size() < 900000 && v.matches('data:audio/[a-z0-9.+-]+(;[a-zA-Z0-9=.+-]+)*;base64,[A-Za-z0-9+/=]+'); }
    // snap doc id = "<guestId>_<slot>", slot 0..4 → at most 5 snaps per guest, enforced here
    function snapSlotOk(id, gid) {
      return id.split('_').size() == 2 && id.split('_')[0] == gid && id.split('_')[1] in ['0', '1', '2', '3', '4'];
    }

    // 방명록: 누구나 읽기(마을 화면) · 누구나 작성 · 수정/삭제는 관리자
    match /guests/{id} {
      allow read: if true;
      // v4 priv: 메시지는 notes/{id}(관리자 전용)에 있음 → 공개 문서의 message 는 비어 있어야 함
      allow create: if request.resource.data.keys().hasOnly(['name', 'side', 'message', 'priv', 'avatar', 'activity', 'hidden', 'hasPhoto', 'hasVoice', 'hasCapsule', 'createdAt'])
        && validGuestFields(request.resource.data)
        && request.resource.data.hidden == false
        && (!('priv' in request.resource.data) || (request.resource.data.priv is bool && (request.resource.data.priv == false || request.resource.data.message == '')))
        && request.resource.data.hasPhoto is bool
        && (!('hasVoice' in request.resource.data) || request.resource.data.hasVoice is bool)
        && (!('hasCapsule' in request.resource.data) || request.resource.data.hasCapsule is bool)
        && request.resource.data.createdAt == request.time;
      allow update: if isAdmin()
        && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['name', 'side', 'message', 'avatar', 'activity', 'hidden'])
        && validGuestFields(request.resource.data);
      allow delete: if isAdmin();
    }

    // 원본 사진: 방명록과 같은 배치로만 생성 · 관리자만 열람
    match /photos/{id} {
      allow create: if existsAfter(guestPath(id)) && getAfter(guestPath(id)).data.hasPhoto == true
        && request.resource.data.keys().hasOnly(['data', 'createdAt'])
        && isJpeg(request.resource.data.data)
        && request.resource.data.createdAt == request.time;
      allow read, delete: if isAdmin();
    }

    // 음성 축하 메시지: 방명록과 같은 배치로만 생성 · 관리자만 열람
    match /voices/{id} {
      allow create: if existsAfter(guestPath(id)) && getAfter(guestPath(id)).data.hasVoice == true
        && request.resource.data.keys().hasOnly(['data', 'mime', 'createdAt'])
        && isAudio(request.resource.data.data)
        && request.resource.data.mime is string && request.resource.data.mime.size() < 60
        && request.resource.data.createdAt == request.time;
      allow read, delete: if isAdmin();
    }

    // 1주년 타임캡슐: 관리자도 공개일 전에는 읽을 수 없음 (서버가 날짜를 강제)
    match /capsules/{id} {
      allow create: if existsAfter(guestPath(id)) && getAfter(guestPath(id)).data.hasCapsule == true
        && request.resource.data.keys().hasOnly(['text', 'name', 'createdAt'])
        && request.resource.data.text is string && request.resource.data.text.size() > 0 && request.resource.data.text.size() <= 1000
        && request.resource.data.name is string && request.resource.data.name.size() <= 30
        && request.resource.data.createdAt == request.time;
      allow read: if isAdmin() && request.time >= timestamp.date(2028, 4, 10);
      allow delete: if isAdmin();
    }

    // v4 "신랑·신부에게만" 메시지: 방명록(priv == true)과 같은 배치로만 생성 · 관리자만 열람 · 수정 없음
    match /notes/{id} {
      allow create: if existsAfter(guestPath(id)) && getAfter(guestPath(id)).data.get('priv', false) == true
        && request.resource.data.keys().hasOnly(['message', 'createdAt'])
        && request.resource.data.message is string && request.resource.data.message.size() > 0 && request.resource.data.message.size() <= 300
        && request.resource.data.createdAt == request.time;
      allow read, delete: if isAdmin();
    }

    // 하객 스냅 사진: 방명록을 남긴 하객만, 1인당 5장까지 업로드 · TV 슬라이드쇼(공개) · 숨기기/삭제는 관리자
    match /snaps/{id} {
      allow read: if true;
      allow create: if request.resource.data.keys().hasOnly(['gid', 'name', 'caption', 'data', 'hidden', 'createdAt'])
        && request.resource.data.gid is string && snapSlotOk(id, request.resource.data.gid)
        && exists(guestPath(request.resource.data.gid))
        && request.resource.data.name is string && request.resource.data.name.size() <= 30
        && request.resource.data.caption is string && request.resource.data.caption.size() <= 60
        && isJpeg(request.resource.data.data)
        && request.resource.data.hidden == false   // 승인제(snapApproval: true)로 바꾸면 == true 로 수정
        && request.resource.data.createdAt == request.time;
      allow update: if isAdmin() && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['hidden']);
      allow delete: if isAdmin();
    }

    // 폰 리모컨: 하객별 문서 1개(덮어쓰기, n = 누른 횟수) — 폰은 몇 명만, TV는 전체를 구독
    // 같은 하객의 연타는 2초에 1번까지만 (앱 버튼은 3초 쿨다운) → 콘솔 스팸으로 무료 한도를 소진하기 어렵게
    match /pulse/{gid} {
      allow read: if true;
      allow create: if exists(guestPath(gid))
        && request.resource.data.keys().hasOnly(['type', 'n', 'createdAt'])
        && request.resource.data.type in ['heart', 'clap', 'dance', 'jump', 'greet']
        && request.resource.data.n == 1
        && request.resource.data.createdAt == request.time;
      allow update: if exists(guestPath(gid))
        && request.resource.data.keys().hasOnly(['type', 'n', 'createdAt'])
        && request.resource.data.type in ['heart', 'clap', 'dance', 'jump', 'greet']
        && request.resource.data.n == resource.data.get('n', 0) + 1
        && request.time > resource.data.get('createdAt', timestamp.date(2000, 1, 1)) + duration.value(2, 's')
        && request.resource.data.createdAt == request.time;
      allow delete: if isAdmin();
    }

    // 이벤트: 관리자만 실행 (부케 던지기 / 단체사진 / 불꽃놀이)
    match /events/{id} {
      allow read: if true;
      allow create: if isAdmin()
        && request.resource.data.keys().hasOnly(['type', 'createdAt'])
        && request.resource.data.type in ['bouquet', 'group', 'fireworks']
        && request.resource.data.createdAt == request.time;
      allow delete: if isAdmin();
    }

    // ================= v4 =================
    function guestExists(id) { return id is string && id.size() > 0 && id.size() <= 64 && exists(guestPath(id)); }
    function bilingual(m, n) {
      return m is map && m.keys().hasOnly(['ko', 'en'])
        && m.get('ko', '') is string && m.get('ko', '').size() <= n
        && m.get('en', '') is string && m.get('en', '').size() <= n;
    }
    function optBilingual(d, k, n) { return d.get(k, null) == null || bilingual(d[k], n); }

    // 기능 플래그 · 페이즈 · 기능 설정: 관리자만 쓰기, 모든 기기가 읽음
    match /app/settings {
      allow read: if true;
      allow create, update: if isAdmin()
        && request.resource.data.keys().hasOnly(['features', 'safe', 'phase', 'cfg', 'updatedAt'])
        && request.resource.data.get('features', {}) is map && request.resource.data.get('features', {}).size() <= 40
        && request.resource.data.get('safe', false) is bool
        && request.resource.data.get('phase', 'auto') in ['auto', 'pre', 'live', 'after', 'anniversary']
        && request.resource.data.get('cfg', {}) is map && request.resource.data.get('cfg', {}).size() <= 40
        && request.resource.data.updatedAt == request.time;
    }

    // 라이브: 식순 큐 · 조용 모드 · 열린 투표 · 한 줄 공지
    match /app/live {
      allow read: if true;
      allow create, update: if isAdmin()
        && request.resource.data.keys().hasOnly(['cue', 'cueSeq', 'cueAt', 'quiet', 'poll', 'msg', 'updatedAt'])
        && (request.resource.data.get('cue', null) == null || (request.resource.data.cue is string && request.resource.data.cue.size() <= 24))
        && request.resource.data.get('cueSeq', 0) is int
        && (request.resource.data.get('cueAt', null) == null || request.resource.data.cueAt is timestamp)
        && request.resource.data.get('quiet', false) is bool
        && (request.resource.data.get('poll', null) == null || (request.resource.data.poll is string && request.resource.data.poll.size() <= 24))
        && optBilingual(request.resource.data, 'msg', 80)
        && request.resource.data.updatedAt == request.time;
    }

    // 체크인: 사전 입주한 하객이 결혼식 날 도착을 알림 · 생성만 (되돌리기는 관리자 삭제)
    match /checkins/{gid} {
      allow read: if true;
      allow create: if guestExists(gid)
        && request.resource.data.keys().hasOnly(['via', 'createdAt'])
        && request.resource.data.via in ['phone', 'kiosk', 'entrance', 'admin']
        && (request.resource.data.via != 'admin' || isAdmin())
        && request.resource.data.createdAt == request.time;
      allow delete: if isAdmin();
    }

    // 덕담 번역: 관리자만 저장 (TV·폰은 읽기만)
    match /translations/{gid} {
      allow read: if true;
      allow create, update: if isAdmin()
        && request.resource.data.keys().hasOnly(['src', 'ko', 'en', 'engine', 'updatedAt'])
        && request.resource.data.src in ['ko', 'en']
        && request.resource.data.ko is string && request.resource.data.ko.size() <= 600
        && request.resource.data.en is string && request.resource.data.en.size() <= 600
        && request.resource.data.engine is string && request.resource.data.engine.size() <= 20
        && request.resource.data.updatedAt == request.time;
      allow delete: if isAdmin();
    }

    // 양가 섞이기 빙고: 문서 id = 하객 id · 완료 칸은 늘어나기만 · 1초에 1번
    function bingoOk(d) {
      return d.keys().hasOnly(['done', 'lines', 'updatedAt'])
        && d.done is list && d.done.size() <= 16
        && d.done.hasOnly(['m0', 'm1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9', 'm10', 'm11',
                           'm12', 'm13', 'm14', 'm15', 'm16', 'm17', 'm18', 'm19', 'm20', 'm21', 'm22', 'm23'])
        && d.lines is int && d.lines >= 0 && d.lines <= 10
        && d.updatedAt == request.time;
    }
    match /bingo/{gid} {
      allow read: if true;
      allow create: if guestExists(gid) && bingoOk(request.resource.data);
      allow update: if guestExists(gid) && bingoOk(request.resource.data)
        && request.resource.data.done.hasAll(resource.data.done)
        && request.resource.data.lines >= resource.data.lines
        && request.time > resource.data.updatedAt + duration.value(1, 's');
      allow delete: if isAdmin();
    }

    // 실시간 투표: 관리자가 만들고 열고 닫음 (결과도 관리자가 저장)
    match /polls/{pid} {
      allow read: if true;
      allow create, update: if isAdmin()
        && pid.matches('p[a-z0-9]{1,12}')
        && request.resource.data.keys().hasOnly(['q', 'kind', 'options', 'open', 'order', 'result', 'createdAt', 'updatedAt'])
        && bilingual(request.resource.data.q, 120)
        && request.resource.data.kind in ['choice', 'guest']
        && request.resource.data.options is list && request.resource.data.options.size() <= 8
        && request.resource.data.open is bool
        && request.resource.data.order is int
        && (request.resource.data.get('result', null) == null || request.resource.data.result is map)
        && request.resource.data.updatedAt == request.time;
      allow delete: if isAdmin();
    }

    // 투표: 문서 id = "<pollId>_<guestId>" (1인 1표 · 열려 있는 동안 2초 간격으로 바꿀 수 있음)
    function pollPath(pid) { return /databases/$(database)/documents/polls/$(pid); }
    function voteOk(vid, d) {
      let parts = vid.split('_');
      let poll = get(pollPath(parts[0])).data;
      return parts.size() == 2
        && d.keys().hasOnly(['pid', 'gid', 'choice', 'updatedAt'])
        && d.pid == parts[0] && d.gid == parts[1]
        && guestExists(parts[1])
        && poll.open == true
        && ((poll.kind == 'choice' && d.choice is int && d.choice >= 0 && d.choice < poll.options.size())
          || (poll.kind == 'guest' && d.choice is string && guestExists(d.choice)))
        && d.updatedAt == request.time;
    }
    match /votes/{vid} {
      allow read: if true;
      allow create: if voteOk(vid, request.resource.data);
      allow update: if voteOk(vid, request.resource.data)
        && request.time > resource.data.updatedAt + duration.value(2, 's');
      allow delete: if isAdmin();
    }

    // 하객별 감사 카드: 문서 id = 추측 불가능한 토큰(링크로 전달) · 목록 조회는 관리자만
    match /thanks/{token} {
      allow get: if token.matches('[A-Za-z0-9]{20,40}');
      allow list: if isAdmin();
      allow create, update: if isAdmin()
        && token.matches('[A-Za-z0-9]{20,40}')
        && request.resource.data.keys().hasOnly(['gid', 'name', 'note', 'photo', 'theme', 'createdAt', 'updatedAt'])
        && request.resource.data.gid is string && request.resource.data.gid.size() <= 64
        && request.resource.data.name is string && request.resource.data.name.size() <= 30
        && bilingual(request.resource.data.note, 600)
        && (request.resource.data.get('photo', null) == null || isJpeg(request.resource.data.photo))
        && request.resource.data.theme in ['classic', 'garden', 'night']
        && request.resource.data.updatedAt == request.time;
      allow delete: if isAdmin();
    }

    // 신혼여행 엽서: 관리자만 작성 · 모두 읽기 (목록용 썸네일은 여기, 큰 사진은 postcardImages)
    match /postcards/{id} {
      allow read: if true;
      allow create, update: if isAdmin()
        && request.resource.data.keys().hasOnly(['title', 'msg', 'place', 'theme', 'thumb', 'order', 'createdAt', 'updatedAt'])
        && bilingual(request.resource.data.title, 60)
        && optBilingual(request.resource.data, 'msg', 300)
        && request.resource.data.place is string && request.resource.data.place.size() <= 40
        && request.resource.data.theme in ['default', 'city', 'beach', 'mountain', 'castle', 'night']
        && isJpeg(request.resource.data.thumb) && request.resource.data.thumb.size() < 200000
        && request.resource.data.order is int
        && request.resource.data.updatedAt == request.time;
      allow delete: if isAdmin();
    }
    match /postcardImages/{id} {
      allow read: if true;
      allow create, update: if isAdmin()
        && request.resource.data.keys().hasOnly(['data', 'updatedAt'])
        && isJpeg(request.resource.data.data)
        && request.resource.data.updatedAt == request.time;
      allow delete: if isAdmin();
    }

    // 1주년 재개장 축하 한마디: 하객 1명당 1개 · 2028-04-03 ~ 2028-04-23 (UTC)만 작성
    match /anniv/{gid} {
      allow read: if true;
      allow create: if guestExists(gid)
        && request.resource.data.keys().hasOnly(['text', 'createdAt'])
        && request.resource.data.text is string && request.resource.data.text.size() > 0 && request.resource.data.text.size() <= 300
        && request.resource.data.createdAt == request.time
        && request.time >= timestamp.date(2028, 4, 3) && request.time < timestamp.date(2028, 4, 24);
      allow delete: if isAdmin();
    }
  }
}
```

규칙 언어 참고 (Firebase 공식): `let`은 함수 안에서 최대 10개(규칙 언어 v2, 2020-02 릴리스) · 문서 접근(get/exists) 호출은
단일 요청 10회, 배치/트랜잭션 20회 · 여러 `allow`는 OR · 조건 평가 중 오류 = 거부.

---

## 5. 허용/거부 매트릭스 (WP-00b의 규칙 테스트가 전부 구현)

행위자: **익명**(하객 폰, 로그인 없음) · **관리자**(두 이메일, 이메일 인증) · **타인**(로그인했지만 관리자 아님)

| 경로 | get | list | create | update | delete |
|---|---|---|---|---|---|
| guests | 모두 | 모두 | 모두(모양) | 관리자(모양) | 관리자 |
| photos / voices | 관리자 | 관리자 | 같은 배치·플래그 | ✗ | 관리자 |
| capsules | 관리자·공개일 후 | 〃 | 같은 배치·플래그 | ✗ | 관리자 |
| notes (v4) | 관리자 | 관리자 | 같은 배치·`priv == true` | ✗ | 관리자 |
| snaps | 모두 | 모두 | 하객 존재·슬롯 0–4·JPEG·hidden=false | 관리자(hidden만) | 관리자 |
| pulse | 모두 | 모두 | 하객 존재·n=1 | 하객 존재·n+1·2초 | 관리자 |
| events | 모두 | 모두 | 관리자·종류 3개 | ✗ | 관리자 |
| app/settings, app/live | 모두 | – | 관리자(모양) | 관리자(모양) | ✗ |
| checkins | 모두 | 모두 | 하객 존재 (via=admin은 관리자) | ✗ | 관리자 |
| translations | 모두 | 모두 | 관리자 | 관리자 | 관리자 |
| bingo | 모두 | 모두 | 하객 존재·모양 | 하객 존재·단조 증가·1초 | 관리자 |
| polls | 모두 | 모두 | 관리자·pid 형식 | 관리자 | 관리자 |
| votes | 모두 | 모두 | 하객 존재·열린 투표·유효 선택 | 위 + 2초 | 관리자 |
| thanks | 토큰 형식이면 모두 | **관리자만** | 관리자 | 관리자 | 관리자 |
| postcards · postcardImages | 모두 | 모두 | 관리자 | 관리자 | 관리자 |
| anniv | 모두 | 모두 | 하객 존재·기간 안 | ✗ | 관리자 |
| 그 외 모든 경로 (`app/other` 포함) | ✗ | ✗ | ✗ | ✗ | ✗ |

반드시 포함할 **거부** 사례 (회귀 방지)
1. 익명이 `app/settings`·`app/live` 쓰기 · 타인(로그인, 비관리자)이 같은 쓰기
2. `app/settings.features` 41개 · `phase: 'party'` · `updatedAt`이 클라이언트 시각
3. 없는 하객 id로 `checkins`/`bingo`/`votes`/`anniv` 생성 · `checkins` 두 번째 생성(=update) · 익명의 `via: 'admin'`
4. `bingo` 칸 줄이기(`done` 항목 제거) · `lines` 감소 · 1초 안 재수정 · `m24` 같은 없는 미션 · 17칸
5. 닫힌 투표에 투표 · `choice` 범위 밖 · guest형 투표에 없는 하객 id · 남의 이름으로 투표(`gid` ≠ id 뒤쪽) · 2초 안 재투표
6. 익명의 `thanks` 목록 조회 · 짧은 토큰(19자) get · 익명의 thanks 쓰기
7. `postcards.thumb`·`postcardImages.data` 이미지가 `https://…` · thumb 200KB 이상 · data 900KB 이상
8. `anniv` 2028-04-24 이후 생성 · 301자

추가(2026-10, "신랑·신부에게만"): `priv: true`인데 공개 `message`가 비어 있지 않음 · `priv`가 bool이 아님 · 관리자의 `priv` 수정 · `priv` 없는 하객의 note · 하객 없이 note만 · 빈 note · 익명의 note 읽기/목록 · note 수정 (케이스 `v4.*`, 에뮬레이터 전용)

---

## 6. 외부 주소 허용 목록 (정적 테스트가 강제)

`www.gstatic.com` (Firebase SDK 12.19.0) · `www.w3.org` (SVG 네임스페이스) · `www.youtube-nocookie.com` (마을 TV 영상 iframe — **코어 `core/ui.js`의 `youtubeFrame`만** 만듦, 기능 코드에는 여전히 주소 금지 · WP-20). **그 외 없음.**
번역은 브라우저 내장(외부 호출 없음), 글꼴·음악·이미지는 전부 저장소 안 파일 또는 코드로 그린 픽셀 아트.

---

## 7. 할당량 예산 — 결혼식 당일 (하객 50명 · 기기 약 60대: 하객 폰 50, TV 1, 키오스크 1, 관리자 2, 여분)

Spark 무료: **읽기 50,000 · 쓰기 20,000 · 삭제 20,000 / 일**, 저장 1GB, 다운로드 10GB/월.

| 항목 | 계산 (최악에 가깝게) | 읽기 | 쓰기 |
|---|---|---:|---:|
| v3.2 하객 목록 구독 | TV·관리자 2×(50+50) + 마을을 연 폰 50×(50+50) | 5,200 | 50 |
| v3.2 원본 사진·음성·캡슐 | 관리자 열람 (사진 50 + 음성 20) | 70 | 120 |
| v3.2 스냅 | TV·관리자 2×250 (폰은 안 받음) | 500 | 250 |
| v3.2 리모컨 pulse | 탭 1,500회: TV 1,500 + 친구 구독 폰(평균 6대) 9,000 | 10,500 | 1,500 |
| v3.2 이벤트 | 10회 × 60기기 | 600 | 10 |
| **v4 app/settings + app/live** | 60기기 × (최초 2 + 페이지 이동 재구독 5) + 변경 40회 × 60 | 2,820 | 40 |
| v4 checkins | TV·관리자 2×100 + 마을 연 폰 50×100 | 5,200 | 50 |
| v4 translations | TV·관리자 2×60 | 120 | 60 |
| v4 bingo | 칸 표시 500회: TV·관리자 2×500 + 빙고 시작 시 하객 목록 1회 50×50 | 3,500 | 500 |
| v4 polls/votes | 투표 5회 × (TV 60 + 관리자 60 + 폰 poll 문서 60) | 900 | 260 |
| v4 체크인 이름 찾기(키오스크) | 하객 목록 1회 50 × 10번 | 500 | – |
| v4 엽서·감사 카드 | 당일 없음 | 0 | 0 |
| **합계** | | **≈ 29,900 (60%)** | **≈ 2,840 (14%)** |

여유를 만드는 손잡이 (필요하면 WP-00c/기능 설정으로 조절)
- 폰 마을의 checkins 구독 끄기 (`cfg.prereg.phonePresence: false`) → −5,000 (폰에서는 부재 하객도 보임)
- 친구 구독 6명 → 4명 (village.js `FRIENDS`) → −3,000
- 빙고 TV 리더보드 갱신을 10초 묶음으로 → 읽기 변화 없음(문서 수 기준)이지만 렌더 비용 감소
- Firestore 영구 캐시 덕분에 같은 기기의 재방문은 바뀐 문서만 과금 (30분 이내 재연결)

다운로드(egress): 스냅 250장 × 0.85MB × (TV + 관리자 + 재접속 여유 2) ≈ 0.85GB → 월 10GB 한도의 9%.
저장: 스냅 ~210MB + 사진 ~10MB + 음성 ~5MB + 엽서 30장 ~25MB + 감사 카드 사진 ~30MB ≈ 0.3GB / 1GB.

---

## 8. 백업 (ZIP) 구성 — v3.2 + 기능별 폴더

v3.2: `guestbook.csv` `guestbook.json` `avatars/` `photos/` `voices/` `snaps/` `time-capsule*.{json,txt}` `report.png` `MISSING.txt`
("신랑·신부에게만" 메시지는 CSV의 메시지 칸에 `[신랑·신부에게만] …`, JSON의 `privateMessage`로 들어감 — 관리자 백업이므로)
WP-00c (코어): `app/settings.json` `app/live.json`
기능 (`ctx.admin.backup.add`): `f-prereg/checkins.json` · `f-translate/translations.json` · `f-bingo/bingo.json` ·
`f-poll/polls.json` `f-poll/votes.json` · `f-thanks/thanks.json` + `f-thanks/photos/*.jpg` ·
`f-postcard/postcards.json` + `f-postcard/<id>.jpg`(큰 사진) · `f-anniversary/anniv.json`

---

## 9. 규칙 게시 절차 (Patrick, WP-00b 머지 후 1번 · 이후 바뀐 것: 2026-10 `guests.priv` · `notes` — 같은 파일을 한 번에 게시)

1. `firestore.rules` 전체 복사 → 콘솔 → Firestore → 규칙 → 붙여넣기 → **게시**
2. (선택, 권장) 내 컴퓨터에서 `npm run test:rules` — 에뮬레이터로 §5 매트릭스 전부 확인 (04-testing §6)
3. 5분 실서버 점검: README의 v3.2 점검 + `admin.html` ⚙️ 설정에서 아무 기능 하나 켰다 끄기(설정 저장 확인)

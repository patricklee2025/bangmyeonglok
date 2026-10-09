# WP-14 · 🗄 추억 마을 아카이브 (`archive`)

| 항목 | 값 |
|---|---|
| 브랜치 | `wp/14-archive` · 선행: WP-00c · **결혼식 후** (2027-05) — 동결 기간(2/28–4/11)에는 배포 브랜치에 합치지 않음 |
| 매니페스트 | pages `guest village admin` · phases `after anniversary` · simple ✓ · liveSafe ✓ |
| 허락된 파일 | `public/js/features/archive/**` · **코어 접점: `public/js/store.js`(archiveStore, safeData 확장) · `public/js/config.js`(archive 주석 예시) · `public/js/core/docdb.js`(archive 백엔드 등록)** · `tools/archive-check.mjs`(새 파일) · `tests/features/archive.mjs` · `docs/guide/archive.md` · 매니페스트 줄 · STATUS/CHANGELOG |
| 데이터 | 읽기 전부(관리자) → 정적 파일로 내보내기 |
| 결정 필요 | Q-015 (아카이브 후 Firebase 데이터 보관 기간) |

## 1. 목적
결혼식이 끝난 뒤 마을과 방명록을 **영원히 그대로** 다시 볼 수 있게, 공개 데이터를 정적 파일(JSON + JPEG)로 내보내 Netlify에 함께 올린다.
그러면 Firebase 프로젝트·무료 한도와 상관없이 **"추억 마을"**이 계속 열린다 (읽기 비용 0).

## 2. 무엇이 들어가고 무엇이 빠지나
| 들어감 (공개) | 빠짐 (비공개·불필요) |
|---|---|
| 하객: id·이름·측·덕담·아바타·활동·작성 시각·`hasVoice`(표시용 불리언) | 원본 사진(photos), 음성(voices), 타임캡슐(capsules) |
| 숨김 아닌 스냅 (640px JPEG 재압축) + 캡션 | 숨김 하객·숨김 스냅 |
| 번역, 체크인 시각, 투표 질문·결과, 빙고 줄 수, 엽서(이미지 포함), 1주년 메시지 | 감사 카드(토큰이 비밀 — WP-15 S8), pulse 횟수 원자료 |
| **설정 스냅샷** `settings: { features, cfg }` (`app/settings`는 원래 공개 문서) — 아카이브 후에도 기능 켜짐·기능 설정 유지 | `app/settings`의 `safe`·`phase`(아카이브에서는 항상 false·auto), `app/live` 전체 |

## 3. 내보내기 (관리자 탭 "🗄 아카이브", order 80)
1. [🗄 아카이브 만들기] → 진행 표시 (하객 n/N, 스냅 n/N…)
2. ZIP 구조 (압축을 풀면 `public/` 안에 그대로 넣을 수 있는 모양):
```
archive/
  data.json            { version: 1, createdAt, couple, schedule, settings: { features, cfg }, guests[], snaps[], translations{}, checkins{}, polls[], bingo{}, postcards[], anniv[] }
  snaps/<snapId>.jpg   640px 긴 변, JPEG 0.8 (TV 폴라로이드·벽)
  snaps-full/<snapId>.jpg   원본 해상도 (다운로드·포토북용, 마을은 안 씀)
  postcards/<id>.jpg
  README.txt           배포 방법 (아래 4절, 한국어)
```
3. data.json의 이미지 필드는 `"archive/snaps/<id>.jpg"` 같은 **같은 출처 상대 경로**.
4. `settings` = 내보내는 순간의 `ctx.settings()`에서 `features`·`cfg`만 복사, 그리고 **`features.archive = true`로 강제**
   (아카이브 모드의 주인공이 꺼져 있으면 안 됨). 나머지 기능의 켜짐은 그대로 — 아카이브 후 바꾸려면 data.json의 `settings`를 고쳐 다시 배포(안내서).
5. 다운로드 파일명 `wedding-archive-YYYYMMDD.zip`. 끝나면 `tools/archive-check.mjs` 사용법 안내.

## 4. 배포 (Patrick, README.txt와 `docs/guide/archive.md`에 같은 내용)
1. ZIP 풀기 → `archive` 폴더를 저장소 `public/` 안으로 복사
2. `node tools/archive-check.mjs` → 형식·파일 존재·크기 확인 (오류 0이어야 함)
3. `public/js/config.js`의 `archive: null` → `archive: { url: 'archive/data.json' }`
4. Netlify에 `public` 폴더 배포
5. 확인: 휴대폰으로 사이트 → "추억 마을" 화면, 마을에 하객 전원, 방명록 읽기

## 5. 아카이브 모드 (코어 접점 — store.js)
- `getStore()`: `CONFIG.archive?.url`이 있고 URL에 `?live=1`이 없으면 → `archiveStore(url)` (읽기 전용).
  데모 미리보기·테스트: 데모 모드에서 `?archive=<상대경로>`(정규식 `^archive/[\w/-]+\.json$`)면 아카이브 모드.
- `archiveStore`: data.json 1번 fetch → `subscribeGuests(cb)`·`subscribeSnaps(cb)` 1번 호출 · `subscribeEmotes/Pulse/Events` 아무것도 안 함 ·
  `getPhoto/getVoice` null · `getCapsules` `{ locked: true }` · `getPulseCounts` `{}` · 모든 쓰기 `Object.assign(new Error('archived'), { code: 'archived' })` ·
  `onAuth(cb)` → `cb(null)` · `backend: { kind: 'archive', data }`.
- `safeData(v, 'image')`: 기존 data URL **또는** 아카이브 모드일 때만 `^archive/(snaps|snaps-full|postcards)/[A-Za-z0-9_-]+\.jpg$`. (javascript:·외부 주소는 여전히 거부)
- docdb archive 백엔드(`registerBackend('archive', …)`): data.json의 해당 부분을 문서/컬렉션처럼 읽기, 쓰기는 `archived`.
  **`app/settings` = `{ ...DEFAULT_SETTINGS, features: data.settings.features, cfg: data.settings.cfg, safe: false, phase: 'auto' }`**,
  `app/live` = `DEFAULT_LIVE` (02 §10). `settings` 없는 옛 data.json(version 1 초안)이면 기본값 + `features: { archive: true }`.
  → core/settings가 평소처럼 이 문서를 구독하므로 기능 판정·`ctx.cfg()`가 결혼식 때와 같게 동작 (스토리 간격, 커플 폐백 등).
- 관리자: 아카이브 모드에서도 기본은 Firebase(로그인) — 아카이브 미리보기는 `admin.html?archive=1`.
- 배포 전 권장: 매니페스트 `archive` status를 `ready`로 (Patrick). 스냅샷이 archive를 켜 주지만, `ready`면 data.json을 못 읽는 경우에도 기능이 켜진 채로 안내를 보여 줌.

## 6. 아카이브 모드 화면 (이 기능의 guest·village 부분 — `ctx.db.backend === 'archive'`일 때만 동작, 아니면 setup 즉시 return)

공통: setup 첫 줄에서 `ctx.rootClass('mode')` → `<html class="f-archive-mode">`. 코어 요소 숨김은 전부 이 기능의 `style.css`에서
`html.f-archive-mode <코어 선택자>`로만 합니다 (02 §3 규칙 4 — 코어 DOM 직접 수정 금지). 숨기는 코어 요소 = 아래 표에 적힌 것만.

| 페이지 | 바뀌는 것 |
|---|---|
| 하객 환영 | 문구 덮어쓰기 `ctx.texts`: **`welcome_sub`** → `archive_thanks` (허락된 키는 이것 하나) · CSS로 숨김: `#s-welcome .start-btns`(시작 버튼 2개) · `#btn-mysnap` · 환영 슬롯 order 40 카드: [🏡 추억 마을 보기] [📖 방명록 읽기] [🃏 내 카드](기억된 하객) |
| 하객 기타 화면 | CSS로 숨김: `#snap-done` `#remote-done` `#snap-solo` `#remote-solo` (스냅·리모컨 = 쓰기). `#snap`·`#me=` 주소로 들어와도 쓰기 UI가 보이지 않음 |
| 방명록 읽기 `f-archive-book` | 전체 덕담 카드 목록(아바타·이름·측·덕담·번역), 측 필터, 이름 검색, 50개씩 더 보기 |
| 마을 TV | QR 대신 HUD `tr`에 명판 "추억 마을 · 2027.04.10" · CSS로 숨김: `.hud .qr` |
| 마을 폰 | CSS로 숨김: `.hud .mremote button.em` `.hud .mremote button.snap`(이모트·📷 = 쓰기) · `.hud .mremote a.sign`(ME 없는 폰의 "방명록 쓰기" 링크 — 쓸 수 없으므로) · 기능 액션 자리는 그대로 → 액션 order 15 "📖" → 방명록 시트 · 주민 탭 → 그 하객 덕담 말풍선 6초 · 레벨 최대 장식 |

그래도 어딘가에서 쓰기가 시도되면 store가 `archived` 오류 → 코어의 기존 오류 토스트 (조용히 실패하지 않음).

## 7. 문구
| 키 | KO | EN |
|---|---|---|
| archive_tab | 🗄 아카이브 | 🗄 Archive |
| archive_make | 🗄 아카이브 만들기 | 🗄 Build archive |
| archive_progress | {what} {n}/{total} | {what} {n}/{total} |
| archive_done | 완료! ZIP을 풀어 public 폴더에 넣고 안내대로 배포하세요 | Done! Unzip into the public folder and deploy (see guide) |
| archive_title | 추억 마을 | Memory Village |
| archive_thanks | 함께해 주셔서 고마워요 | Thank you for celebrating with us |
| archive_view_village | 🏡 추억 마을 보기 | 🏡 Visit the Memory Village |
| archive_read | 📖 방명록 읽기 | 📖 Read the guestbook |
| archive_more | 더 보기 | Show more |
| archive_search | 이름 검색 | Search names |
| archive_all | 전체 | All |
| archive_plaque | 추억 마을 · {date} | Memory Village · {date} |
| archive_readonly | 추억 마을은 보기 전용이에요 | The Memory Village is read-only |

## 8. 수용 기준 → `tests/features/archive.mjs`
| # | 기준 |
|---|---|
| A1 | 04 §4.1 (S7: 쓰기 시도 → `archived`) |
| A2 | 데모 하객 12명(숨김 1, 사진·음성·캡슐 포함) + 스냅 5(숨김 1)로 내보내기 → ZIP 항목: data.json, snaps 4, snaps-full 4, README · data.json에 숨김 하객 없음, `photo/voice/capsule` 원문 없음, thanks 없음 · `settings.features.archive === true`, `settings.cfg` = 내보낼 때 값 |
| A3 | `tools/archive-check.mjs`가 그 ZIP(테스트가 임시 폴더에 풀기)을 통과, 일부러 파일 하나 지우면 실패 |
| A4 | 아카이브 모드(`?archive=` + route로 ZIP 파일 제공): 하객 페이지 시작 버튼 없음, 방명록 읽기 11명, 마을에 11명, 폴라로이드 이미지 = archive 경로 |
| A5 | 아카이브 모드에서 이모트·📷 버튼 없음, ME 없는 폰은 "방명록 쓰기" 링크도 없음 + 📖 액션 보임, 주민 탭 → 말풍선 |
| A6 | `safeData`: 아카이브 모드 아닐 때 archive 경로 거부, `javascript:`·`https:` 항상 거부 |
| A7 | 코어 스위트 전부 초록 (아카이브 아닐 때 동작 변화 0) |
| A8 | 설정 유지: 내보낼 때 `story` 켜짐 + `cfg.story.everyMin=3` → 아카이브 모드 TV에서 story 켜짐·`ctx.cfg()` 같음 (beta 기능도 스냅샷대로) · `safe`는 항상 false |
| A9 | 아카이브 모드에서 `ctx.texts`로 바뀐 코어 문구는 `welcome_sub` 하나뿐 · 기능 끄면(`?ff=-archive`) 숨겼던 코어 요소 전부 다시 보임 |

## 9. 수동 QA
실제 데이터로 내보내기 → 로컬 `npm run serve`로 아카이브 모드 확인 → Netlify 배포 → 폰·노트북으로 확인.

## 10. 롤백
config의 `archive`를 null로 되돌려 배포 → 원래 Firebase 모드.

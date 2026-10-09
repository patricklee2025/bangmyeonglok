# WP-13 · 📶 오프라인 대비 — 서비스워커 (`offline`)

| 항목 | 값 |
|---|---|
| 브랜치 | `wp/13-offline` · 선행: WP-00c · 마감 M2 (리허설 1 전) |
| 매니페스트 | pages 전부 · phases 전부 · simple ✓ · **liveSafe ✓** |
| 허락된 파일 | `public/js/features/offline/**` (`index.js` `i18n.js` `off.js`) · **`public/sw.js`(새 파일)** · **`tools/sw-killswitch.js`(새 파일)** · **`public/_headers`(sw.js 블록 추가만 — `netlify.toml`은 건드리지 않음)** · `tests/features/offline.mjs` · `docs/guide/offline.md` · 매니페스트 줄 · STATUS/CHANGELOG |
| 데이터 | 없음 |

## 1. 목적
식장 와이파이가 끊기거나 느려도 **페이지가 열리고**(앱 껍데기 캐시), Firestore의 기존 오프라인 저장(영구 캐시·쓰기 대기열)과 합쳐서
하객이 작성·체크인을 계속할 수 있게 한다. 동시에 **"옛 화면에 갇히는" 서비스워커 사고를 원천 차단**한다.

## 2. 캐시 전략 (`public/sw.js`)
| 요청 | 전략 | 이유 |
|---|---|---|
| 페이지 이동(HTML) | **네트워크 우선**, 3초 안에 응답 없으면 캐시 → 그것도 없으면 캐시된 `index.html` | 배포 직후에도 새 화면 |
| 같은 출처 JS·CSS | **네트워크 우선** 3초 → 캐시 | HTML과 JS 버전이 섞이지 않게 |
| 글꼴·아이콘·`js/vendor/**`(face-api 모델 포함)·`img/**` | 캐시 우선 → 없으면 네트워크 후 저장 | 거의 안 바뀌는 큰 파일 |
| `https://www.gstatic.com/firebasejs/12.19.0/*` | 캐시 우선 (버전 고정 URL) | 오프라인에서도 SDK 로드 |
| Firestore·Google 인증 등 그 외 교차 출처 | **가로채지 않음** | SDK가 직접 처리 |

- 설치 시 미리 받기(precache) = 앱 껍데기만: 4개 HTML, `css/style.css`, `js/*.js`, `js/core/*.js`, `js/features/index.js`, 글꼴 3개, 아이콘.
  face-api 모델(2.4MB)은 미리 받지 않음(처음 사진 분석할 때 캐시).
- 기능 폴더 파일(`js/features/<id>/…`)은 처음 로드될 때 캐시(네트워크 우선 규칙).
- 캐시 이름 `wgb-shell-v<N>` (sw.js 맨 위 상수, 배포마다 올릴 필요 없음 — 네트워크 우선이라). activate 때 다른 이름 캐시 삭제.
- 업데이트: `self.skipWaiting()` + `clients.claim()` 하지 **않음** (열려 있는 페이지 중간 교체 금지). 다음 방문에 새 SW.

## 3. 등록 · 해제 (`features/offline/index.js`)
- setup: `'serviceWorker' in navigator` && 조건(아래) → `navigator.serviceWorker.register('sw.js')` → `ctx.markOffHook()`.
  조건: 데모가 아니고 localhost가 아님 — 단 `?sw=1`이면 데모·localhost에서도 등록(테스트·개발용).
- `?nosw=1`: 그 기기에서 즉시 해제 + `caches` 중 `wgb-` 이름 전부 삭제 + 안내 토스트. (sw.js도 `nosw=1` 페이지 요청을 받으면 스스로 unregister)
- `off.js`의 `off()`: 해제 + 캐시 삭제 (기능을 끄면 코어가 호출).
- 키오스크·TV: 같은 동작. TV는 밤새 켜져 있으므로 업데이트는 새로고침 때만.

## 4. 킬스위치 (`tools/sw-killswitch.js`)
```js
// 비상용: public/sw.js 를 이 파일로 덮어쓰고 배포하면, 각 기기에서 다음 방문 때 SW가 스스로 해제되고 캐시를 지운다.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k.startsWith('wgb-')) await caches.delete(k);
  await self.registration.unregister();
  for (const c of await self.clients.matchAll({ type: 'window' })) c.navigate(c.url);
})()));
```
`public/_headers` 끝에 아래 블록 추가 (브라우저가 매번 새 sw.js를 확인). 헤더를 `netlify.toml`이 아니라 `public/_headers`에 두는 이유:
Netlify 드래그 배포(`public` 폴더만 올림)에서는 `netlify.toml`이 적용되지 않기 때문 (`_headers`는 publish 폴더 안에 있어 두 배포 방식 모두 적용).
```
/sw.js
  Cache-Control: no-cache
```

## 5. 문구
| 키 | KO | EN |
|---|---|---|
| offline_ready | 📶 오프라인에서도 열 수 있어요 | 📶 Ready to work offline |
| offline_now | 인터넷이 끊겼어요. 작성한 내용은 연결되면 자동으로 보내요 | You're offline — we'll send everything once you're back |
| offline_back | 다시 연결됐어요 | Back online |
| offline_removed | 오프라인 저장을 지웠어요 | Offline cache cleared |

- `offline_now`/`offline_back`: `online`/`offline` 이벤트 → 하객 페이지 토스트, 폰 마을 배너(small). TV는 코어 연결 배너가 있으므로 생략.
- `offline_ready`: 처음 설치 완료 때 하객 페이지에서 1번만(설정 없이 조용히 끝나도 됨 — 데모에서만 표시해도 OK).

## 6. 엣지 케이스
- 저장 공간 부족·사파리 개인정보 보호 모드: 등록 실패 → 조용히 무시(기능은 '없는 것'처럼).
- iOS 홈 화면 앱(village.webmanifest) — 같은 SW 범위, 문제없음.
- 관리자 Google 로그인 팝업/리다이렉트(`__/auth/*`, firebaseapp.com) 가로채지 않음 — 반드시 테스트.
- 오래 켜진 TV: 새 배포 후에도 열린 탭은 옛 버전 → 런북대로 새로고침.

## 7. 수용 기준 → `tests/features/offline.mjs` (Playwright: `context.setOffline`, `?sw=1`)
| # | 기준 |
|---|---|
| A1 | 04 §4.1 S1, S3(핫 토글 off → 해제·캐시 삭제), S4, S8 |
| A2 | `?sw=1`로 방문 → 등록·precache 완료 (`caches.keys()`에 `wgb-shell-…`, 목록의 파일 전부 들어 있음) |
| A3 | 오프라인 → `index.html` 새로고침 → 열림 · 데모 방명록 작성 완료 · 마을 열림 |
| A4 | 온라인 복귀 → HTML·JS는 네트워크에서 새로 받음 (서버 응답에 표식 헤더를 붙여 확인: harness 서버 라우트 가로채기) |
| A5 | `?nosw=1` → 해제 + `wgb-` 캐시 0 |
| A6 | 킬스위치: `context.route('**/sw.js')`로 킬스위치 제공 → 두 번 새로고침 → 등록 0, 캐시 0 |
| A7 | 교차 출처 요청(gstatic 외)은 SW를 거치지 않음 (fetch 핸들러 로그) |
| A8 | 정적: sw.js precache 목록의 파일이 전부 존재 + 새 코어 JS 파일이 목록에서 빠지지 않음 · `public/_headers`에 `/sw.js` + `Cache-Control: no-cache` 블록 존재 |

## 8. 수동 QA
iPhone·Android에서 한 번 방문 → 비행기 모드 → 다시 열기 · 관리자 로그인(팝업) 정상 · 노트북 크롬 개발자도구 Application 탭 확인

## 9. 롤백
관리자에서 끄기 → 각 기기 다음 방문 때 `off()` 해제. 그래도 문제면 킬스위치 배포(06 §5).

## 10. 구현 기록 (2026-10-08, `wp/13-offline`)
- 파일: `public/sw.js` · `tools/sw-killswitch.js`(문서 §4 그대로) · `public/_headers`(끝에 `/sw.js` 블록) · `features/offline/` — `index.js`(등록·`?nosw=1`·끊김 안내) · `off.js`(해제 + `wgb-` 캐시 삭제) · `i18n.js`.
- 캐시 하나(`wgb-shell-v1`)에 모두 — 주소의 `?…`는 떼고 파일 단위로 저장. 페이지가 처음 보는 주소면 저장된 `index.html`.
- **지워진 캐시는 되살리지 않음**: `?nosw=1`·끄기 뒤에도 그 페이지는 아직 옛 SW가 맡고 있어서, 남은 요청이 캐시를 다시 만들던 문제를 막음(`caches.has` 먼저).
- `offline_ready`는 하객·키오스크 페이지에서 처음 설치될 때 한 번(`wgb_f_offline_ready`).
- 시험 메모: Playwright `context.route`는 SW 안의 fetch는 가로채지만(A4 표식 헤더 확인), 브라우저의 SW 스크립트 갱신 요청은 못 가로챔 → A6은 시험이 자기 서버(공개 폴더 링크 + 진짜 sw.js 파일)를 띄워 킬스위치를 "배포"해 확인.
- 시험: `tests/features/offline.mjs` (42 체크, `slow`).


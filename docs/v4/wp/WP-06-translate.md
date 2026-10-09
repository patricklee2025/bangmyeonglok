# WP-06 · 🌐 덕담 자동 번역 (`translate`)

| 항목 | 값 |
|---|---|
| 브랜치 | `wp/06-translate` · 선행: WP-00c · 마감 M2 |
| 매니페스트 | pages `village admin` · phases `live after anniversary` · simple ✓ · liveSafe ✗ |
| 허락된 파일 | `public/js/features/translate/**` · `tests/features/translate.mjs` · `docs/guide/translate.md` · 매니페스트 줄 · STATUS/CHANGELOG |
| 데이터 | `translations/{gid}` (관리자 쓰기, 모두 읽기) |
| 결정 필요 | Q-012 (TV 노트북 OS·Chrome). 리허설에서 실제 동작 확인 필수 |

## 1. 목적
한국어 덕담에는 영어를, 영어 덕담에는 한국어를 TV 티커 둘째 줄에 보여줘서 **양가가 서로의 축하를 읽게** 한다.
외부 API·키·비용 없이 **브라우저 내장 번역(Chrome Translator API)** + 관리자 저장본(캐시·수정)으로.

## 2. 번역 엔진
| 엔진 | 어디 | 조건 |
|---|---|---|
| `chrome` | TV 노트북·관리자 노트북 (데스크톱 Chrome 138+) | `'Translator' in self`, `Translator.availability({ sourceLanguage, targetLanguage })` → `'available'` 이면 바로, `'downloadable'/'downloading'`이면 **사용자 클릭 안에서** `Translator.create({ …, monitor })` (모델 다운로드). 모바일·워커 미지원 |
| `manual` | 관리자 직접 입력 | 항상 |
| 없음 | 그 외 | 번역 줄 표시 안 함 |

언어 판정: `detectLang(text)` (한글 있으면 ko). 번역 방향: ko→en, en→ko. 글자 없는 메시지(이모지만)·음성만 메시지는 건너뜀.

엔진 접근은 `features/translate/engine.js` 한 곳에서만 (테스트가 가짜 `self.Translator`를 주입할 수 있게 전역 이름으로 접근).

## 3. 시나리오
| # | 기기 | 흐름 |
|---|---|---|
| S1 | TV | `translations` 구독. 티커에 하객이 나오면 `setTickerExtra(g)`: 저장본이 있고 **원문이 지금 메시지와 같으면** 그 번역 · 없거나 낡았으면(원문 다름) TV 엔진으로 즉석 번역(메모리 캐시, 쓰기 없음) · 엔진 없으면 null |
| S2 | TV, 모델 다운로드 필요 | 배너 1번(small) `translate_tv_hint` → 첫 클릭(`ctx.v.onGesture`)에서 create |
| S3 | 관리자 탭 "🌐 번역"(order 65) | 표: 이름 · 원문 · 언어 · 번역(textarea) · 상태(저장됨/자동/직접/원문이 바뀜/없음) · [저장] · 위 버튼 [🤖 빈 번역 모두 채우기] · 필터(없음·낡음만) · 엔진 상태 |
| S4 | 관리자 자동 번역 | 체크박스 "새 방명록 자동 번역 (이 화면이 열려 있는 동안)" → 새 하객 오면 30초 안에 번역 저장(engine chrome) |
| S5 | 관리자 수정 | textarea 고치고 저장 → engine `manual` (자동 채우기가 덮어쓰지 않음) |
| S6 | 메시지가 수정됨(관리자 ✏️) | 저장본 원문 ≠ 새 메시지 → 상태 "원문이 바뀜", TV는 저장본 무시 |
| S7 | 설정 | `cfg.translate.tv`(기본 true) — TV 번역 줄 끄기 |
| S8 | 백업 | `ctx.admin.backup.add('f-translate/translations.json', …)` — `translations` 전체 (03 §8) |

## 4. 데이터
```js
translations/{gid} = { src: 'ko'|'en', ko: '…원문 또는 번역', en: '…', engine: 'chrome'|'manual', updatedAt: ts() }
// 원문 = d[d.src]. 낡음 판정: d[d.src] !== 현재 g.message.trim()
```
읽기: TV·관리자 각 1 구독(≤ 60문서). 쓰기: 하객당 1회(+수정).

## 5. UX
- TV 티커 둘째 줄: `🌐 {번역}` — 작은 글씨(티커 0.85em), 원문과 다른 색(`--ink-2`), 1줄 말줄임.
- 관리자 표는 폰에서 카드형(한 줄 = 한 하객). 긴 메시지는 3줄 접기.

## 6. 문구
| 키 | KO | EN |
|---|---|---|
| translate_line | 🌐 {text} | 🌐 {text} |
| translate_tab | 🌐 번역 | 🌐 Translation |
| translate_fill | 🤖 빈 번역 모두 채우기 | 🤖 Fill in all missing |
| translate_auto | 새 방명록 자동 번역 (이 화면이 열려 있는 동안) | Auto-translate new messages (while this page is open) |
| translate_unsupported | 이 브라우저는 내장 번역을 지원하지 않아요 (데스크톱 Chrome 138 이상). 직접 입력은 돼요. | No built-in translator here (needs desktop Chrome 138+). You can still type translations. |
| translate_downloading | 번역 모델 내려받는 중… {p}% | Downloading translation model… {p}% |
| translate_ready | 번역 준비됨 | Translator ready |
| translate_need_click | 번역을 시작하려면 버튼을 눌러주세요 | Press the button to start the translator |
| translate_st_saved | 저장됨 | Saved |
| translate_st_chrome | 자동 | Auto |
| translate_st_manual | 직접 | Manual |
| translate_st_stale | 원문이 바뀜 | Original changed |
| translate_st_none | 없음 | None |
| translate_save | 저장 | Save |
| translate_filter | 없음·낡음만 보기 | Missing or stale only |
| translate_progress | {done} / {total} 번역 중 | Translating {done} / {total} |
| translate_cfg_tv | TV 티커에 번역 줄 보이기 | Show translation line on TV |
| translate_tv_hint | 🌐 번역을 켜려면 화면을 한 번 클릭해주세요 | 🌐 Click the screen once to enable translation |

## 7. 엣지 케이스
- 엔진 오류·시간 초과(5초): 그 메시지는 번역 없이, 다음 메시지 계속. 오류는 guard에 집계하지 말고 조용히(브레이커 오작동 방지) — `ctx.log`만.
- 번역 결과가 원문과 같음(이름만 있는 메시지 등): 줄 표시 안 함.
- 600자 초과: 597자 + '…'.
- 하객 삭제: 코어 deleteMany가 translations도 삭제(00b).
- 동시 저장(관리자 2명): 마지막 저장이 이김 — 문제없음.

## 8. 수용 기준 → `tests/features/translate.mjs` (가짜 `self.Translator`를 `addInitScript`로 주입: `[EN] …` / `[KO] …`)
| # | 기준 |
|---|---|
| A1 | 04 §4.1 S1–S9 |
| A2 | 저장본 있음 → TV 티커 둘째 줄 = 저장본 · 원문 바뀜 → 무시하고 엔진 번역 |
| A3 | 저장본 없음 + 엔진 있음 → `[EN] 원문` 표시, Firestore 쓰기 0 |
| A4 | 엔진 없음(주입 안 함) → 줄 없음, 오류 0 |
| A5 | 관리자 "모두 채우기" → 빈 하객 수만큼 문서 생성(engine chrome), 진행 표시 |
| A6 | 직접 수정 저장 → engine manual, 다시 "모두 채우기" 해도 유지 |
| A7 | 자동 번역 체크 → 새 하객 추가 후 30초 안에 문서 생성 |
| A8 | `cfg.translate.tv=false` → TV 줄 없음 |
| A9 | 레이아웃: 티커 2줄일 때 배너·QR과 겹침 0 (TV), 관리자 탭 phoneSE |
| A10 | 관리자 ZIP 백업에 `f-translate/translations.json` — 문서 수·내용이 데모 데이터와 같음 |
| A11 | 관리자 페이지는 pre 페이즈(`?phase=pre`)에서도 탭이 열리고 저장됨 (미리 번역해 두기 — 02 §2.2) |

## 9. 수동 QA (리허설 필수)
TV 노트북 실제 Chrome에서: 가용성 → 첫 클릭 → 모델 다운로드 → 한국어/영어 메시지 5개 번역 품질 확인. 관리자 노트북에서 모두 채우기.
결혼식 전(pre)에는 TV에서 이 기능이 로드되지 않으므로 **`village.html?tv=1&phase=live`**로 확인하고, 끝나면 `village.html?tv=1&phase=auto`로 다시 열기
(`?phase=`는 그 탭에 기억됨). 모델은 브라우저에 남으므로 당일에 다시 받지 않음 (런북 D-1).

## 10. 롤백
끄면 번역 줄 없음. 저장본은 남음(무해).

## 11. 구현 기록 (2026-10-08, `wp/06-translate`)
- 파일: `features/translate/` — `engine.js`(Translator API에 닿는 유일한 곳: check · start(사용자 동작 안) · translate 5초 제한) · `shared.js`(원문·방향 `sourceOf` · 저장본 `savedFor` · 상태 `statusOf` · 600자 자르기) · `index.js`(TV `setTickerExtra` + 관리자 탭 · ⚙️ · 백업) · `i18n.js` · `style.css`.
- TV는 번역 결과를 메모리에만 둠(같은 원문은 한 번만 번역). 오류·시간 초과는 조용히 줄 없음.
- 내려받기 진행 이벤트가 "준비됨" 뒤에 와도 상태를 되돌리지 않음.
- 비공개("신랑신부에게만") · 이모지만 · 빈 메시지는 번역 대상 아님.
- 시험: `tests/features/translate.mjs` (45 체크, `slow`) — 가짜 `self.Translator`(`[EN] …`/`[KO] …`), "엔진 없음"은 Translator를 지운 페이지.


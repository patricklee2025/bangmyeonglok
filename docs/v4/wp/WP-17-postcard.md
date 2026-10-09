# WP-17 · ✉️ 신혼여행 엽서 (`postcard`)

| 항목 | 값 |
|---|---|
| 브랜치 | `wp/17-postcard` · 선행: WP-00c · 결혼식 전 개발 가능(플래그 끔), 신혼여행 시작 전 배포 — **동결 기간 중이면 4/11 이후 합치기** |
| 매니페스트 | pages `guest village admin` · phases `after anniversary` · simple ✓ · liveSafe ✗ |
| 허락된 파일 | `public/js/features/postcard/**` · `tests/features/postcard.mjs` · `docs/guide/postcard.md` · 매니페스트 줄 · STATUS/CHANGELOG |
| 데이터 | `postcards/{id}`(썸네일·내용) · `postcardImages/{id}`(큰 사진) — 관리자 쓰기, 모두 읽기 |
| 결정 필요 | Q-010 여행 도시 목록 |

## 1. 목적
신혼여행 중 신랑·신부가 **폰으로** 사진 한 장과 한 줄을 올리면, 하객들이 사이트와 마을에서 "신혼여행 엽서"로 받아 본다.
결혼식 뒤에도 하객이 마을을 다시 찾을 이유.

## 2. 흐름
| # | 기기 | 흐름 |
|---|---|---|
| S1 | 관리자(폰) 탭 "✉️ 엽서"(order 72) | [＋ 새 엽서]: 사진(카메라/앨범) · 장소(도시, 나라) · 테마(도시/해변/산/성/밤/기본 — 장소 입력하면 추천) · 제목 KO/EN · 한마디 KO/EN(선택) → 미리보기 → [보내기] |
| S2 | 관리자 목록 | 엽서 카드 목록(최신순) · 수정 · 삭제(확인) · 순서는 작성 순(`order` = 현재 개수) |
| S3 | 하객 페이지(after) | 환영 슬롯 order 30 카드 "✉️ 신혼여행 엽서가 도착했어요 ({n})" (새 엽서가 있으면 빨간 점) → 화면 `f-postcard`: 최신순 엽서 · 좌우 넘기기(스와이프·버튼) |
| S4 | 마을 | 한옥 마당에 우체통 소품(새 엽서 있으면 빨간 깃발 올라감) · TV: `cfg.postcard.everyMin`(기본 3)분마다 스포트라이트에 엽서 9초 · 폰: 우체통 탭 또는 액션 order 40 "✉️" → 시트 |
| S5 | 읽음 표시 | 이 기기에서 본 엽서 id 기억(`wgb_f_postcard_seen`) → 새 엽서 빨간 점 |
| S6 | 백업 | `ctx.admin.backup.add('f-postcard/postcards.json', …)` — 엽서 문서 전체(썸네일 포함) + `f-postcard/<id>.jpg`(큰 사진, `postcardImages`) (03 §8) |

## 3. 엽서 디자인 (DOM + CSS, `f-postcard-*`)
- 흰 테두리 카드(가로 3:2) · 사진(큰 사진은 열 때 `postcardImages/{id}` 1회 읽기, 그 전엔 썸네일) · 오른쪽 위 **픽셀 우표**(테마별 16×20 픽셀 그림: 도시=건물, 해변=야자수, 산=봉우리, 성=탑, 밤=달, 기본=하트) ·
  우표 옆 소인(원형 점선 + `{place}` + 날짜) · 아래 손글씨 느낌 제목(굵게) + 한마디 · "from {groom} ♥ {bride}".
- 하객 언어(KO/EN)로 제목·한마디, 한쪽만 있으면 있는 쪽.

## 4. 데이터
```js
postcards/{id}      = { title:{ko,en}, msg?:{ko,en}, place, theme, thumb: JPEG dataURL(480px, <200KB), order, createdAt, updatedAt }
postcardImages/{id} = { data: JPEG dataURL(긴 변 1600px, ≤ 850KB), updatedAt }
```
- 관리자 저장: 사진 → `compressImage(file, 1600)` → data / 같은 이미지 480px → thumb → batch로 두 문서.
- 하객 목록: `col('postcards').orderBy('order','desc').watch` (썸네일만 → 30장이어도 ~3MB).
- 큰 사진: 엽서를 펼칠 때 `doc('postcardImages/'+id).get()`. TV는 표시 직전에.
- 삭제: 두 문서 batch 삭제.

## 5. 문구
| 키 | KO | EN |
|---|---|---|
| postcard_tab | ✉️ 엽서 | ✉️ Postcards |
| postcard_new | ＋ 새 엽서 | ＋ New postcard |
| postcard_photo | 사진 | Photo |
| postcard_place | 장소 (도시, 나라) | Place (city, country) |
| postcard_theme | 우표 테마 | Stamp theme |
| postcard_t_default | 기본 | Classic |
| postcard_t_city | 도시 | City |
| postcard_t_beach | 해변 | Beach |
| postcard_t_mountain | 산 | Mountains |
| postcard_t_castle | 성 | Castle |
| postcard_t_night | 밤 | Night |
| postcard_title_ko | 제목 (한국어) | Title (Korean) |
| postcard_title_en | 제목 (영어) | Title (English) |
| postcard_msg_ko | 한마디 (한국어, 선택) | Note (Korean, optional) |
| postcard_msg_en | 한마디 (영어, 선택) | Note (English, optional) |
| postcard_send | ✉️ 보내기 | ✉️ Send |
| postcard_sent | 하객들에게 보냈어요! | Sent to your guests! |
| postcard_delete_confirm | 이 엽서를 지울까요? | Delete this postcard? |
| postcard_arrived | ✉️ 신혼여행 엽서가 도착했어요 ({n}) | ✉️ Honeymoon postcards ({n}) |
| postcard_from | from {groom} ♥ {bride} | from {groom} & {bride} |
| postcard_prev | ← 이전 | ← Prev |
| postcard_next | 다음 → | Next → |
| postcard_action | ✉️ 엽서 | ✉️ Postcards |
| postcard_none | 아직 엽서가 없어요 | No postcards yet |
| postcard_cfg_every | TV에 엽서 간격 (분) | Postcard interval on TV (min) |

## 6. 엣지 케이스
- 여행지 인터넷 느림 → 저장 중 표시, Firestore 오프라인 대기열(관리자 폰에서 앱을 닫지 말라는 안내 `leave_warn` 코어 문구 재사용).
- 큰 사진 ≤ 850KB 보장(`compressImage` 반복 축소).
- 엽서 0장 → 하객 카드·우체통 깃발·액션 숨김(우체통 소품은 그대로).
- 장소 문자열에 이모지 → 그대로(40자 제한).

## 7. 수용 기준 → `tests/features/postcard.mjs`
| # | 기준 |
|---|---|
| A1 | 04 §4.1 S1–S9 (phases after/anniversary) |
| A2 | 관리자 새 엽서(fixture 사진) → 문서 2개, thumb < 200KB, data ≤ 850KB |
| A3 | 하객 페이지: 카드 "(1)" · 빨간 점 → 열기 → 점 사라짐 · 넘기기 |
| A4 | 큰 사진은 펼칠 때만 읽음 (목록 단계에서 postcardImages 읽기 0 — docdb 호출 기록) |
| A5 | 마을: 우체통 소품, 깃발(새 엽서), TV 스포트라이트(`everyMin` 0.05), 폰 우체통 탭 → 시트 |
| A6 | 스키마 거울: 하객 페이지에서 쓰기 거부, `https:` 사진 거부 |
| A7 | 영어 화면 · 한쪽 언어만 있는 엽서 |
| A8 | 레이아웃: 관리자 폰 작성 화면, 하객 엽서 화면 phoneSE |
| A9 | 관리자 ZIP 백업에 `f-postcard/postcards.json`(엽서 수 일치) + 엽서마다 `f-postcard/<id>.jpg` (JPEG 확인) |
| A10 | 관리자 페이지는 `?phase=pre`·`?phase=live`에서도 엽서 탭이 열리고 저장됨 (02 §2.2) · 그때 하객 페이지에는 엽서 카드 없음 |

## 8. 수동 QA
신혼여행 전에 신랑·신부 폰으로 테스트 엽서 1장 → 하객 폰으로 확인 → 삭제.
결혼식 전에는 페이즈가 `pre`라서 하객 화면에 엽서가 안 나옵니다 → 확인용 하객 폰은 **`index.html?phase=after`**·`village.html?phase=after`로 열고,
끝나면 `?phase=auto`로 탭 기억을 지우세요. (관리자 엽서 탭은 페이즈와 무관하게 열림)

## 9. 롤백
끄면 엽서 화면·우체통 사라짐. 데이터 남음.

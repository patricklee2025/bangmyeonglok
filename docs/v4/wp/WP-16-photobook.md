# WP-16 · 📚 포토북 PDF (`photobook`)

| 항목 | 값 |
|---|---|
| 브랜치 | `wp/16-photobook` · 선행: WP-00c · 결혼식 후 (2027-05) |
| 매니페스트 | pages `admin` · phases `after anniversary` · simple ✓ · liveSafe ✗ |
| 허락된 파일 | `public/js/features/photobook/**` · **`public/photobook.html`(새 페이지)** · `tests/features/photobook.mjs` · `docs/guide/photobook.md` · 매니페스트 줄 · STATUS/CHANGELOG |
| 데이터 | 읽기만 (관리자 로그인: 하객·원본 사진·스냅·번역·투표·엽서) |
| 결정 필요 | Q-009 판형·인쇄 업체 |

## 1. 목적
방명록 전체(캐릭터·덕담·사진·스냅)를 **인쇄용 포토북 PDF**로 만든다. 라이브러리 없이 인쇄용 HTML + 브라우저 "PDF로 저장".
인쇄 업체(예: 포토북 서비스)에 올릴 수 있는 고정 판형.

## 2. 흐름
| # | 기기 | 흐름 |
|---|---|---|
| S1 | 관리자 탭 "📚 포토북"(order 74) | 옵션: 판형(8×8인치 정사각 기본 / A4 / Letter) · 언어(한국어 / English / 함께) · 포함(하객 원본 사진 · 스냅 · 번역 · 투표 결과 · 엽서) · 정렬(작성 순 / 이름 / 신랑측·신부측) → [📚 포토북 열기] (새 탭 `photobook.html?…옵션`) |
| S2 | `photobook.html` | 관리자 확인(아니면 안내) → 데이터 불러오기 진행 표시 → 페이지 생성 → 모든 이미지 디코드 완료 후 [🖨 PDF로 저장] 활성 |
| S3 | PDF 저장 | `window.print()` + 화면 위 안내: "대상: PDF로 저장 · 여백: 없음 · 배경 그래픽: 켜기" (인쇄 시 숨김) |

## 3. 페이지 구성 (`book.js`가 DOM 생성, 각 `.pb-page`는 판형 크기 고정 + `break-after: page`)
| 순서 | 페이지 | 내용 |
|---|---|---|
| 1 | 표지 | 픽셀 마을 풍경(card와 같은 방식, 낮) · "{groom} ♥ {bride}" · 날짜·장소 · "Our Wedding Guestbook" |
| 2 | 숫자로 본 결혼식 | `computeReport()` (report.js) — 하객 수·측 비율 막대·사진/음성/스냅 수·키워드·첫/마지막 하객 |
| 3… | 하객 페이지 | 한 페이지 4명(2×2): 캐릭터(×6, 픽셀 선명) · 이름·측 · 덕담 전체 · 번역(옵션) · 원본 사진(옵션, 있으면) · 그 하객 스냅 썸네일 최대 2장 · 🎤 표시 |
| … | 스냅 갤러리 | 한 페이지 9장(3×3) + 캡션·올린 사람 |
| … | 투표 결과 | 질문·결과(옵션) |
| … | 신혼여행 엽서 | 한 페이지 2장(옵션) |
| 끝 | 마무리 | "함께해 주셔서 고마워요" + 하객 전원 캐릭터 작게 모자이크 |

- 판형: `8x8` = 8in×8in (768px@96dpi 기준 CSS in 단위), `a4` 210×297mm, `letter` 8.5×11in. `@page { size: …; margin: 0 }`.
- 글꼴: 로컬 Galmuri (`fonts/`), 본문은 시스템 글꼴 허용(인쇄 가독성) — 05 §5 예외: 포토북 본문은 `'Apple SD Gothic Neo','Malgun Gothic',system-ui`.
- 이미지: `object-fit: cover`, 캐릭터는 `image-rendering: pixelated`. 원본 사진은 관리자 권한으로 `getPhoto`.

## 4. 문구 (관리자 탭 + 책 안 고정 문구)
| 키 | KO | EN |
|---|---|---|
| photobook_tab | 📚 포토북 | 📚 Photobook |
| photobook_size | 판형 | Page size |
| photobook_size_8x8 | 8×8인치 (정사각) | 8×8 in (square) |
| photobook_lang | 언어 | Language |
| photobook_lang_both | 한국어 + English | Korean + English |
| photobook_include | 포함할 것 | Include |
| photobook_inc_photos | 하객 원본 사진 | Guests' photos |
| photobook_inc_snaps | 하객 스냅 | Guest snaps |
| photobook_inc_trans | 번역 | Translations |
| photobook_inc_polls | 투표 결과 | Poll results |
| photobook_inc_cards | 신혼여행 엽서 | Honeymoon postcards |
| photobook_sort | 정렬 | Order |
| photobook_sort_time | 작성 순 | By time |
| photobook_sort_name | 이름 순 | By name |
| photobook_sort_side | 신랑측 · 신부측 | By side |
| photobook_open | 📚 포토북 열기 | 📚 Open photobook |
| photobook_loading | 불러오는 중… {n}/{total} | Loading… {n}/{total} |
| photobook_print | 🖨 PDF로 저장 | 🖨 Save as PDF |
| photobook_print_tip | 인쇄 창에서 대상: PDF로 저장 · 여백: 없음 · 배경 그래픽: 켜기 | In the print dialog: Save as PDF · Margins: none · Background graphics: on |
| photobook_need_admin | 관리자 로그인이 필요해요 (admin.html에서 로그인 후 다시 열기) | Admin sign-in required (sign in at admin.html, then reopen) |
| photobook_cover_sub | Our Wedding Guestbook | Our Wedding Guestbook |
| photobook_stats | 숫자로 본 결혼식 | Our wedding in numbers |
| photobook_gallery | 하객 스냅 | Guest snaps |
| photobook_end | 함께해 주셔서 고마워요 | Thank you for celebrating with us |

## 5. 엣지 케이스
- 하객 100명 이상 → 25+ 페이지: 메모리 위해 원본 사진은 페이지에 넣을 때 화면 크기에 맞게 재압축(캔버스 → JPEG 0.85, 긴 변 1200px).
- 사진 불러오기 실패 → 그 칸에 "사진 없음", 진행은 계속, 마지막에 실패 목록.
- 덕담이 매우 김(300자) → 칸 글자 크기 자동 축소(최소 9pt), 그래도 넘치면 말줄임 없이 다음 줄 허용(칸 높이 확장 대신 글자 축소 우선).
- 사파리: 인쇄 품질 차이 → 안내서에 "Chrome으로 PDF 저장 권장".

## 6. 수용 기준 → `tests/features/photobook.mjs` (Playwright `page.pdf()` 사용)
| # | 기준 |
|---|---|
| A1 | 04 §4.1 S1–S4, S6, S8 (관리자 탭) |
| A2 | 데모 하객 12명·스냅 5장·투표 1개 → 페이지 수 = 표지1 + 숫자1 + 하객3 + 갤러리1 + 투표1 + 마무리1 = 8 |
| A3 | 각 `.pb-page` 크기 = 판형 (8x8: 768×768 CSS px) · 넘침(overflow) 없음 |
| A4 | `page.pdf({ preferCSSPageSize: true })` → PDF 8페이지 — 개수는 정규식 `/\/Type\s*\/Page(?!s)/g` (`/Pages` 트리 노드는 빼고 셈, 공백 유무 무관) |
| A5 | 옵션 끄기(사진·스냅) → 해당 요소 없음 |
| A6 | 관리자 아님(데모가 아닐 때 흉내: `?asGuest=1` 데모 전용) → `photobook_need_admin` |
| A7 | 언어 en → 고정 문구 영어 |

## 7. 수동 QA
실제 데이터로 PDF 저장 → 인쇄 업체 사양(재단 여백 등)과 비교 → 필요하면 판형 옵션 추가 요청(QUESTIONS.md).

## 8. 롤백
끄면 탭 사라짐. photobook.html은 남아도 관리자만 의미 있음.

# WP-15 · 💌 하객별 감사 카드 (`thanks`)

| 항목 | 값 |
|---|---|
| 브랜치 | `wp/15-thanks` · 선행: WP-00c · 결혼식 후 (미리 만들어 플래그 끈 채 둘 수 있음, 동결 기간 합치기 금지) |
| 매니페스트 | pages `guest admin` · phases `after anniversary` · simple ✓ · liveSafe ✗ |
| 허락된 파일 | `public/js/features/thanks/**` · `tests/features/thanks.mjs` · `docs/guide/thanks.md` · 매니페스트 줄 · STATUS/CHANGELOG |
| 데이터 | `thanks/{token}` (관리자 쓰기 · 토큰 아는 사람만 읽기 · 목록은 관리자) |
| 결정 필요 | Q-008 (기본 문구·테마) |

## 1. 목적
신랑·신부가 하객 한 명 한 명에게 **그 하객의 픽셀 캐릭터가 들어간 감사 카드**를 만들어 링크(카톡)로 보낸다.
링크를 연 하객만 자기 카드를 볼 수 있다 (추측 불가능한 토큰).

## 2. 흐름
| # | 기기 | 흐름 |
|---|---|---|
| S1 | 관리자 탭 "💌 감사 카드"(order 70) | 하객 목록(숨김 제외) · 상태(없음/저장됨) · 검색 · 각 하객: 문구 KO/EN(textarea, 기본 문구 채워짐) · 테마 · 사진(선택) · 미리보기 · [저장] [🔗 링크 복사/공유] [💾 이미지] |
| S2 | 일괄 | [기본 문구로 아직 없는 카드 모두 만들기] (확인 1번) → 문구의 `{name}`을 이름으로 |
| S3 | 링크 | `https://<사이트>/index.html#thanks=<token>` — 폰 관리자에서는 `navigator.share({ url, text })`, 아니면 클립보드 복사 |
| S4 | 하객 폰 | 링크 열기 → 화면 `f-thanks`: 카드 이미지(그 하객 언어, KO/EN 토글) · [💾 저장 · 공유] · [🏡 마을 보기] · 주소의 해시는 지우고 토큰은 이 폰에 기억 |
| S5 | 재방문 | 환영 슬롯 order 20 행 "💌 감사 카드 다시 보기" (기억된 토큰이 있을 때) |
| S6 | 잘못된/지워진 토큰 | "카드를 찾을 수 없어요" + 마을 보기 버튼 |
| S7 | 백업 | `ctx.admin.backup.add('f-thanks/thanks.json', …)` (토큰 포함 — 관리자만 받는 백업이므로 허용) + `f-thanks/photos/<gid>.jpg` (사진 있는 카드만, `addB64`) |
| S8 | 아카이브 모드 (WP-14) | thanks 문서는 아카이브에 넣지 않음(토큰이 비밀이므로 공개 data.json 금지) → 링크를 열면 `thanks_archived` 안내 + 마을 보기. 그래서 아카이브 전환은 감사 카드를 보낸 뒤 충분히 지나서 (Q-015) — 안내서에 "카드 이미지를 저장해 두세요" |

## 3. 데이터
```js
thanks/{token} = { gid, name, note: { ko, en }, photo: dataURL|null, theme: 'classic'|'garden'|'night', createdAt, updatedAt }
token = 24자 [A-Za-z0-9] (crypto.getRandomValues) — 하객당 1개, 한 번 만들면 재사용 (목록 쿼리로 gid→token 매핑)
```
- 관리자: `col('thanks').get()` (목록 = 관리자만 허용), 저장 `doc('thanks/'+token).set({...})`.
- 하객: `doc('thanks/'+token).get()` 1회. 기억: `localStorage['wgb_f_thanks_token']`.
- 사진: `compressImage(file, 1280)` (≤ 850KB). 하객 삭제 시 코어가 이 문서도 삭제(00b).
- `cfg.thanks.template = { ko: '…{name}님…', en: '…{name}…' }` (관리자 설정 섹션에서 편집).

## 4. 카드 (1080×1350, `card.js`)
테마별 배경(classic 크림+분홍 테두리 / garden 풀밭+꽃 / night 남색+청사초롱) · 위: "Thank you · 고마워요" · 가운데: 신랑·신부(인사하는 동작: 2프레임 중 1장 고정)와
하객 캐릭터(×12)가 나란히, 하트 · 사진이 있으면 오른쪽 위 폴라로이드(살짝 기울임) · 아래: 문구(최대 8줄, 말줄임) · "{groom} ♥ {bride} · 2027.04.10".
신랑·신부 스프라이트는 `couple:sprites`(있으면) 아니면 config 아바타.

## 5. 문구
| 키 | KO | EN |
|---|---|---|
| thanks_tab | 💌 감사 카드 | 💌 Thank-you cards |
| thanks_note_ko | 한국어 문구 | Korean note |
| thanks_note_en | 영어 문구 | English note |
| thanks_theme | 테마 | Theme |
| thanks_theme_classic | 클래식 | Classic |
| thanks_theme_garden | 정원 | Garden |
| thanks_theme_night | 밤 | Night |
| thanks_photo | 사진 (선택) | Photo (optional) |
| thanks_photo_remove | 사진 빼기 | Remove photo |
| thanks_save | 저장 | Save |
| thanks_link | 🔗 링크 복사 | 🔗 Copy link |
| thanks_share | 🔗 링크 보내기 | 🔗 Share link |
| thanks_copied | 링크를 복사했어요 | Link copied |
| thanks_image | 💾 이미지 | 💾 Image |
| thanks_bulk | 기본 문구로 아직 없는 카드 모두 만들기 | Create all missing cards from the template |
| thanks_bulk_confirm | {n}명에게 기본 문구 카드를 만들까요? | Create template cards for {n} guests? |
| thanks_status_none | 없음 | Not yet |
| thanks_status_saved | 저장됨 | Saved |
| thanks_template | 기본 문구 ({name} = 하객 이름) | Template ({name} = guest name) |
| thanks_title | 💌 {name}님께 | 💌 Dear {name} |
| thanks_head | Thank you · 고마워요 | Thank you |
| thanks_save_img | 💾 저장 · 공유 | 💾 Save · Share |
| thanks_view_village | 🏡 마을 보기 | 🏡 Visit the village |
| thanks_again | 💌 감사 카드 다시 보기 | 💌 View my thank-you card |
| thanks_missing | 카드를 찾을 수 없어요 | We couldn't find this card |
| thanks_share_text | {name}님, 와주셔서 정말 고마워요! | Thank you so much for coming, {name}! |
| thanks_archived | 감사 카드 보관 기간이 끝났어요. 저장해 두신 이미지를 확인해 주세요 | This card is no longer online — please check the image you saved |

## 6. 엣지 케이스
- 같은 하객 카드 두 번 저장 → 같은 토큰 갱신.
- 문구 한쪽 언어만 → 다른 언어 화면에서도 있는 쪽 표시.
- 토큰이 주소창·카톡 미리보기에 노출 → 링크를 받은 사람만 보는 구조(의도). 카드 내용에 민감한 정보 쓰지 않기 — 안내서에 명시.
- 오프라인 하객: Firestore 캐시 없으면 "카드를 불러오지 못했어요" + 다시 시도.

## 7. 수용 기준 → `tests/features/thanks.mjs`
| # | 기준 |
|---|---|
| A1 | 04 §4.1 S1–S9 (S4: phases after/anniversary만) |
| A2 | 관리자 저장 → 토큰 24자, 문서 모양 = 03 규칙 |
| A3 | 일괄 생성 → 없는 하객 수만큼, 기존 카드는 그대로 |
| A4 | 하객 링크 → 카드 PNG 1080×1350, KO/EN 토글, 해시 삭제, 재방문 행 |
| A5 | 스키마 거울: 하객 페이지에서 `col('thanks').get()` → permission-denied, 짧은 토큰 get 거부 |
| A6 | 하객 삭제(코어) → 카드 문서도 삭제, 링크 → `thanks_missing` |
| A7 | 레이아웃: 관리자 탭 phone·desktop, 하객 카드 화면 phoneSE |
| A8 | 관리자 ZIP 백업에 `f-thanks/thanks.json`(카드 수 일치) + 사진 있는 카드 수만큼 `f-thanks/photos/*.jpg` (JPEG 확인) |
| A9 | 아카이브 모드(`?archive=` 데모)에서 `#thanks=<token>` → `thanks_archived` 안내, 오류 0 |

## 8. 수동 QA
카톡으로 실제 링크 보내기 → 받는 폰(iPhone 카톡 인앱 브라우저)에서 열기·저장.

## 9. 롤백
끄면 링크를 열어도 일반 첫 화면. 카드 데이터는 남음.

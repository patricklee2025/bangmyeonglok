# WP-11 · 🃏 내 픽셀 카드 (`card`)

| 항목 | 값 |
|---|---|
| 브랜치 | `wp/11-card` · 선행: WP-00c · 마감 M2 |
| 매니페스트 | pages `guest village` · phases 전부 · simple ✓ · liveSafe ✗ |
| 허락된 파일 | `public/js/features/card/**` · `tests/features/card.mjs` · `docs/guide/card.md` · 매니페스트 줄 · STATUS/CHANGELOG |
| 데이터 | `guests/{gid}` 읽기 1회 (내 메시지) |

## 1. 목적
하객이 **내 캐릭터 + 내 덕담 + 픽셀 마을 배경**이 담긴 카드 이미지를 저장하고 SNS·카톡에 공유한다. 결혼식의 기념품이자 홍보물.

## 2. 카드 (1080×1350, 4:5 — 인스타그램 게시물 비율)
```
┌──────────────────────────────┐
│  (픽셀 마을 풍경 — 제단·카펫·광장) │  ← scene.js buildGround()+buildProps(6, night) 로 그린 월드에서 고정 영역 잘라 4배 확대
│        [신랑·신부 작게]          │  ← couple:sprites (없으면 config 아바타) ×6
│                                │
│          [내 캐릭터 ×14]        │  ← spriteCanvas(avatar, 'wave', 14) + 발밑 그림자
├──────────────────────────────┤
│ {name}님                [신랑측]│
│ "덕담 최대 3줄…"                 │  ← 말풍선 테두리, Galmuri11
│ {줄 문구: 페이즈별}               │
│ 지환 ♥ 선경 · 2027.04.10   [QR] │  ← QR = village.html?me=<gid> (마을에서 내 캐릭터)
│ PIXEL VILLAGE · 하객 코드 K7QF   │
└──────────────────────────────┘
```
- 테마 3개: `day`(기본) · `sunset`(주황 하늘 톤 오버레이) · `night`(buildProps night=true + 남색 곱하기 + 랜턴 점광).
- 음성만 남긴 하객: 덕담 자리에 "🎤 음성 메시지를 남겼어요"(코어 문구 `voice_msg`).
- 그리기 전 `ensureFonts()`. 월드 그림은 카드 열 때 1번 만들어 테마 바꿀 때 재사용.

## 3. 시나리오
| # | 기기 | 흐름 |
|---|---|---|
| S1 | 하객 페이지 | 허브 행 order 60 "🃏 내 픽셀 카드" → 화면 `f-card`: 미리보기(화면 너비에 맞춤) · 테마 버튼 3개 · [💾 저장 · 공유] · [이전] |
| S2 | 폰 마을 | 액션 order 30 "🃏" → 시트에 같은 미리보기·버튼 |
| S3 | 저장 | `shareImage({ dataURL, filename: 'pixel-card-<code>.png', title, text })` — iOS/Android 공유 시트(파일) → 안 되면 다운로드 |
| S4 | 페이즈 문구 | pre "결혼식 날 만나요!" · live "함께 축하해요!" · after/anniversary "함께해 주셔서 고마워요" |
| S5 | 기억된 하객 없음 | 행·액션 숨김 |

## 4. 문구
| 키 | KO | EN |
|---|---|---|
| card_row | 🃏 내 픽셀 카드 | 🃏 My pixel card |
| card_title | 🃏 내 픽셀 카드 | 🃏 My pixel card |
| card_save | 💾 저장 · 공유 | 💾 Save · Share |
| card_theme_day | ☀️ 낮 | ☀️ Day |
| card_theme_sunset | 🌇 노을 | 🌇 Sunset |
| card_theme_night | 🌙 밤 | 🌙 Night |
| card_line_pre | 결혼식 날 만나요! | See you at the wedding! |
| card_line_live | 함께 축하해요! | Celebrating together! |
| card_line_after | 함께해 주셔서 고마워요 | Thank you for celebrating with us |
| card_footer | PIXEL VILLAGE · 하객 코드 {code} | PIXEL VILLAGE · guest code {code} |
| card_making | 카드 만드는 중… | Making your card… |
| card_share_text | {groom} ♥ {bride} 결혼식 픽셀 마을에서 | From {groom} & {bride}'s Pixel Village wedding |
| card_action | 🃏 카드 | 🃏 Card |

## 5. 엣지 케이스
- 긴 이름(30자)·긴 덕담(300자) → 이름 1줄 말줄임, 덕담 3줄 + '…' (village.js의 `wrap` 방식으로 단어 단위)
- 이모지 이름 → 그대로 (캔버스 글꼴 대체)
- 오프라인 → 내 하객 문서 캐시(Firestore) 사용, 없으면 메시지 없이 카드
- 메모리: 1080×1350 캔버스 1개 + 월드 1개만 유지, 화면 나가면 해제

## 6. 수용 기준 → `tests/features/card.mjs`
| # | 기준 |
|---|---|
| A1 | 04 §4.1 S1–S9 (데이터 쓰기 없음) |
| A2 | 저장 → 다운로드 PNG 1080×1350 (헤드리스는 share 불가 → 다운로드 경로) |
| A3 | 테마 3개 → 서로 다른 이미지 해시 · 같은 테마 두 번 → 같은 해시 (결정적) |
| A4 | 페이즈별 문구 (`?phase=pre/live/after`) — 카드 렌더 함수가 받은 문구 확인(테스트 훅: 렌더 입력을 `data-st` 속성에 기록, 데모 전용) |
| A5 | 300자 덕담 → 3줄 + 말줄임, 레이아웃 오류 0 |
| A6 | 폰 마을 액션 → 시트 → 저장 |
| A7 | 레이아웃: phoneSE `f-card` 화면 겹침 0 |

## 7. 수동 QA
iPhone: 공유 시트 → 카카오톡·인스타그램·사진 저장 / Android: 공유·다운로드 / 이미지 품질(픽셀이 흐리지 않은지)

## 8. 롤백
끄면 버튼 사라짐. 데이터 없음.

## 9. 구현 기록 (2026-10-08, `wp/11-card`)
- 파일: `features/card/` — `index.js`(하객 화면 · 마을 시트 · 공용 카드 보기) · `render.js`(1080×1350 그리기 — DOM·데이터 없음) · `i18n.js` · `style.css`.
- 배경: `buildGround()` + `buildProps(6, night)`를 y-정렬해 그린 월드에서 (105, 0, 270×190) 영역을 ×4 → 1080×760. 밤 테마만 `night=true` 월드를 다시 만듦(월드는 늘 1개).
- 노을 = 주황 그라데이션 multiply · 밤 = 남색 multiply + 청사초롱 자리(`props.light`)에 따뜻한 빛. 난수 없음 → 같은 테마 = 같은 픽셀 (A3 해시로 확인).
- QR = `village.html?me=<gid>` (데모면 `&demo=1`) — 하객 페이지·마을 시트가 같은 주소를 만듦.
- **비공개("신랑·신부에게만") 덕담은 카드에 넣지 않음** → `card_priv` "💌 신랑·신부에게만 마음을 전했어요". SNS에 올리는 이미지라서.
- 폰 마을은 이미 가진 하객 목록을 사용(추가 읽기 0). 하객 페이지는 `guests/{gid}` 1번 읽고 그 페이지에서 재사용. 읽기 실패(오프라인 등) → 덕담 없이 카드.
- 화면을 나가면 큰 캔버스를 1×1로 줄이고 월드를 버림(메모리). 마을 시트는 닫을 때 버스 구독까지 해제.
- 시험 훅(데모 전용): 카드 캔버스 `data-st` = 그린 내용(theme · name · side · msg 줄들 · line · footer · url).
- 문서 표 밖 문구: `card_voice` (코어 `voice_msg`와 같은 문구 — 정적 검사가 기능 자기 키만 허용) · `card_back` 이전/Back · `card_tip` · `card_name` "{name}님"/"{name}" · `card_side_groom|bride|both` · `card_priv` · `card_saved` · `card_shared` · `card_fail` · `card_theme_label` 배경/Background.
- 시험: `tests/features/card.mjs` (58 체크, `slow`).


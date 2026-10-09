# WP-02 · 👰 커플 캐릭터 정밀 제작 (`couple`)

| 항목 | 값 |
|---|---|
| 브랜치 | `wp/02-couple` · 선행: WP-00c · 마감 M1 |
| 매니페스트 | pages `guest kiosk village admin` · phases 전부 · simple ✓ · liveSafe ✓ (admin = ⚙️ 설정 섹션만) |
| 허락된 파일 | `public/js/features/couple/**` · **코어 접점: `public/js/avatar.js` (추가만, §4)** · `tests/features/couple.mjs` · `tests/golden/couple.json` `couple.png` · `docs/guide/couple.md` · 매니페스트 줄 · STATUS/CHANGELOG |
| 결정 필요 | **Q-003** (두 사람 참고 사진·의상·폐백 여부). 답이 없으면 config 기본 외형으로 진행하고 보고서에 "외형 확인 필요" |

## 1. 목적
신랑·신부 캐릭터를 하객 캐릭터보다 **한 단계 더 공들인** 모습으로 만들고, 시기·식순에 따라 옷을 갈아입힌다.
v3.2: `groomAvatar = suit + boutonniere`, `brideAvatar = dress + veil` (일반 하객 부품). v4: 전용 의상 + 소품.

## 2. 모습(look) 목록

| look | 언제 | 신랑 | 신부 |
|---|---|---|---|
| `date` | pre | 셔츠·면바지 (Q-003 반영) | 원피스 |
| `wedding` | live 기본 | 턱시도(검정, 라펠 광택 1px, 나비넥타이, 부토니에) | 웨딩드레스(레이스 점무늬, 허리 리본, 짧은 트레인), 긴 베일, **부케**(idle·wave 프레임 손에) |
| `pyebaek` | live, `live:cue` = `pyebaek` 일 때 (폐백 있을 때만, Q-003) | 한복(남색 저고리·회색 바지·복건) | 활옷 느낌(빨강·초록·금색 소매 줄) + 족두리 |
| `honeymoon` | after | 반팔·선글라스·여행 모자 | 원피스·밀짚모자·작은 가방 |
| `anniv` | anniversary | 깔끔한 셔츠 + 작은 케이크(wave 프레임) | 원피스 + 꽃 한 송이 |

얼굴·머리·피부: Q-003 기준으로 두 사람에게 맞춘 고정값 (예: 신랑 `sidepart`·안경 여부, 신부 `bun`/`long`). 하객 캐릭터와 같은 얼굴 체계를 쓰되
**전용 머리 모양**이 필요하면 `hp`(사진 헤어 파라미터) 조합으로 먼저 표현해 보고, 안 되면 §4의 전용 머리 추가.

## 3. 그리는 방법
- avatar.js의 `build(av, frame)` 파이프라인(22×34 격자 → 외곽선 → 캔버스)을 그대로 쓰고, **전용 의상 그리기 분기**를 추가합니다.
- 모든 프레임(`FRAMES` 10종)에서 자연스러워야 합니다: 걷기(walk1/2) 치마 흔들림 1px, 뒷모습(back/back1/back2) 베일·트레인, `up`(손 들기), `wave`.
- 부케·케이크 같은 손 소품은 해당 프레임에만, 22×34 안에서.
- 색은 05 §5 팔레트 계열: 턱시도 `#1c1a22`/광택 `#3a3446`, 셔츠 `#f4f1ea`, 드레스 `#fffdf8`/그늘 `#e9e2d6`/레이스 `#f4efe6`,
  베일 `rgba(255,255,255,0.72)`(v3.2와 같음), 부케 `#ff9ec4 #ffffff #f7d6e0` + 줄기 `#5e9a46`, 활옷 빨강 `#c8433f`·초록 `#3f8f6e`·금 `#f3c34f`.

## 4. avatar.js 변경 (코어 접점 — **추가만**)
```js
export const COUPLE_OUTFITS = ['tux', 'gown', 'hanbok_groom', 'hanbok_bride', 'date_m', 'date_f', 'travel_m', 'travel_f', 'anniv_m', 'anniv_f'];
// normalizeAvatar: outfit 허용 목록을 [...OUTFITS, ...COUPLE_OUTFITS] 로 (acc 의 COUPLE_ACC 처리와 같은 방식)
// COUPLE_ACC 에 필요한 소품 추가 가능 (예: 'bouquet', 'jokduri', 'bokgeon', 'strawhat', 'sunglasses_hat', 'cake')
// build(): outfit/acc 분기에 전용 그리기 추가. 기존 분기·기존 색·기존 좌표는 건드리지 않음
export function coupleLook(look) { return { groom: {…avatar}, bride: {…avatar} } }   // look → 두 사람 아바타 객체
```
- `OUTFITS`·`ACCESSORIES` 배열 자체는 **바꾸지 않습니다** (하객 꾸미기 화면·골든 테스트가 사용).
- 하객이 데이터 조작으로 전용 의상을 넣어도 그려지기만 할 뿐 문제 없음 (규칙은 문자열 ≤24만 검사).
- **골든**: 기존 `tests/golden/sprites.json` 808개 해시가 하나도 바뀌면 안 됩니다 (core 스위트가 검사). 새 모습은 이 WP의 기능 스위트가
  `tests/golden/couple.json`에 따로 고정 (`node tests/run.mjs couple --update`로 생성 — 기능 스위트도 `h.update` 지원).

## 5. 기능 동작 (`features/couple/index.js`)
- setup: 현재 페이즈·`live:cue`로 look 결정 → `getSprite(coupleLook(look).groom/bride)` → 
  village: `ctx.v.setCoupleSprites(g, b)` · guest/kiosk: `ctx.guest.setCoupleSprites(g, b)` → `emit('couple:sprites', { look, groom, bride })`.
- `phase` 바뀜 / `live:cue`(pyebaek ↔ 다른 큐) → 다시 계산. look이 바뀌는 순간 마을이면 신랑·신부 자리에 `fx.sparkle` 1번.
- dispose: 코어가 자동으로 기본 스프라이트로 되돌림 (`setCoupleSprites`는 한 기능 전용 자리 — 02 §7.8).
- `cfg.couple.pyebaek` (기본 **false**): false면 pyebaek 큐가 와도 wedding 유지. Q-003에서 "폐백 있음"이면 관리자가 켬.
- 관리자 페이지(⚙️ 설정 섹션, `ctx.admin.settings.add`): 체크박스 `couple_cfg_pyebaek` · 모습 미리보기 줄(5 look × 신랑·신부, `spriteCanvas(…, 'idle', 3)`, 아래에 `couple_look_*` 이름).
  관리자 페이지에서는 스프라이트 교체·버스 emit 없음 (미리보기만).

## 6. 문구
| 키 | KO | EN |
|---|---|---|
| couple_look_date | 데이트 | Date |
| couple_look_wedding | 웨딩 | Wedding |
| couple_look_pyebaek | 폐백 | Pyebaek |
| couple_look_honeymoon | 신혼여행 | Honeymoon |
| couple_look_anniv | 1주년 | Anniversary |
| couple_cfg_pyebaek | 폐백 큐에서 한복으로 갈아입기 | Switch to hanbok for the Pyebaek cue |
| couple_cfg_preview | 커플 모습 미리보기 | Couple look preview |

(관리자 설정 섹션용. 하객 화면에는 문구 없음)

## 7. 수용 기준 → `tests/features/couple.mjs`
| # | 기준 |
|---|---|
| A1 | 04 §4.1 S1–S8 (S7 데이터 없음 → 생략 표시) |
| A2 | 코어 golden-sprites 808개 변화 0 (core 스위트 초록) |
| A3 | 5 look × 2명 × 10프레임 = 100개 해시가 `tests/golden/couple.json`과 일치 + 접촉 시트 `tests/.out/couple/sheet.png` |
| A4 | 페이즈별: `?phase=pre/live/after/anniversary` → TV 신랑·신부 스프라이트 해시가 해당 look |
| A5 | `cfg.couple.pyebaek:true` + `live:cue` pyebaek(테스트에서 bus emit) → pyebaek look, 다른 큐 → wedding · 기본(설정 없음 = false)이면 pyebaek 큐에도 wedding |
| A6 | 환영 화면 미니 무대가 같은 look (guest·kiosk) |
| A7 | 끄면 v3.2 기본 커플 (해시 = config 아바타) |
| A8 | perf: 변화 없음 (스프라이트는 look 바뀔 때 1번만 생성) |
| A9 | 관리자 ⚙️ 설정 섹션: 미리보기 10개 캔버스 · 체크박스 저장 → `cfg.couple.pyebaek` → 열린 TV가 새로고침 없이 반영 · 관리자 페이지에서 `couple:sprites` emit 0 |

## 8. 수동 QA
- 신랑·신부 본인이 TV 화면에서 "닮았다" 확인 (리허설 1) → 수정 요청은 QUESTIONS.md
- 폰 환영 화면, 키오스크 환영 화면, 밤 모드 조명 아래에서 드레스가 너무 밝지 않은지

## 9. 롤백
끄면 기본 커플. avatar.js 추가분은 사용되지 않을 뿐 무해.

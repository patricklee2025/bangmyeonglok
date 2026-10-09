# WP-12 · 📸 픽셀 네컷 (`fourcut`)

| 항목 | 값 |
|---|---|
| 브랜치 | `wp/12-fourcut` · 선행: WP-00c · 마감 M2 |
| 매니페스트 | pages `guest` · phases `live after` · **simple ✗** · liveSafe ✗ |
| 허락된 파일 | `public/js/features/fourcut/**` · `tests/features/fourcut.mjs` · `docs/guide/fourcut.md` · 매니페스트 줄 · STATUS/CHANGELOG |
| 데이터 | 선택 시 스냅 1칸 (`ctx.guest.uploadSnap`) — 새 컬렉션 없음 |
| 결정 필요 | Q-013 (키오스크 네컷 여부 — v1은 폰만) |

## 1. 목적
인생네컷처럼 폰 앞카메라로 4장을 연속 촬영해 **픽셀 액자 네컷 사진**을 만든다. 저장·공유하고, 원하면 TV 포토월에도 올린다.

## 2. 흐름
| # | 화면 | 내용 |
|---|---|---|
| S1 | 허브 행 order 70 "📸 픽셀 네컷" | → 화면 `f-fourcut` |
| S2 | `f-fourcut` 촬영 | 앞카메라 미리보기(거울 모드, 4:3 프레임 안내) · 액자 색 3개 · [📸 시작] · [🖼 앨범에서 4장] |
| S3 | 촬영 | 3·2·1 카운트(큰 숫자) → 찰칵(흰 플래시 0.15초) × 4 (사이 2초) · 진행 점 ●●○○ |
| S4 | 결과 `f-fourcut-result` | 세로 네컷 미리보기 · [픽셀 효과 켜기/끄기] · [💾 저장 · 공유] · [📺 TV 포토월에 올리기 (남은 {n}장)] · [다시 찍기] |
| S5 | 카메라 거부/없음 | 안내 + 앨범에서 4장 고르기만 |
| S6 | 화면 나감 | 카메라 즉시 끄기 (`onLeave`) |

## 3. 이미지
- 촬영 원본: 각 컷 4:3 가운데 자르기 → 최대 1080×810 캔버스 (메모리 4장).
- **공유용 세로 네컷** 800×2400 JPEG(0.9): 위 120px 머리띠(커플 이름·날짜, 픽셀 하트) · 컷 4개(각 720×540, 간격 24) · 아래 스티커 줄(내 캐릭터 ×6 + 신랑·신부 ×5, `couple:sprites` 있으면 사용) · "PIXEL VILLAGE 2027.04.10".
- **TV 업로드용 2×2** 1200×960 JPEG(0.85, ≤ 850KB 보장: 넘으면 품질 0.75 → 0.65): 폴라로이드에 잘리지 않는 비율.
- 픽셀 효과(기본 켜짐): 컷을 1/6로 줄였다가 최근접 확대 + 16색 팔레트 양자화(4×4 순서 디더링). 얼굴이 알아볼 정도.
- 액자 색: `pink #f7d6e0` · `mint #cfeee0` · `night #2b2033`(글자 흰색).

## 4. 데이터
- 저장·공유는 기기 안에서만 (`shareImage`).
- TV 업로드: `ctx.guest.uploadSnap({ gid, name, dataURL: grid, caption: t('fourcut_caption') })` → 스냅 1칸 사용. 남은 칸 0이면 버튼 비활성 + 안내.
- 기억된 하객(`me`)이 없으면 업로드 버튼 숨김(저장만).

## 5. 문구
| 키 | KO | EN |
|---|---|---|
| fourcut_row | 📸 픽셀 네컷 | 📸 Pixel photo strip |
| fourcut_title | 📸 픽셀 네컷 | 📸 Pixel photo strip |
| fourcut_start | 📸 촬영 시작 (4장) | 📸 Start (4 shots) |
| fourcut_album | 🖼 앨범에서 4장 고르기 | 🖼 Pick 4 from album |
| fourcut_pick4 | 사진을 4장 골라주세요 ({n}/4) | Pick 4 photos ({n}/4) |
| fourcut_frame | 액자 색 | Frame color |
| fourcut_pixel | 픽셀 효과 | Pixel effect |
| fourcut_save | 💾 저장 · 공유 | 💾 Save · Share |
| fourcut_tv | 📺 TV 포토월에 올리기 (남은 {n}장) | 📺 Send to the photo wall ({n} left) |
| fourcut_tv_done | TV로 보냈어요! | Sent to the big screen! |
| fourcut_tv_full | 사진 칸을 모두 썼어요 | You've used all your photo slots |
| fourcut_again | 다시 찍기 | Retake |
| fourcut_nocam | 카메라를 쓸 수 없어요. 앨범에서 4장을 골라주세요 | Camera unavailable — pick 4 photos instead |
| fourcut_caption | 📸 픽셀 네컷 | 📸 Pixel photo strip |
| fourcut_making | 네컷 만드는 중… | Making your strip… |

## 6. 엣지 케이스
- iOS Safari: `getUserMedia`는 사용자 탭 안에서 시작, `playsinline muted` 필수(코어 카메라와 같은 설정).
- 촬영 중 화면 잠김/전환 → 중단, 다시 시작.
- 앨범 사진 4장 미만 선택 → 남은 수 안내, 5장 이상 → 앞 4장.
- 디코딩 실패(HEIC 일부) → 그 사진만 다시 고르게 (snaps.js `compressImage` 오류 코드 `decode` 재사용).
- 메모리 부족(오래된 폰) → 컷 해상도 720×540으로 낮춰 재시도.

## 7. 수용 기준 → `tests/features/fourcut.mjs` (Chromium 가짜 카메라)
| # | 기준 |
|---|---|
| A1 | 04 §4.1 S1–S9 (간편 모드 숨김, 키오스크 미로드) |
| A2 | 촬영 4번 → 결과 화면, 세로 네컷 800×2400 · 2×2 1200×960 |
| A3 | 픽셀 효과 on/off → 이미지 해시 다름 |
| A4 | 저장 → 다운로드 JPEG |
| A5 | TV 업로드 → snaps 문서 1개(슬롯), `snap:uploaded` where 'feature', TV 폴라로이드(같은 world) · 남은 칸 수 감소 |
| A6 | 5칸 다 찬 하객 → 버튼 비활성 |
| A7 | 앨범 4장 (fixtures face0–3) → 같은 결과 형식 |
| A8 | 화면 나가면 카메라 트랙 0 (MEDIA_SPY) |
| A9 | 레이아웃 phoneSE 촬영·결과 화면 겹침 0 |

## 8. 수동 QA
iPhone·Android 실제 앞카메라 · 밝은/어두운 조명 · 공유 시트 · TV 폴라로이드에서 2×2가 잘 보이는지

## 9. 롤백
끄면 버튼 사라짐. 이미 올린 스냅은 일반 스냅과 같음(관리자에서 숨기기/삭제).

## 10. 구현 기록 (2026-10-08, `wp/12-fourcut`)
- 파일: `features/fourcut/` — `index.js`(촬영 화면 `f-fourcut` · 결과 화면 `f-fourcut-result` · 허브 줄) · `render.js`(컷 자르기 · 픽셀 효과 · 세로 네컷 · 2×2 · JPEG ≤ 850KB) · `i18n.js` · `style.css`.
- **세로 네컷 배치 (문서와 다름)**: §3의 컷 720×540 ×4 + 간격 24로는 2400px 안에 스티커 줄이 들어가지 않아(120 + 2232 = 2352) 컷을 **704×528**(4:3), 간격 16, 머리띠 120으로 정함 → 아래 140px에 스티커 줄(내 캐릭터 · 신랑 · 신부 ×4)과 "PIXEL VILLAGE 날짜". 2×2는 컷 576×432 + 캡션 줄.
- 스티커의 내 캐릭터: 방금 제출한 하객은 `guest:submitted`의 아바타, 다시 온 하객은 `guests/{gid}` 1번 읽기.
- 사진은 미리보기와 같은 거울 모드로 저장(셀카 보이는 그대로). 메모리 부족 시 컷 720×540으로 다시 시도.
- 픽셀 효과: 1/6 축소 → 16색 팔레트(피부톤 포함) + 4×4 Bayer 디더링 → 최근접 확대.
- "이전"은 들어온 화면(완료 · 내 공간)으로 돌아감 — 결과 화면 ↔ 촬영 화면을 오가는 뒤로가기 고리 방지.
- 문서 표와 다른 것: `fourcut_row`는 "픽셀 네컷"(📸 없음 — 허브가 아이콘을 그림).
- 문서 표 밖 문구: `fourcut_back` · `fourcut_frame_pink/mint/night` · `fourcut_on/off` · `fourcut_shot` · `fourcut_decode` · `fourcut_saved` · `fourcut_shared` · `fourcut_fail` · `fourcut_sending` · `fourcut_queued` · `fourcut_tip` · `fourcut_share_text`.
- 시험: `tests/features/fourcut.mjs` (46 체크, `slow`, Chromium 가짜 카메라 · MEDIA_SPY).


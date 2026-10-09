# WP-09 · 🎯 양가 섞이기 빙고 (`bingo`)

| 항목 | 값 |
|---|---|
| 브랜치 | `wp/09-bingo` · 선행: WP-00c · 마감 M2 |
| 매니페스트 | pages `guest village admin` · phases `live` · **simple ✗** (어르신 모드에서 숨김) · liveSafe ✗ |
| 허락된 파일 | `public/js/features/bingo/**` · `tests/features/bingo.mjs` · `docs/guide/bingo.md` · 매니페스트 줄 · STATUS/CHANGELOG |
| 데이터 | `bingo/{gid}` (하객 본인 쓰기, 단조 증가) · `guests` 읽기(코드 확인) |
| 결정 필요 | Q-006 미션 목록 승인 — 없으면 §3 그대로 |

## 1. 목적
신랑측·신부측 하객이 **서로 말을 걸게 만드는** 4×4 빙고. 미션 일부는 상대편 하객의 "하객 코드"를 받아야 해서 자연스럽게 섞인다.
줄을 완성하면 TV에 이름이 뜨고 캐릭터 머리에 왕관이 생긴다.

## 2. 카드
- 미션 풀 24개(m0–m23, §3) 중 `cfg.bingo.off`를 뺀 것에서 `seeded(gid)`로 섞어 16개 → 4×4. **같은 하객 = 항상 같은 카드** (기기 바뀌어도).
- 줄: 가로 4 + 세로 4 + 대각 2 = 최대 10. 1줄 이상 = "빙고!", 16칸 = "올빙고".
- 내 하객 코드(`guestCode(gid)`)를 카드 위에 크게: "내 코드 **K7QF** — 다른 하객에게 알려주세요".

## 3. 미션 풀 (`features/bingo/missions.js` — KO/EN, 종류)

| id | 종류 | KO | EN | 확인 |
|---|---|---|---|---|
| m0 | code | 신랑측 하객의 코드 받기 | Get a code from a groom's guest | 코드 주인 side = groom, 나 아님 |
| m1 | code | 신부측 하객의 코드 받기 | Get a code from a bride's guest | side = bride |
| m2 | code | 처음 만난 하객의 코드 받기 | Get a code from someone new | 나 아님 |
| m3 | code | 나와 다른 쪽 하객의 코드 받기 | Get a code from the other side | side ≠ 내 side (내가 both면 아무나) |
| m4 | code | 나와 같은 활동을 고른 하객 찾기 | Find someone with the same village activity | activity = 내 activity, 나 아님 |
| m5 | auto | 📷 사진 1장 올리기 | 📷 Share a photo | `snap:uploaded` (내 gid) |
| m6 | auto | 🎮 TV 리모컨 보내기 | 🎮 Use the TV remote | `remote:sent` (내 gid) |
| m7 | auto | 🗳 투표 참여하기 | 🗳 Vote in a poll | `vote:cast` (내 gid) |
| m8 | honor | 상대편 하객과 하이파이브 ✋ | High-five someone from the other side ✋ | 확인 버튼 |
| m9 | honor | 다른 테이블 하객과 셀카 | Selfie with someone from another table | 〃 |
| m10 | honor | 양가 부모님께 인사드리기 | Say hello to both families' parents | 〃 |
| m11 | honor | 다른 언어로 축하 한마디 (축하해요! / Congrats!) | Say congrats in the other language | 〃 |
| m12 | honor | 신랑의 어릴 적 별명 알아내기 | Find out the groom's childhood nickname | 〃 |
| m13 | honor | 신부의 어릴 적 꿈 알아내기 | Find out the bride's childhood dream | 〃 |
| m14 | honor | 두 사람 첫 만남 이야기 듣기 (표지판!) | Hear how they met (check the signs!) | 〃 |
| m15 | honor | 케이크 한 입 🍰 | Eat a bite of cake 🍰 | 〃 |
| m16 | honor | 댄스 플로어에서 춤추기 💃 | Dance on the dance floor 💃 | 〃 |
| m17 | honor | 부케 던지기 구경하기 💐 | Watch the bouquet toss 💐 | 〃 |
| m18 | honor | 건배하기 🥂 | Raise a toast 🥂 | 〃 |
| m19 | honor | TV 마을에서 내 캐릭터 찾기 | Spot your character on the big screen | 〃 |
| m20 | honor | 생일이 같은 달인 하객 찾기 | Find someone born in your month | 〃 |
| m21 | honor | 포토월 앞에서 사진 찍기 | Take a photo at the photo wall | 〃 |
| m22 | honor | 신랑·신부에게 직접 축하 인사 | Congratulate the couple in person | 〃 |
| m23 | auto | 📷 사진 3장 올리기 | 📷 Share 3 photos | `snap:uploaded` 누적 3 (이 기능 저장소에서 셈) |

## 4. 시나리오
| # | 기기 | 흐름 |
|---|---|---|
| S1 | 폰 완료 화면/내 사진·리모컨 화면 | 허브 행 order 40 "🎯 빙고 · {lines}줄 · {done}/16" → 화면 `f-bingo` |
| S2 | 폰 `f-bingo` | 내 코드 · 4×4 격자(칸 = 이모지 + 짧은 글, 완료 칸 도장 ✓) · 칸 탭 → 미션 시트 |
| S3 | honor 칸 | "완료했어요!" → 확인("정말 완료했나요?") → 도장 |
| S4 | code 칸 | 4글자 입력 → 확인 → 성공(그 하객 이름 표시 "민준님 코드 확인!") / 실패 사유(없는 코드·나 자신·조건 불일치) |
| S5 | auto 칸 | 설명 + 바로가기(사진 올리기 → `openMine()`, 리모컨 → `openMine()`, 투표 → 투표 카드가 있으면 그 화면). 이벤트가 오면 자동 도장 + 토스트 |
| S6 | 줄 완성 | 폰: 큰 축하 오버레이 1.5초 "🎯 빙고!" · `emit('bingo:line', { gid, lines, all })` (`all` = 16칸 전부) · Firestore 저장 |
| S7 | 폰 마을 | 액션 order 20 "🎯" → 같은 격자를 시트로 |
| S8 | TV | `bingo` 구독 · 하객별 마지막 lines를 기억해 두고 **늘어난 하객마다 `emit('bingo:line', { gid, lines, all })`** (첫 스냅샷은 기억만, emit·배너 없음 — 새로고침 폭탄 방지. 폰의 emit은 TV에 오지 않으므로 TV가 다시 냄 → WP-07 효과음) · 누군가 첫 빙고 → high 배너 "🎯 {name}님 빙고!" · 올빙고 "🏆 {name}님 올빙고!" · 빙고한 주민 머리에 픽셀 왕관(`decorate`) · `rm` 존 순위(투표 패널이 없을 때만: 상위 3명 아바타·이름·줄 수) |
| S9 | 관리자 탭 "🎯 빙고"(order 60) | 순위 전체 · 미션별 완료 수 · 미션 끄기(`cfg.bingo.off`, **행사 전에만** 경고 문구) · 하객 빙고 기록 삭제(테스트 정리용) · 백업 `f-bingo/bingo.json` |

## 5. 데이터 · 동기화
- 로컬 우선: `localStorage['wgb_f_bingo_' + gid]` = `{ done: [...], snaps: n }` → 화면 즉시 반영.
- 서버: `bingo/{gid}` `set({ done, lines, updatedAt: ts() })` — 변경 후 1.2초 디바운스(규칙 1초 제한), 실패 시 5초 뒤 재시도. done은 서버값 ∪ 로컬값.
- 부팅 시 서버 문서 1회 `get` → 로컬과 합침 (다른 기기에서 한 것 반영).
- 코드 확인: `ctx.db.col('guests').get()` 5분 캐시 (없는 코드면 캐시 새로고침 1회 후 실패 처리). 입력은 대문자화·공백 제거, 문자 집합 밖이면 즉시 오류.
- 이 하객이 누군가: `ctx.guest.me()` (없으면 빙고 행 숨김). 폰 마을은 `ctx.v.ME`.

## 6. 문구 (UI)
| 키 | KO | EN |
|---|---|---|
| bingo_row | 🎯 빙고 · {lines}줄 · {done}/16 | 🎯 Bingo · {lines} lines · {done}/16 |
| bingo_title | 🎯 양가 섞이기 빙고 | 🎯 Mix & Mingle Bingo |
| bingo_my_code | 내 코드 {code} — 다른 하객에게 알려주세요 | My code {code} — share it with other guests |
| bingo_done_btn | 완료했어요! | Done! |
| bingo_confirm | 정말 완료했나요? | Really done? |
| bingo_code_ph | 코드 4글자 | 4-letter code |
| bingo_code_check | 확인 | Check |
| bingo_code_ok | {name}님 코드 확인! | Got {name}'s code! |
| bingo_code_none | 없는 코드예요. 다시 확인해주세요 | No guest has that code. Check again |
| bingo_code_self | 내 코드는 안 돼요 😉 | Not your own code 😉 |
| bingo_code_rule | 이 미션은 {rule} 코드가 필요해요 | This one needs a code from {rule} |
| bingo_rule_groom | 신랑측 하객의 | a groom's guest |
| bingo_rule_bride | 신부측 하객의 | a bride's guest |
| bingo_rule_other | 다른 쪽 하객의 | the other side |
| bingo_rule_act | 같은 활동을 고른 하객의 | someone with your activity |
| bingo_auto_hint | 하면 자동으로 체크돼요 | This checks itself when you do it |
| bingo_go_snap | 📷 사진 올리러 가기 | 📷 Share a photo |
| bingo_go_remote | 🎮 리모컨 열기 | 🎮 Open the remote |
| bingo_go_poll | 🗳 투표하러 가기 | 🗳 Go vote |
| bingo_line | 🎯 빙고! | 🎯 BINGO! |
| bingo_all | 🏆 올빙고! | 🏆 Full card! |
| bingo_tv_line | 🎯 {name}님 빙고! | 🎯 {name} got BINGO! |
| bingo_tv_all | 🏆 {name}님 올빙고! | 🏆 {name} filled the card! |
| bingo_rank | 빙고 순위 | Bingo leaders |
| bingo_action | 🎯 빙고 | 🎯 Bingo |
| bingo_tab | 🎯 빙고 | 🎯 Bingo |
| bingo_off_warn | 행사 중에 미션을 끄면 하객 카드가 바뀌어요. 행사 전에만 바꾸세요 | Changing missions reshuffles everyone's card — only change before the event |
| bingo_saved_later | 인터넷이 돌아오면 저장돼요 | Will save when you're back online |

## 7. 엣지 케이스
- 같은 하객이 폰 2대: 서버 done 합집합 → 두 기기 모두 같은 도장. lines는 계산값.
- 규칙 거부(1초 이내): 디바운스로 예방, 그래도 거부되면 재시도.
- 미션 끄기(`cfg.bingo.off`) 변경 시 카드가 바뀜 → 이미 한 칸(done)은 유지, 화면 격자만 다시 생성 (done에 있는데 카드에 없는 미션은 줄 계산 제외).
- 하객 50명 미만·한쪽 하객만 있는 경우 m0/m1이 불가능할 수 있음 → 관리자 경고(미션별 가능 인원 0이면 표시).
- 키오스크·간편 모드: 안 보임.

## 8. 수용 기준 → `tests/features/bingo.mjs`
| # | 기준 |
|---|---|
| A1 | 04 §4.1 S1–S9 (S5: 간편 모드에서 행 숨김, 키오스크 로드 안 됨) |
| A2 | 같은 gid → 같은 카드 (두 컨텍스트에서 비교), 16칸 전부 풀 안의 id |
| A3 | honor 도장 → 로컬 즉시, 1.2초 후 서버 문서 done 포함 |
| A4 | code: 다른 쪽 하객 코드 성공 · 내 코드 거부 · 없는 코드 거부 · m0 조건(신랑측) 불일치 거부 |
| A5 | auto: `snap:uploaded` emit → m5 도장 / 3번 → m23 · `remote:sent` → m6 |
| A6 | 줄 계산: 미리 정한 done 조합으로 가로·세로·대각 각 1줄 = 3 |
| A7 | TV: 다른 탭에서 1줄 완성 → TV 배너 "{name}님 빙고!" · TV 탭에서 `bingo:line { gid, lines:1, all:false }` 1번 · 왕관 decorate · rm 순위 1위 · TV 새로고침 → 배너·emit 0 |
| A8 | 스키마 거울: 칸 줄이기·m24·17칸·1초 내 재저장 → 거부 |
| A9 | 레이아웃: phoneSE 격자(4×4 칸 ≥ 72px), 시트, TV rm 존 |

## 9. 수동 QA
친구 4명이 리허설에서 실제로 코드 주고받기 → 5분 안에 1줄 가능한지(너무 어렵거나 쉬운 미션 조정 → QUESTIONS.md).

## 10. 롤백
끄면 카드·왕관·순위 사라짐. 기록은 남음.

## 11. 구현 기록 (2026-10-08, `wp/09-bingo`)
- 파일: `features/bingo/` — `index.js` · `missions.js`(풀 24 · 아이콘 · i18n 키 표) · `shared.js`(카드 `cardFor` · 줄 `linesOf` · 코드 확인 · 하객별 상태 `bingoState`) · `board.js`(격자 + 미션 상세 — 하객 화면·마을 시트 공용) · `guest.js` · `village.js`(TV · 폰) · `admin.js` · `i18n.js` · `style.css`.
- **코어 접점(1줄)**: `guest.js` 허브가 같은 하객 행을 다시 칠할 때 함수 `title`을 다시 읽음 — "빙고 · n줄 · d/16" 갱신용 (`hub.refresh()`). 02 §6 구현 메모에 추가.
- 미션 상세는 시트를 겹치지 않고 같은 자리에서 격자 ↔ 상세로 바뀜 (마을의 시트는 한 번에 하나).
- 하객 페이지는 **이 폰의 하객**(기억된 하객 · 허브에 보인 하객)에 대해서만 상태를 만들고 자동 칸 이벤트를 받음.
- 서버 저장: `done`은 서버값 + 내 새 칸(카드에 있는 것 먼저, 16개까지 — 규칙상 줄일 수 없음) · `lines` = max(서버값, 계산값) — 미션을 꺼서 카드가 바뀌어도 거부되지 않게.
- TV: `bingo` 컬렉션 1개 구독. 첫 스냅샷은 기억만(새로고침 배너 없음). 첫 빙고 / 올빙고(16칸 · 10줄) high 배너 + 그 주민 점프. 왕관 = `decorate`(fillRect만, 프레임마다 할당 없음).
  rm 순위는 `app/live.poll`이 있으면 숨김 (투표 패널이 rm 존을 씀 — 기능끼리 import 없이 코어 데이터로 판단).
- 문서 표와 다른 것: `bingo_row`는 "빙고 · {lines}줄 · {done}/16"(🎯 없음 — 허브가 아이콘을 그림, WP-19와 같은 이유).
- 문서 표 밖 문구: 미션 짧은 글 `bingo_s0…s23` · 미션 전체 `bingo_m0…m23`(§3 표 그대로) · `bingo_back` · `bingo_close` · `bingo_code_bad` · `bingo_code_wait` · `bingo_stamped` · `bingo_status` · `bingo_lines_n` · `bingo_rank_empty` · `bingo_a_*`(관리자 9개).
- 시험: `tests/features/bingo.mjs` (87 체크, `slow`).


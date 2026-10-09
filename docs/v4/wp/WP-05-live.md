# WP-05 · 📋 식순 연동 라이브 모드 (`live`)

| 항목 | 값 |
|---|---|
| 브랜치 | `wp/05-live` · 선행: WP-00c · 마감 M2 |
| 매니페스트 | pages `village admin` · phases `live` · simple ✓ · liveSafe ✗ |
| 허락된 파일 | `public/js/features/live/**` · `tests/features/live.mjs` · `docs/guide/live.md` · 매니페스트 줄 · STATUS/CHANGELOG |
| 데이터 | `app/live` 쓰기(관리자) · `cfg.live.program` |
| 결정 필요 | **Q-005** 실제 식순. 없으면 §3 기본 식순 |

## 1. 목적
도우미가 관리자 화면에서 식순을 "다음 ▶"으로 넘기면, TV 마을(과 하객 폰 마을)이 그 순간에 맞는 **장면**을 연출하고
화면 위에 지금 순서를 보여준다. 서약·반지처럼 엄숙한 순간에는 자동으로 **조용 모드**.

## 2. 시나리오
| # | 기기 | 흐름 |
|---|---|---|
| S1 | 관리자 라이브 슬롯(order 10) | 현재 큐 이름 + 큰 버튼 "다음 ▶ {다음 큐}" + 작은 "◀" + 펼치기(전체 목록에서 바로 선택) |
| S2 | TV | 새 큐(최근 90초 안) → 장면 실행(seed = cueSeq) + high 배너 + `tc` 제목 줄 "📋 반지 교환" |
| S3 | 폰 마을 | TV와 같은 장면(같은 seed) · 배너 · `tc` 제목 |
| S4 | 큐에 `quiet:true` | 같은 쓰기에서 `live.quiet = true` → 코어 조용 모드 (배너·소리·불꽃·폴라로이드 멈춤). 다음 큐가 quiet:false면 해제 |
| S5 | 큐에 `event` | 관리자가 큐를 넘길 때 코어 이벤트도 보냄 (`store.sendEvent('group'|'bouquet'|'fireworks')`) |
| S6 | TV 새로고침(본식 중) | 최근 큐가 90초 넘었으면 장면 재생 없이 제목·조용 상태만 복원 |
| S7 | "◀" (실수 되돌리기) | 이전 큐로, `cueAt: null` → 장면 없이 제목만 |
| S7b | 관리자 라이브 슬롯 "📢 한 줄 공지" | 입력(KO/EN, 각 ≤ 80자) → [띄우기] = `setLive({ msg })` → TV·폰 `tc`에 제목 대신 표시 · [내리기] = `msg: null` · 다음 큐를 누르면 자동으로 내려감 |
| S8 | 관리자 탭 "📋 식순"(order 52) | 식순 편집: 순서 ▲▼, 켜기/끄기, 이름(KO/EN), 장면 선택, 조용 여부, 이벤트, 배너 문구 → `cfg.live.program` 저장 · "기본 식순으로" |

## 3. 기본 식순 (`features/live/program.js`, Q-005로 교체)

| id | 이름 KO / EN | 장면 | quiet | event | 배너(high) KO / EN |
|---|---|---|---|---|---|
| doors | 하객 입장 / Guests arriving | none | ✗ | – | – |
| groom | 신랑 입장 / Groom's entrance | cheer | ✓ | – | – |
| bride | 신부 입장 / Bride's entrance | aisle | ✓ | – | – |
| vows | 혼인 서약 / Vows | hush | ✓ | – | – |
| rings | 반지 교환 / Ring exchange | rings | ✓ | – | – |
| declare | 성혼 선언 / Pronouncement | kiss | ✗ | – | 💍 결혼을 축하합니다! / 💍 Just married! |
| song | 축가 / Wedding song | sway | ✓ | – | – |
| march | 행진 / Recessional | recessional | ✗ | – | 🎉 신랑·신부 행진! / 🎉 Here they come! |
| photo | 사진 촬영 / Group photo | none | ✗ | group | – |
| dinner | 식사 / Dinner | feast | ✗ | – | 🍽 맛있게 드세요! / 🍽 Enjoy your meal! |
| toast | 건배 / Toast | cheers | ✗ | – | 🥂 건배! / 🥂 Cheers! |
| firstdance | 첫 댄스 / First dance | firstdance | ✗ | – | 💃 두 사람의 첫 댄스 / 💃 First dance |
| bouquet | 부케 던지기 / Bouquet toss | none | ✗ | bouquet | – |
| cake | 케이크 커팅 / Cake cutting | cake | ✗ | – | 🎂 케이크 커팅! / 🎂 Cake time! |
| pyebaek | 폐백 / Pyebaek | bow | ✗ | – | – (기본 꺼짐) |
| farewell | 감사 인사 / Thank you | none | ✗ | fireworks | 🙏 와주셔서 감사합니다! / 🙏 Thank you for coming! |

## 4. 장면 (`features/live/scenes.js`, 전부 `ctx.v.runScene`, 30초 이내, `maxSec: 40`)

| 장면 | 연출 |
|---|---|
| none | 없음 (제목·배너만) |
| cheer | 주민 12명(seed)이 카펫 양옆으로 서서 제단을 봄 → 3초 뒤 신랑 hop + 하트 3개 |
| aisle | 카펫 양옆 줄서기(최대 20명, 바라보는 방향 = 카펫) → 신부가 배너 아래에서 제단까지 `walkTo`(8초) → 도착하면 하트·반짝임 |
| hush | 모두 제단을 바라보며 hold. 화면 아주 살짝 어둡게(`onDraw('fx')`에 반투명 남색 0.12, 장면 동안만) |
| rings | hush 상태 유지 + 두 사람 사이 반지 픽셀 아이콘 반짝임 2회 |
| kiss | 신랑·신부 마주보기 → 하트 폭발(20) + 색종이(`fx.confetti`) + 모두 점프 |
| sway | 모두 제자리 좌우 흔들기(facing 교대 0.6초) + 음표 |
| recessional | 두 사람이 카펫을 따라 내려왔다가(6초) 다시 제단으로(6초), 꽃잎 반짝임, 양옆 주민 박수(clap 이모트) |
| feast | 주민 최대 20명이 잔칫상 자리로 이동, 25초 동안 eat 아이콘 |
| cheers | 모두 점프 2회 + 작은 불꽃 3 (조용 아니면) |
| firstdance | 두 사람이 댄스 플로어 가운데로 `walkTo` → 서로 보며 춤(프레임 교대) 15초, 주민들이 플로어 둘레에 원형 배치 |
| cake | 제단 앞에 케이크 소품 등장(장면 동안) → 두 사람 마주보기 → 반짝임 → 하트 |
| bow | 두 사람 앞쪽을 보고 2번 숙이기(back 프레임 대체 아님: hop 반대 = 1px 내려가기) |

장면 끝: 코어가 `releaseAll`. 신랑·신부는 `couple().home()`으로 제단 복귀.

## 5. 데이터 · 동작
- 관리자 "다음 ▶": `ctx.admin.setLive({ cue, cueSeq: ctx.db.inc(1), cueAt: ctx.db.ts(), quiet: !!c.quiet, msg: null })` → `c.event`면 이어서
  `(await ctx.store()).sendEvent(c.event)`. 버튼은 2초 동안 비활성(연타 방지).
- 마을: `ctx.onLive(l => …)` — `l.cueSeq`가 처음 보는 값이면: `fresh = l.cueAt && Date.now() - l.cueAt < 90000` →
  fresh면 장면+배너, 항상 제목 갱신, `emit('live:cue', { cue, seq, fresh })`. 처음 부팅 시 받은 값은 fresh 판정만 하고 장면 없음.
- 큐 정의는 `cfg.live.program`(없으면 기본) — 관리자 편집 결과. 마을도 같은 정의로 장면을 찾음.
- `tc` 제목: `📋 {label}` (조용 모드면 코어 칩과 함께 세로로).

## 6. 문구 (UI. 식순 이름·배너는 program.js의 ko/en)
| 키 | KO | EN |
|---|---|---|
| live_next | 다음 ▶ {label} | Next ▶ {label} |
| live_prev | ◀ 이전 | ◀ Back |
| live_now | 지금: {label} | Now: {label} |
| live_none | 식순 시작 전 | Not started |
| live_all | 전체 식순 | Full program |
| live_tab | 📋 식순 | 📋 Program |
| live_edit_scene | 장면 | Scene |
| live_edit_quiet | 조용 모드 | Quiet |
| live_edit_event | 함께 보낼 이벤트 | Also trigger |
| live_edit_banner | 배너 문구 | Banner text |
| live_edit_on | 사용 | Use |
| live_reset | 기본 식순으로 | Reset to default |
| live_reset_confirm | 지금 식순을 지우고 기본으로 되돌릴까요? | Replace the program with the default? |
| live_saved | 저장했어요 | Saved |
| live_title | 📋 {label} | 📋 {label} |
| live_msg | 📢 한 줄 공지 | 📢 Announcement |
| live_msg_ph_ko | 공지 (한국어) | Notice (Korean) |
| live_msg_ph_en | 공지 (영어) | Notice (English) |
| live_msg_show | 띄우기 | Show |
| live_msg_hide | 내리기 | Hide |

## 7. 엣지 케이스
- 장면 중 다음 큐 → 코어 큐에 줄 섬 (끝나면 바로). 관리자는 2초 디바운스.
- 큐 사이 코어 이벤트(부케 버튼 등)도 같은 큐 → 순서대로.
- 하객 0–3명: 장면은 있는 주민만으로 (formation 빈 자리 허용).
- 조용 모드가 켜진 채 live 기능을 끔 → 코어 조용 토글로 끄기 (런북 §4).
- 폰이 늦게 받음(네트워크): 90초 넘으면 장면 생략 = 정상.

## 8. 수용 기준 → `tests/features/live.mjs`
| # | 기준 |
|---|---|
| A1 | 04 §4.1 S1–S9 |
| A2 | 관리자 다음 → TV에서 `village:event { key:'f-live-…', stage:'start' }` · high 배너 · `tc` 제목 |
| A3 | 같은 world의 폰 마을도 같은 장면 (seed 동일 → 줄서기 위치 동일) |
| A4 | quiet 큐 → `live.quiet` true → TV 배너 보류(코어), 다음 비조용 큐 → 해제 |
| A5 | event 큐(photo) → 코어 단체사진 시작 |
| A6 | TV 새로고침 후 장면 재생 없음(stale), 제목·조용 유지 · ◀ → cueAt null → 장면 없음 |
| A7 | 식순 편집 저장 → TV가 새 정의 사용, 기본으로 복원 |
| A8 | 장면 12종(none 제외) 각각 40초 안에 끝나고 `releaseAll` 후 주민 정상 활동 |
| A9 | perf: 장면 중 TV fps ≥ PERF_MIN_FPS (하객 50명) |
| A10 | 한 줄 공지: 띄우기 → TV·폰 `tc`에 공지(제목 대신), 내리기·다음 큐 → 사라짐 |

## 9. 수동 QA
리허설 1에서 실제 사회자 대본에 맞춰 전체 1회 · 도우미가 폰 관리자 화면으로 "다음"을 누르기 편한지(엄지 한 손).

## 10. 롤백
끄면 장면·제목 없음. 이미 켜진 조용 모드는 코어 토글로 해제.

## 11. 구현 기록 (2026-10-08, `wp/05-live`)
- 파일: `features/live/` — `index.js`(마을: 제목·장면·`live:cue`) · `admin.js`(라이브 슬롯·📋 식순 탭) · `program.js`(기본 식순·`programOf` 정리·`labelOf`) · `scenes.js`(장면 12종 — 줄서기 자리는 seed로 결정해 TV·폰이 같음) · `i18n.js` · `style.css`.
- 부팅 때 받은 큐는 "지난 큐"로 봄: 제목·조용 상태만, 장면 없음, `live:cue`의 `fresh=false`.
- 장면이 끝나면 어둡게(hush)·케이크 소품을 바로 걷음. 장면 중 다음 큐는 코어 큐에 줄 섬.
- 문서 표 밖 문구: `live_end`(마지막 큐 뒤 버튼) · `live_fail` · `live_save` · `live_name_ko/en` · 장면·이벤트 이름 `live_scene_*` · `live_event_*`.
- BGM(WP-07)과의 관계: 기본 식순에서 신부 입장은 조용 큐라 TV 음악이 멈춤 — 바그너를 TV로 틀려면 이 큐의 조용 모드를 끄면 됨.
- 시험: `tests/features/live.mjs` (60 체크, `slow`).


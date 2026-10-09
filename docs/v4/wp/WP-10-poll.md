# WP-10 · 🗳 실시간 투표 (`poll`)

| 항목 | 값 |
|---|---|
| 브랜치 | `wp/10-poll` · 선행: WP-00c · 마감 M2 |
| 매니페스트 | pages `guest village admin` · phases `live` · simple ✓ · liveSafe ✗ |
| 허락된 파일 | `public/js/features/poll/**` · `tests/features/poll.mjs` · `docs/guide/poll.md` · 매니페스트 줄 · STATUS/CHANGELOG |
| 데이터 | `polls/{pid}` (관리자) · `votes/{pid}_{gid}` (하객) · `app/live.poll` |
| 결정 필요 | Q-007 질문 목록 (없으면 §3 예시 3개를 "초안" 상태로 생성하는 버튼만) |

## 1. 목적
식사 시간 등에 관리자가 투표를 열면 하객이 폰으로 바로 참여하고, TV에 실시간 막대그래프와 결과 발표가 나온다.
종류 2가지: **보기 선택**(최대 8개) · **하객 뽑기**(예: 오늘의 베스트 드레서 — 하객 중 1명 선택).

## 2. 흐름
| # | 기기 | 흐름 |
|---|---|---|
| S1 | 관리자 탭 "🗳 투표"(order 55) | 투표 만들기(질문 KO/EN, 종류, 보기 KO/EN) · 목록(초안/진행 중/종료 + 결과) · [열기] [닫고 결과 발표] [결과 내리기] [수정] [삭제] · "예시 질문 3개 넣기" |
| S2 | 관리자 라이브 슬롯(order 20) | 지금 투표 상태 + [▶ 다음 투표 열기] / [■ 닫고 결과 발표] 큰 버튼 |
| S3 | 열기 | 다른 열린 투표는 닫음 → `polls/{pid}.open = true` → `setLive({ poll: pid })` |
| S4 | 하객 폰 (완료·내 사진 화면) | 허브 card order 50 (열린 투표 또는 발표된 결과가 있을 때만): 질문 · 큰 보기 버튼(선택) / 하객 검색·아바타 목록(하객 뽑기) → 투표 → "투표 완료! 결과는 TV에서 🎉" · 열려 있는 동안 바꾸기 가능(2초 뒤) |
| S5 | 폰 마을 | 액션 order 10 "🗳" (열린 투표 있을 때만) → 같은 UI 시트 |
| S6 | TV | `rm` 존 패널: 질문 + 막대(선택) 또는 상위 5명 아바타·표 수(하객 뽑기) · 총 투표 수 · 새 표가 오면 막대가 자람 |
| S7 | 닫고 발표 | 관리자 페이지가 votes 집계 → `polls/{pid}` `{ open:false, result }` → TV: 패널이 결과 모드 + high 배너 "🗳 결과: {1위}!" + 1위 하객이면 그 캐릭터에 반짝임·점프 + `emit('poll:result')` · 폰: 결과 카드 |
| S8 | 결과 내리기 | `setLive({ poll: null })` → TV 패널·폰 카드 사라짐 (빙고 순위가 rm 존에 다시) |
| S9 | 백업 | `ctx.admin.backup.add('f-poll/polls.json', …)` + `('f-poll/votes.json', …)` — 두 컬렉션 전체 (03 §8) |
| S10 | 미리 준비 | 결혼식 전(pre)에도 관리자 탭이 열림 (02 §2.2 — 관리자는 페이즈 무관) → 질문을 "초안"으로 만들어 둠 (런북 D-30) |

## 3. 예시 질문 (버튼으로 초안 생성, Q-007로 교체)
1. 보기: "두 사람이 처음 만난 곳은?" / "Where did they first meet?" — (Q-004 스토리 기반 4지선다, 정답 공개는 결과 배너)
2. 하객 뽑기: "오늘의 베스트 드레서는?" / "Best dressed today?"
3. 보기: "신혼여행지는 어디일까요?" / "Guess the honeymoon spot!" — 보기 4개

## 4. 데이터
```js
polls/{pid}   = { q:{ko,en}, kind:'choice'|'guest', options:[{ko,en}…≤8] (guest면 []), open, order, result?, createdAt, updatedAt }
  result(choice) = { total, counts:[n…], top:[i…] }      result(guest) = { total, counts:{ gid:n }, top:[gid…] (동점 전부) }
votes/{pid}_{gid} = { pid, gid, choice: 정수 | 하객id, updatedAt: ts() }
```
- pid = `'p' + Date.now().toString(36)` (규칙 형식 `p[a-z0-9]{1,12}`).
- 구독: TV·관리자 = `col('votes').where('pid','==',pid).watch` (열린/발표 중 투표 1개) · 폰 = `doc('polls/'+pid).watch` (live.poll이 가리키는 것만) · 모두 `live` 이벤트로 pid 앎.
- 내 투표: `doc('votes/'+pid+'_'+gid).set(...)` → 성공 후 `emit('vote:cast', { pid, gid, choice })`, 버튼 2초 잠금.
- 하객 뽑기 목록: `col('guests').get()` 5분 캐시(숨김 제외, 나 자신 제외).

## 5. 문구
| 키 | KO | EN |
|---|---|---|
| poll_card_title | 🗳 지금 투표 중 | 🗳 Live poll |
| poll_voted | 투표 완료! 결과는 TV에서 🎉 | Voted! Watch the big screen 🎉 |
| poll_change | 다른 걸로 바꾸기 | Change my vote |
| poll_closed | 투표가 끝났어요 | This poll has closed |
| poll_result | 🏆 결과 | 🏆 Result |
| poll_result_banner | 🗳 결과: {top}! | 🗳 And the winner is… {top}! |
| poll_total | {n}명 참여 | {n} votes |
| poll_search | 이름 검색 | Search names |
| poll_action | 🗳 투표 | 🗳 Poll |
| poll_tab | 🗳 투표 | 🗳 Polls |
| poll_new | ＋ 새 투표 | ＋ New poll |
| poll_kind_choice | 보기 선택 | Multiple choice |
| poll_kind_guest | 하객 뽑기 | Pick a guest |
| poll_q | 질문 | Question |
| poll_opt | 보기 {n} | Option {n} |
| poll_open | ▶ 열기 | ▶ Open |
| poll_close | ■ 닫고 결과 발표 | ■ Close & reveal |
| poll_hide | 결과 내리기 | Hide result |
| poll_draft | 초안 | Draft |
| poll_live | 진행 중 | Live |
| poll_done | 종료 | Closed |
| poll_samples | 예시 질문 3개 넣기 | Add 3 sample polls |
| poll_delete_confirm | 투표와 표를 모두 지울까요? | Delete this poll and its votes? |
| poll_wait | 잠깐만요… | One moment… |

## 6. 엣지 케이스
- 2초 안 재투표 → 규칙 거부 → UI가 2초 잠금으로 예방.
- 투표 중 닫힘 → 거부 → `poll_closed` 표시 + 결과 대기.
- 동점 → top에 전부, 배너 "{A}, {B}!".
- 오프라인 투표 → Firestore 대기열 → 닫힌 뒤 도착하면 거부(무시). UI "보내는 중".
- 관리자 2명이 동시에 열기 → 마지막 것이 열림, 이전 것 닫힘 처리.
- 투표 삭제 → 관리자가 votes(pid) 쿼리 후 배치 삭제 → poll 삭제.

## 7. 수용 기준 → `tests/features/poll.mjs`
| # | 기준 |
|---|---|
| A1 | 04 §4.1 S1–S9 |
| A2 | 관리자 열기 → 폰 카드 등장(1초 안) → 투표 → TV 막대 +1 |
| A3 | 바꾸기: 2초 뒤 다른 보기 → TV에서 이전 -1, 새 +1 · 2초 안은 잠금 |
| A4 | 닫고 발표 → result 저장, TV 배너·패널 결과, 폰 결과 카드, `poll:result` |
| A5 | 하객 뽑기: 목록 검색, 나 제외, 동점 처리 |
| A6 | 스키마 거울: 닫힌 투표·범위 밖 choice·없는 하객·남의 gid 문서 → 거부 |
| A7 | 결과 내리기 → 카드·패널 사라짐, 빙고 순위가 rm에 (빙고 켜져 있을 때) |
| A8 | 레이아웃: phoneSE 카드(보기 8개), TV rm 패널(보기 8개 막대) 겹침 0 |
| A9 | 간편 모드에서도 카드 보임, 버튼 ≥ 56px |
| A10 | 관리자 ZIP 백업에 `f-poll/polls.json`·`f-poll/votes.json` — 투표 2개·표 5개 데모 데이터와 개수 일치 |
| A11 | `?phase=pre` 관리자: 투표 탭에서 초안 만들기·수정 가능 · 같은 때 하객 페이지에는 카드 없음 |

## 8. 수동 QA
리허설 1에서 10명이 동시에 투표 → TV 막대가 2초 안에 반영되는지 · 관리자 폰에서 열기/닫기 조작 편한지.

## 9. 롤백
끄면 카드·패널 사라짐. polls/votes 데이터는 남음(백업 `f-poll/`).

## 10. 구현 기록 (2026-10-08, `wp/10-poll`)
- 파일: `features/poll/` — `index.js`(페이지별 연결) · `shared.js`(집계 `tally` · 결과 줄 · app/live.poll 따라가기) · `vote.js`(하객 투표 화면 — 허브 카드·마을 시트 공용) · `guest.js` · `village.js`(TV 패널 · 폰 액션) · `admin.js` · `i18n.js` · `style.css`.
- 구독(03 §7): 폰·TV = `app/live`(코어) + `polls/{live.poll}` 문서 1개 · TV·관리자 = **열린** 투표의 `votes where pid==` 1개(발표된 결과는 투표 문서 안에 있어 표 구독 없음) · 관리자 = `polls` 컬렉션 1개. 하객 뽑기 목록 = `guests` 1회 읽기(5분 캐시).
- 발표 배너는 "결과 없이 본 투표에 결과가 생긴 순간"에만 (발표 뒤에 켠 TV는 배너를 다시 띄우지 않음).
- 다시 열기(종료된 투표 ▶ 열기) = 결과를 지우고 이어서 받음(이전 표 유지).
- 관리자 문구도 `ctx.t` (Q-018: 관리자는 한국어 전용인지 미정 — 기기 언어를 따름). 저장되는 질문·보기·예시 질문은 항상 한·영 둘 다.
- 문서 표 밖 문구: `poll_my` 내 선택 · `poll_lock` · `poll_fail` · `poll_none_found` · `poll_loading` · `poll_no_votes` · `poll_votes` · `poll_q_ko/en` · `poll_opt_en` · `poll_kind` · `poll_add_opt` · `poll_del_opt` · `poll_save` · `poll_cancel` · `poll_edit` · `poll_delete` · `poll_need` · `poll_saved` · `poll_fail_admin` · `poll_empty` · `poll_live_idle/open/shown` · `poll_next` · `poll_no_next` · `poll_showing` · `poll_top` · `poll_guest_hint` · 예시 질문 `poll_s1_*`·`poll_s2_q`·`poll_s3_*` (보기 초안: 학교·교회·회사·친구 소개 / 유럽·하와이·일본·몰디브 — Q-007로 교체).
- 시험: `tests/features/poll.mjs` (86 체크, `slow`).


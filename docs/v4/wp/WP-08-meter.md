# WP-08 · 🌡 마음 온도계 (`meter`)

| 항목 | 값 |
|---|---|
| 브랜치 | `wp/08-meter` · 선행: WP-00c · 마감 M2 |
| 매니페스트 | pages `village admin` · phases `live` · simple ✓ · liveSafe ✗ (admin = ⚙️ 설정 섹션만) |
| 허락된 파일 | `public/js/features/meter/**` · `tests/features/meter.mjs` · `docs/guide/meter.md` · 매니페스트 줄 · STATUS/CHANGELOG |
| 데이터 | 읽기만 (TV만): `bingo`·`votes` 컬렉션(합계용), 코어 `getPulseCounts()` 부팅 1회 · 설정 `cfg.meter` |
| 의존 | 없음. 빙고·투표 점수는 **버스 이벤트가 아니라 컬렉션**에서 셈 (폰에서 난 일은 TV 버스에 오지 않음 — 02 §5) |

## 1. 목적
하객들의 축하 행동이 모일수록 TV의 **마음 온도계**가 올라간다. 36.5℃(체온)에서 시작해 100℃에서 "끓어 넘침" 축하.
하객이 리모컨·스냅·빙고·투표에 참여할 동기를 준다.

## 2. 점수와 온도
```
score = 10 × (마을에 있는 하객 수)          // village:guests
      +  5 × (TV에 보이는 스냅 수)           // village:snaps
      +  1 × (리모컨 반응 수)               // 부팅 시 getPulseCounts() 합계 + 이후 village:emote 마다 +1
      +  3 × (빙고 줄 수 합계)               // bingo 컬렉션 lines 합 (watch)
      +  2 × (투표 수)                      // votes 컬렉션 문서 수 (watch)
target = cfg.meter.target ?? (10·E + 5·2E + 1·6E + 3·0.6E + 2·3E),  E = cfg.meter.expected ?? 50   // E=50 → 1,690
pct  = min(1, score / target)
temp = 36.5 + pct × 63.5     // 표시: 소수 1자리, 100% = 100.0℃
```
이정표: 50℃ · 70℃ · 85℃ · 100℃. 부팅 때 이미 넘은 이정표는 축하하지 않음(새로고침 폭죽 방지).

## 3. 화면 (TV, HUD `tr` 존 — QR 아래)
- 세로 픽셀 온도계(캔버스, 월드 12×56px 비율): 유리관 외곽 `#2b2033`, 눈금 4개, 수은 `#e8463c`→100%면 `#ff8f6b` 깜빡임(초당 1회).
- 아래 숫자 `72.3℃` (EN `72.3°C`), 위 제목 `마음 온도`.
- 온도가 오를 때 0.6초 동안 부드럽게 증가(steps 애니메이션), 숫자도 따라감.
- 이정표: high 배너 + 온도계 위치에서 하트 8개(`fx.heart`, 오버레이 좌표 → 월드 변환은 HUD 기준이라 생략하고 화면 오른쪽 위 월드 좌표 [440, 70] 근처) + `emit('meter:milestone', { temp, pct })` (`temp` = 50·70·85·100).
  100℃: + 불꽃 8 (조용 모드면 코어가 막음).
- 폰: 표시 안 함 (폰은 하객 일부만 구독하므로 숫자가 TV와 달라짐) → 폰 마을에서는 setup 즉시 return (구독 0).
- 관리자: ⚙️ 설정 섹션(`ctx.admin.settings.add`)만 — 예상 하객 수 `cfg.meter.expected`(숫자, 기본 50) · 목표 점수 `cfg.meter.target`(비우면 자동) ·
  아래에 "지금 목표 = {n}점" 계산 결과. 관리자 페이지에서는 구독·그리기 없음.

## 4. 문구
| 키 | KO | EN |
|---|---|---|
| meter_title | 마음 온도 | Love-o-meter |
| meter_value | {t}℃ | {t}°C |
| meter_milestone | 🌡 마음 온도 {t}℃ 돌파! | 🌡 Love-o-meter hit {t}°C! |
| meter_boil | 🔥 마음 온도 100℃! 사랑이 끓어 넘쳐요 | 🔥 100°C! Love is boiling over! |
| meter_cfg_expected | 예상 하객 수 (온도계 목표 계산) | Expected guests (sets the goal) |
| meter_cfg_target | 목표 점수 직접 지정 (비우면 자동) | Custom goal score (blank = auto) |
| meter_cfg_now | 지금 목표 = {n}점 | Current goal = {n} points |

## 5. 엣지 케이스
- 하객 삭제·숨김 → 점수 내려감 → 온도 내려감(애니메이션), 이정표는 다시 축하하지 않음(세션 기억).
- votes/bingo 기능이 꺼져 있어도 컬렉션은 읽힘(데이터 0이면 0점) — 문제없음.
- 조용 모드: 숫자는 계속 오르되 배너·불꽃은 코어가 보류.

## 6. 수용 기준 → `tests/features/meter.mjs`
| # | 기준 |
|---|---|
| A1 | 04 §4.1 S1–S9 (폰 마을에서 흔적 0) |
| A2 | 점수 공식: 하객 10 + 스냅 4 + 빙고 줄 2 + 투표 3 + 이모트 7 → score = 100+20+6+6+7 = 139 → 온도 표시 일치 |
| A3 | `cfg.meter.expected=2` → 작은 목표로 이정표 50/70/85/100 순서대로 1번씩 (배너 문구 · `meter:milestone`의 `temp` 50→70→85→100) |
| A4 | 새로고침 → 이미 넘은 이정표 재축하 없음 |
| A5 | 레이아웃: QR 아래, QR 숨김(Q)이면 위로 붙음, 투표 패널(rm)과 겹침 0 |
| A6 | perf: 변화 < 3% (매 프레임 그리지 않고 값이 바뀔 때만 캔버스 갱신) |
| A7 | 관리자 ⚙️ 설정 섹션: expected·target 저장 → `cfg.meter` · 열린 TV의 목표가 새로고침 없이 바뀜 · "지금 목표" 숫자 = 공식 |
| A8 | 다른 탭(폰)에서 빙고 1줄·투표 1표 → TV 점수 +3·+2 (버스가 아니라 컬렉션으로 반영) |

## 7. 수동 QA
TV 1080p에서 멀리서(5m) 숫자가 읽히는지. 리허설에서 목표값이 하객 수에 맞는지(너무 빨리/늦게 100℃가 되지 않게).

## 8. 롤백
끄면 온도계 사라짐. 데이터 없음.

## 9. 구현 기록 (2026-10-08, `wp/08-meter`)
- 파일: `features/meter/` — `index.js`(TV · 관리자 ⚙️) · `shared.js`(목표·점수·온도 순수 함수 — 시험이 직접 부름) · `i18n.js` · `style.css`.
- 온도계 캔버스는 24×112(월드 12×56의 2배)로 **값이 바뀔 때만** 다시 그림 (0.6초 동안 0.1초 간격 6단계 · 100%면 1초마다 수은 깜빡임). 프레임 훅 없음.
- 부팅 판정: 리모컨 합계(`getPulseCounts`) · `bingo` · `votes` 첫 값이 다 오면(늦어도 10초) 그 전까지 넘은 이정표는 조용히 기억만.
- 패널은 `tr` 존 안에서 오른쪽 정렬(내용 폭) — 마을 TV 구조물(WP-20)을 가리지 않게.
- 문서 표 밖 문구: `meter_cfg_save` · `meter_cfg_saved` · `meter_cfg_fail` · `meter_cfg_formula`(점수 공식 한 줄).
- 시험: `tests/features/meter.mjs` (40 체크, `slow`).


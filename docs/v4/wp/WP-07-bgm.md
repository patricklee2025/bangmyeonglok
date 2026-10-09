# WP-07 · 🎵 8비트 BGM + 효과음 (`bgm`)

| 항목 | 값 |
|---|---|
| 브랜치 | `wp/07-bgm` · 선행: WP-00c (WP-05 있으면 큐별 곡 전환) · 마감 M2 |
| 매니페스트 | pages `village admin` · phases 전부 · simple ✓ · liveSafe ✗ · **default false** |
| 허락된 파일 | `public/js/features/bgm/**` · `tests/features/bgm.mjs` · `docs/guide/bgm.md` · 매니페스트 줄 · STATUS/CHANGELOG |
| 데이터 | `cfg.bgm` 만 |
| 결정 필요 | Q-011 (사용 여부·곡) — 기본은 **꺼짐** |

## 1. 목적
TV 마을에 게임 같은 8비트 배경음악과 효과음을 더한다. 식장 음향과 겹치지 않도록 **기본 꺼짐**, 켜도 작게.
음원 파일 없이 WebAudio로 합성하고, 곡은 **공개 저작물 편곡 + 자작 루프**만.

## 2. 소리 엔진 (`features/bgm/synth.js`)
- 채널 4개(NES 느낌): `p1`·`p2` 사각파(duty 0.125/0.25/0.5), `tri` 삼각파(베이스), `noise` 노이즈(타악).
- 스케줄러: 25ms 타이머 + 0.1초 앞 예약 (탭이 백그라운드여도 끊기지 않게). 루프 곡은 끝에서 처음으로 이음매 없이.
- 음량: 마스터 = `cfg.bgm.volume`(0–1, 기본 0.35) × 음악 상한 0.08 / 효과음 상한 0.06. 조용 모드·꺼짐이면 0.4초 페이드아웃 후 정지.
- `ctx.v.audio()`가 null이면(사용자 클릭 전) 대기 → `ctx.v.onGesture`에서 시작.
- TV(`ctx.v.HOST`)에서만 소리. 폰은 아무것도 안 함(setup 즉시 return).

## 3. 곡 데이터 (`features/bgm/songs.js`) — MML 비슷한 텍스트
```js
export const SONGS = [
  { id: 'morning',  title: { ko: '마을의 아침', en: 'Village Morning' }, bpm: 104, loop: true,  src: 'original',
    p1: 'o5 l8 e g a g e4 d4 | …', p2: '…', tri: 'o3 l4 c g c g | …', noise: 'l8 x . x . x . x x | …' },
  { id: 'bridal',   title: { ko: '결혼 행진(바그너)', en: 'Bridal Chorus (Wagner)' }, bpm: 76, loop: false, src: 'Wagner, Lohengrin (1850) — public domain', … },
  { id: 'march',    title: { ko: '결혼 행진곡(멘델스존)', en: 'Wedding March (Mendelssohn)' }, … },
  { id: 'danube',   title: { ko: '아름답고 푸른 도나우', en: 'Blue Danube (Strauss II)' }, … },
  { id: 'canon',    title: { ko: '캐논(파헬벨)', en: 'Canon (Pachelbel)' }, … },
  { id: 'festival', title: { ko: '잔치 날', en: 'Festival' }, … , src: 'original' },
  { id: 'lanterns', title: { ko: '청사초롱 밤', en: 'Lantern Night' }, … , src: 'original' },
];
```
문법(파서 `mml.js`): `o4`(옥타브) `l8`(기본 길이) `c d e f g a b` `+`/`-`(반음) `4 8 16 .`(길이·점) `r`/`.`(쉼표) `<`/`>`(옥타브 이동) `x`(노이즈 타) `|`(마디 표시, 무시).
편곡 분량: 공개 저작물 곡은 **유명한 첫 주제 8–16마디**만(짧게, 루프 아님 또는 루프). 자작 곡은 16–32마디 루프.

## 4. 재생 규칙 (TV)
| 상황 | 곡 |
|---|---|
| pre | morning |
| live (기본) | festival · 밤(코어 night)이면 lanterns |
| `live:cue` bride | bridal 1번 → 끝나면 기본 |
| `live:cue` march | march 1번 |
| `live:cue` firstdance | danube (장면 동안 반복) |
| `live:cue` dinner | canon (반복) |
| after / anniversary | morning |
| 조용 모드 | 정지 (해제되면 기본 곡) |

관리자 설정 "지금 곡 고정"(`cfg.bgm.pin`)이 있으면 위 규칙보다 우선.

## 5. 효과음 (`cfg.bgm.sfx`, 기본 false)
| 이벤트 | 소리 | 제한 |
|---|---|---|
| `village:arrived` | 짧은 3음 징글 | 2초에 1번 |
| `village:emote` | 블립 | 0.5초에 1번 |
| `village:level` (celebrate) | 팡파르 (코어 차임과 겹치면 차임이 이미 울리므로 생략) | – |
| `bingo:line` (TV의 bingo 기능이 컬렉션에서 새 줄을 감지해 냄 — WP-09 S8) | 짧은 팡파르 | – |
| `poll:result` | 북소리 + 화음 | – |
| `meter:milestone` | 화음 | – |
| `village:event` start(부케·단체사진) | 북 굴리기 1초 | – |

## 6. 조작
- 관리자 ⚙️ 설정 섹션: 음악 켜기(`cfg.bgm.music`, 기본 false) · 효과음 켜기 · 볼륨 슬라이더 · 곡 고정(자동/곡 목록) · [▶ 미리 듣기](관리자 페이지에서 그 곡 10초 — 이 기능은 admin 페이지에서도 합성 엔진 사용) · 지금 TV 상태(`bgm:state`는 TV 기기 안에서만 알 수 있으므로 관리자에는 "설정값"만 표시)
- TV 키 `u`: 이 TV에서만 음악 켜기/끄기 (설정과 무관한 로컬 토글, 새로고침하면 설정값으로)
- `emit('bgm:state', { track, playing, volume })` 변할 때마다

## 7. 문구
| 키 | KO | EN |
|---|---|---|
| bgm_music | 🎵 배경음악 | 🎵 Background music |
| bgm_sfx | 🔔 효과음 | 🔔 Sound effects |
| bgm_volume | 볼륨 | Volume |
| bgm_pin | 곡 고정 | Pin a song |
| bgm_auto | 자동 (식순·시간에 따라) | Auto (follows the program) |
| bgm_preview | ▶ 미리 듣기 | ▶ Preview |
| bgm_stop | ■ 정지 | ■ Stop |
| bgm_note | 식장 음향과 겹칠 수 있어요. 리허설에서 음량을 꼭 확인하세요 | May clash with the venue's sound — check the volume at rehearsal |
| bgm_key | U: 이 화면 음악 켜기/끄기 | U: toggle music on this screen |
| bgm_unlock | 🎵 음악을 켜려면 화면을 한 번 클릭해주세요 | 🎵 Click the screen once to start the music |

## 8. 수용 기준 → `tests/features/bgm.mjs`
| # | 기준 |
|---|---|
| A1 | 04 §4.1 S1–S9 |
| A2 | 기본(꺼짐): 이 기능이 만든 AudioNode 0 (synth 생성 카운터) |
| A3 | `cfg.bgm.music=true` + 클릭 → `bgm:state.playing` · 페이즈별 곡 id (pre=morning, live=festival) |
| A4 | `live:cue` bride → bridal, 끝나면 festival (테스트는 bpm 가속 옵션 `cfg.bgm.testSpeed`, 데모 전용) |
| A5 | 조용 모드 → 1초 안에 playing false, 해제 → 다시 재생 |
| A6 | 효과음: 도착 5명 동시 → 징글 1번(2초 제한) |
| A7 | MML 파서 단위: 각 곡 채널 길이 합이 같은 마디 수 · 잘못된 토큰 → 무시하고 계속 |
| A8 | `u` 키 토글 · 폰 마을에서는 setup 즉시 종료(노드 0) |
| A9 | perf: 음악 재생 중 TV fps 하락 < 5% |

## 9. 수동 QA
TV 노트북 스피커/HDMI 음향으로 7곡 듣기 (Patrick·선경이 "그 곡처럼 들리는지" 확인) · 리허설 2에서 식장 음향과 함께 음량.

## 10. 롤백
끄면 즉시 정지. 기본 꺼짐이므로 대부분 영향 없음.

## 11. 구현 기록 (2026-10-08, `wp/07-bgm`)
- 파일: `features/bgm/` — `mml.js`(파서: 모르는 글자는 건너뜀, `o99` 무시) · `synth.js`(채널마다 오실레이터 1개 + 게인 1개를 곡 동안 유지하고 음표는 게인·주파수 자동화로 — 음표마다 노드를 만들지 않음 · 펄스파 duty는 PeriodicWave · 노이즈는 고정 시드 버퍼 · `stats.nodes`/`stats.sfx` 카운터) · `songs.js` · `index.js` · `i18n.js` · `style.css`.
- 곡: 바그너(8마디, C장조) · 멘델스존(유명한 시작 팡파르 + 8비트 행진 — 원곡 주제 전체가 아님) · 도나우(24마디, 메아리는 p2) · 캐논(베이스 오스티나토 + p2가 한 바퀴 늦게 따라가는 돌림) · 자작 3곡(16마디 루프). 원곡처럼 들리는지는 수동 QA(Q-011).
- 조용 모드는 곡 고정보다도 우선. 기본 식순(WP-05)에서 신부 입장은 조용 큐라 바그너가 나오지 않음 → 가이드에 "그 큐의 조용 모드를 끄면 됨" 안내.
- `village:level` 팡파르는 생략 — 레벨 업 때 코어 차임이 이미 울림.
- `cfg.bgm.testSpeed`(데모 전용, 최대 ×64)로 시험에서 곡 길이를 줄임.
- 문서 표 밖 문구: `bgm_saved` · `bgm_fail` · 곡 이름 `bgm_t_*`(관리자 선택 목록 — songs.js의 title과 같음, 시험으로 확인).
- 시험: `tests/features/bgm.mjs` (93 체크, `slow`).


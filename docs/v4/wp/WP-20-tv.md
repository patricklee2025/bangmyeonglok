# WP-20 · 📺 마을 TV (`tv`)

| 항목 | 값 |
|---|---|
| 브랜치 | `wp/19-20-wall-tv` (WP-19와 함께, 코어 준비 포함) · 선행: WP-00c |
| 매니페스트 | pages `village admin` · phases `live` · simple ✓ · liveSafe ✓ · status `ready` (기본 켜짐 — Patrick 2026-10-07) |
| 허락된 파일 | `public/js/features/tv/**` · `tests/features/tv.mjs` · `docs/guide/tv.md` · 매니페스트 줄 · STATUS/CHANGELOG |
| 코어 접점 (설계자가 만든 것) | `ctx.v.anchor` (월드 위 DOM 상자) · `core/ui.js` `youtubeSource` · `youtubeFrame` · `youtubeCommand` · 허용 주소 `www.youtube-nocookie.com` (03 §6) |
| 데이터 | `app/settings.cfg.tv = { url, autoplay, phone }` — 새 컬렉션·리스너 없음 (설정 문서는 이미 구독 중) |
| 결정 | Patrick 2026-10-07: "관리자가 넣은 유튜브 주소" (라이브 방송이든 미리 만든 영상이든) |

## 1. 목적
결혼식 당일 마을 안에 TV 한 대를 세워 유튜브 영상(생중계 또는 준비한 영상)을 마을 속에서 보는 느낌을 준다.
더블클릭(폰은 두 번 탭)하면 전체화면.

## 2. 위치와 모양
- 호수 위 오른쪽 위, 월드 좌표 화면 `x 350 · y 34 · 76×43` (16:9). QR 패널·선착장·산책로와 겹치지 않음. 기둥 2개가 물에 박힌 검은 틀 + 위쪽 "ON AIR" 깜빡이 등.
- 틀은 월드 캔버스에 `addProp`(y-정렬), 영상은 `ctx.v.anchor`로 화면 자리에 붙인 DOM(유튜브 iframe). 이름표·말풍선은 그 위에 그려짐.

## 3. 시나리오
| # | 기기 | 흐름 |
|---|---|---|
| S1 | 관리자 ⚙️ 설정 → 마을 TV 줄 | 주소 입력 → 바로 판독("✓ 유튜브 영상 (id)" / "✓ 채널의 라이브 방송" / "알아볼 수 없어요") · [💾 저장] · [▶ 미리보기] · 체크 2개: 식장 TV 바로 재생(기본 켬) · 하객 폰에도 보이기(기본 켬) |
| S2 | 식장 TV (HOST) | live 페이즈 + 주소 있음 → TV가 나타나 **소리 끈 채로 자동 재생** (자동 재생 끔이면 "▶ 클릭해서 재생" 포스터) |
| S3 | 한 번 클릭/탭 | 소리 켜기 ↔ 끄기 (왼쪽 아래 배지 "🔇 누르면 소리" / "🔊 소리 켜짐") — 0.36초 기다려 두 번째 누름이 없을 때 |
| S4 | 두 번 클릭/탭 (0.35초 안) | 전체화면 ↔ 원래대로. 아이폰(요소 전체화면 없음)은 유리막을 걷고 "영상 오른쪽 아래 ⛶ 버튼으로…" 안내 |
| S5 | 조용 모드 켜짐 (TV) | 소리를 끔 (다시 켜는 건 사람이 클릭) |
| S6 | 하객 폰 마을 | "▶ 눌러서 보기" 포스터 → 누르면 재생(데이터 절약) · 하단 바 `📺 TV`(order 35) → 카메라가 TV로 12초 |
| S7 | 주소 변경 · 지움 · 기능 끔 | 새로고침 없이 바뀜 / TV 사라짐 / 흔적 0 (전체화면이면 빠져나옴) |
| S8 | live가 아닌 페이즈 | 마을에 없음 (관리자 설정은 언제든 미리 가능) |
| S9 | 주소가 아직 없음 (live) | TV 틀은 서 있고 화면에 "📺 곧 방송이 시작돼요" (재생기 없음 · 📺 액션 없음) — Patrick 2026-10-07 "화면을 보이게" |

받는 주소: `youtu.be/<id>` · `youtube.com/watch?v=<id>` · `/live/<id>` · `/shorts/<id>` · `/embed/<id>` · 11자 id · 채널 id `UC…`(24자) · `youtube.com/channel/<UC…>`(그 채널의 지금 라이브).
`@핸들` 주소는 id를 알 수 없어 받지 않음 → 라이브 방송 페이지의 `youtube.com/live/<id>` 주소를 쓰세요.

## 4. 문구 (KO / EN) — `features/tv/i18n.js`
| 키 | KO | EN |
|---|---|---|
| tv_poster / tv_poster_host | ▶ 눌러서 보기 / ▶ 클릭해서 재생 | ▶ Tap to watch / ▶ Click to play |
| tv_sound_off / tv_sound_on | 🔇 누르면 소리 / 🔊 소리 켜짐 | 🔇 Tap for sound / 🔊 Sound on |
| tv_fs_hint | 영상 오른쪽 아래 ⛶ 버튼으로 크게 볼 수 있어요 | Use the ⛶ button at the bottom right of the video to go full screen |
| tv_action · tv_live | TV · LIVE | TV · LIVE |
| tv_soon | 곧 방송이 시작돼요 | Coming up soon |
| tv_admin_* | 관리자 설정 문구 (i18n.js 그대로) | |

## 5. 수용 기준
| # | 기준 |
|---|---|
| A1 | 주소 판독: 6가지 모양 → 같은 영상 id · 채널 2가지 · 엉뚱한 주소/다른 사이트는 null · 관리자 판독 문구 |
| A2 | 저장하면 TV 마을에 새로고침 없이 나타남 · iframe 주소는 youtube-nocookie `embed/<id>` (`autoplay=1&mute=1&playsinline=1`) · 채널은 `embed/live_stream?channel=` |
| A3 | 한 번 클릭 → `unMute` 명령 + 배지 · 다시 → `mute` |
| A4 | 두 번 클릭 → 전체화면 요소 = TV 상자 · 다시 두 번 → 해제 |
| A5 | 조용 모드 켜면 `mute` |
| A6 | 폰: 포스터 → 탭하면 재생 · 📺 버튼 → 카메라 이동 · `phone: false`면 폰에 없음 · `autoplay: false`면 TV도 포스터 |
| A7 | 주소 지우기·기능 끄기 → 흔적 0 · TV 클릭/더블클릭은 마을 탭·드래그가 아님 |
| A8 | live 밖 페이즈에는 없음 · 50명 마을 fps ≥ 기준 |

## 6. 시험
`tests/features/tv.mjs` — 유튜브는 시험에서 가짜 페이지로 바꿔치기(`context.route`)하고 iframe 안에서 받은 명령을 읽습니다.
실제 유튜브 재생(자동 재생 정책 · 라이브 · 소리)은 수동 QA: 식장 노트북 Chrome · 아이폰 Safari · 안드로이드 Chrome · 카카오톡 인앱.

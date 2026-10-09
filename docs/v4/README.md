# v4 개발 문서 — 픽셀 마을 웨딩 방명록

v3.2(지금 앱, QA 완료)에 **18개 기능**을 더하는 설계입니다. 코드는 Claude Code(Sonnet)가 **작업 패키지(WP) 단위**로 씁니다.
각 WP는 혼자 읽고 끝낼 수 있게 쓰여 있고, 공통 약속은 아래 문서에 한 번만 적혀 있습니다.

## 읽는 순서

| 누가 | 순서 |
|---|---|
| **Sonnet (WP 작업자)** | 루트 `CLAUDE.md` → 이 README → `01-architecture` → `02-contracts` → 자기 WP 파일 → WP가 가리키는 03/04/05 절 |
| **Patrick (리뷰·QA)** | 이 README → `01-architecture` §1·§5·§7 → `06-runbook` → `QUESTIONS.md` → WP별 "수용 기준·수동 QA" |
| **선경 / 도우미** | `06-runbook` → `docs/guide/*.md` |

## 문서

| 파일 | 내용 |
|---|---|
| [01-architecture.md](01-architecture.md) | 원칙, 구조, 부팅 순서, 페이즈, 안전장치, 일정, 주요 결정 |
| [02-contracts.md](02-contracts.md) | **기능이 쓰는 모든 API** (매니페스트, ctx, 버스, guest/village/admin API, docdb, 금지 목록) |
| [03-data-and-rules.md](03-data-and-rules.md) | 컬렉션·필드, **firestore.rules v4 전문**, 허용/거부 매트릭스, 할당량 예산, 백업 |
| [04-testing.md](04-testing.md) | 테스트 명령, 코어/기능 스위트, 필수 체크 S1–S9, 규칙 테스트, 리허설 |
| [05-ux-and-art.md](05-ux-and-art.md) | 화면 존·순서, 문구 말투·용어집, 픽셀 아트, 성능, 소리, 접근성 |
| [06-runbook.md](06-runbook.md) | 결혼식 당일 역할·체크리스트·비상 절차 |
| [PROMPTS.md](PROMPTS.md) | Patrick이 Claude Code에 붙여넣는 프롬프트 (WP 실행·리뷰·버그 수정) |
| [STATUS.md](STATUS.md) | WP 진행표 (각 WP가 마지막에 자기 줄 갱신) |
| [QUESTIONS.md](QUESTIONS.md) | Patrick이 결정할 것 / Sonnet이 막혔을 때 남기는 질문 |
| [CHANGELOG.md](CHANGELOG.md) | v4 변경 기록 |
| `wp/` | 작업 패키지 20개 |

## 작업 패키지

| WP | 기능 | 언제 | 문서 |
|---|---|---|---|
| WP-00a | 개발 구조 + 테스트 하네스 | ✅ 완료 | (커밋 c818fa3) |
| WP-00b | 코어 모듈 · 매니페스트 · 스키마 · 규칙 v4 | M1 | [wp/WP-00b-core.md](wp/WP-00b-core.md) |
| WP-00c | 페이지 확장 지점 (guest/village/admin) | M1 | [wp/WP-00c-extension-points.md](wp/WP-00c-extension-points.md) |
| WP-01 | 🎟 사전 입주 · 체크인 · 입장권 | M1 (12/1 오픈) | [wp/WP-01-prereg.md](wp/WP-01-prereg.md) |
| WP-02 | 👰 커플 캐릭터 정밀 제작 | M1 | [wp/WP-02-couple.md](wp/WP-02-couple.md) |
| WP-03 | ⏳ D-day 마을 | M1 | [wp/WP-03-dday.md](wp/WP-03-dday.md) |
| WP-04 | 🪧 커플 스토리 표지판 | M1 | [wp/WP-04-story.md](wp/WP-04-story.md) |
| WP-05 | 📋 식순 연동 라이브 모드 | M2 | [wp/WP-05-live.md](wp/WP-05-live.md) |
| WP-06 | 🌐 덕담 자동 번역 | M2 | [wp/WP-06-translate.md](wp/WP-06-translate.md) |
| WP-07 | 🎵 8비트 BGM + 효과음 | M2 | [wp/WP-07-bgm.md](wp/WP-07-bgm.md) |
| WP-08 | 🌡 마음 온도계 | M2 | [wp/WP-08-meter.md](wp/WP-08-meter.md) |
| WP-09 | 🎯 양가 섞이기 빙고 | M2 | [wp/WP-09-bingo.md](wp/WP-09-bingo.md) |
| WP-10 | 🗳 실시간 투표 | M2 | [wp/WP-10-poll.md](wp/WP-10-poll.md) |
| WP-11 | 🃏 내 픽셀 카드 | M2 | [wp/WP-11-card.md](wp/WP-11-card.md) |
| WP-12 | 📸 픽셀 네컷 | M2 | [wp/WP-12-fourcut.md](wp/WP-12-fourcut.md) |
| WP-13 | 📶 오프라인 대비 (서비스워커) | M2 | [wp/WP-13-offline.md](wp/WP-13-offline.md) |
| WP-14 | 🗄 추억 마을 아카이브 | 결혼식 후 | [wp/WP-14-archive.md](wp/WP-14-archive.md) |
| WP-15 | 💌 하객별 감사 카드 | 결혼식 후 | [wp/WP-15-thanks.md](wp/WP-15-thanks.md) |
| WP-16 | 📚 포토북 PDF | 결혼식 후 | [wp/WP-16-photobook.md](wp/WP-16-photobook.md) |
| WP-17 | ✉️ 신혼여행 엽서 | 결혼식 후 | [wp/WP-17-postcard.md](wp/WP-17-postcard.md) |
| WP-18 | 🎂 1주년 재개장 | ~2028-03 | [wp/WP-18-anniversary.md](wp/WP-18-anniversary.md) |
| WP-19 | 💌 방명록 모아보기 (+ 코어 "신랑·신부에게만") — 2026-10 추가 | M1 | [wp/WP-19-wall.md](wp/WP-19-wall.md) |
| WP-20 | 📺 마을 TV (유튜브) — 2026-10 추가 | M2 | [wp/WP-20-tv.md](wp/WP-20-tv.md) |

## 한 줄 요약
코어는 WP-00b/00c에서 **딱 한 번** 조심스럽게 "끼울 자리"를 만들고, 18개 기능은 전부 그 자리에 끼우는 플러그인입니다.
기능마다 원격으로 끌 수 있고, 꺼지면 v3.2와 똑같으며, 그 사실을 자동 테스트가 매번 확인합니다.

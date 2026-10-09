# PROMPTS — Claude Code(Sonnet)에 붙여넣는 프롬프트

Patrick이 그대로 복사해서 쓰는 프롬프트 모음입니다. `<NN>`·`<id>`만 바꾸세요 (WP 목록: README).

---

## 0. 처음 한 번 (준비)

내 컴퓨터 터미널에서:
```bash
cd wedding-guestbook
npm i
npx playwright install chromium     # 브라우저가 없다고 나올 때만
npm test                            # 전부 초록인지 확인 (약 6–7분)
claude                              # Claude Code 실행 → /model 에서 Sonnet 선택
```
`npm test`가 처음부터 golden-sprites만 빨간불이면: 컴퓨터마다 그림 결과가 미세하게 달라서입니다.
아바타 코드는 아무도 안 바꿨으니 `npm run golden:update` 후 커밋하고 시작하세요 (04 §5).

---

## 1. WP 실행 (기본)

```
WP-<NN> (<id>) 작업 패키지를 구현해줘.

- CLAUDE.md의 규칙을 먼저 읽고, docs/v4/wp/WP-<NN>-<id>.md 를 그대로 따라줘.
- main에서 브랜치 wp/<NN>-<id> 를 만들어서 작업해.
- 시작 전에 npm run test:quick 이 초록인지 확인하고, 아니면 아무것도 고치지 말고 보고해.
- "허락된 파일" 밖은 수정하지 마. 필요하면 docs/v4/QUESTIONS.md 에 S-질문을 남기고 나머지를 계속해.
- 수용 기준을 tests/features/<id>.mjs 의 체크로 전부 만들고, 끝나면 npm test 전체를 타임아웃 600000ms로 돌려.
- 바꾼 화면의 스크린샷(tests/.out/)을 직접 열어 확인하고, CLAUDE.md의 보고서 양식으로 마무리해줘.
```

## 2. 큰 WP를 나눠서 (00b · 00c)

WP-00b (세션 3개 — 의존 순서: settings는 docdb를 쓰므로 2단계):
```
WP-00b 의 1단계만 해줘: core/bus.js, core/phase.js, core/ui.js, i18n.js 확장(§4.8), config.js의 schedule·archive(§4.10)와 그 단위 테스트(core-units 시작).
나머지(schema·docdb·settings·규칙, features 로더·매니페스트)는 다음 세션에서 할 거야. 끝에 npm test 초록 + 커밋.
```
```
WP-00b 의 2단계: core/schema.js, core/docdb.js, core/settings.js(docdb 위에서), firestore.rules 교체(03 §4 그대로),
store.js backend 노출과 deleteMany 확장, tests/rules/run.mjs. 끝에 npm test 초록 + 커밋.
```
```
WP-00b 의 3단계: core/features.js(resolveEnabled 12단계·gate·claim·refreshTexts), features/index.js(매니페스트 §5 그대로), _selftest 최소판,
tests/lib/v4.mjs, core-features-static, core-units 마무리. 수용 기준 A1–A9 전부 확인하고 보고서.
```
WP-00c (세션 3개, 순서 지키기):
```
WP-00c 세션 ① (하객 페이지: guest.js, index.html, 스타일)만 해줘. 문서 §3 그대로.
기존 테스트를 하나도 고치지 말고 전부 초록이어야 커밋해.
```
```
WP-00c 세션 ② (관리자: admin.js, admin.html, ⚙️ 설정 탭, 라이브 패널, 백업 파트)만 해줘. 문서 §4 그대로.
```
```
WP-00c 세션 ③ (마을: village.js, village.html, HUD 존, 배너 개선, 조용 모드, 스포트라이트, 장면, 출석)과
_selftest 완성판, core-extension / core-features-matrix 스위트. 수용 기준 A1–A9 확인 후 보고서.
```

## 3. 리뷰 (새 세션 — 만든 세션과 다른 대화에서)

```
wp/<NN>-<id> 브랜치를 리뷰만 해줘 (코드 수정 금지).
1. git diff main...wp/<NN>-<id> 로 바뀐 파일이 WP 문서의 "허락된 파일" 안에만 있는지
2. CLAUDE.md 황금 규칙 12개 위반 여부 (특히 접두사, innerHTML, 외부 주소, 전역, 정리 누락, 매 프레임 할당)
3. WP 수용 기준 A1… 각각이 테스트 체크로 존재하고 의미 있게 검사하는지 (빈 체크·항상 참인 체크 찾기)
4. npm test 실행 결과
결과를 "문제 / 근거(파일:줄) / 심각도 / 고치는 방법" 표로 줘.
```

## 4. 리뷰 지적 수정

```
아래 리뷰 지적을 wp/<NN>-<id> 에서 고쳐줘. 지적마다 먼저 그 문제를 잡는 테스트 체크를 추가하고(빨간불 확인) 그다음 고쳐.
끝에 npm test 전체 초록 + 보고서.
<리뷰 표 붙여넣기>
```

## 5. 리허설에서 발견한 버그

```
리허설 버그: <증상> (기기: <iPhone Safari 등>, 화면: <어디>, 재현: <순서>)
1. 어느 기능/코어 문제인지 먼저 찾아서 알려줘 (수정 전).
2. 그 기능의 WP 허락된 파일 안에서 고칠 수 있으면: 재현 테스트 추가 → 수정 → npm test.
3. 코어 문제면 수정하지 말고 원인·제안만.
```

## 6. 동결 기간(2027-02-28 ~ 04-11) 버그 수정

```
동결 기간이야. 새 기능·리팩터링 금지, 이 버그만 최소 수정: <증상>.
재현 테스트 추가 → 수정 → npm test 전체 → 바뀐 줄 수와 위험도를 보고해줘.
```

---

## Patrick 체크리스트 — 브랜치 합치기 전
1. 보고서의 테스트 숫자 확인 + 내 컴퓨터에서 `npm test` 한 번
2. `tests/.out/<id>/` 스크린샷 훑어보기
3. WP의 "수동 QA" 표를 실제 기기로 → STATUS.md에 기록
4. `git switch main && git merge --no-ff wp/<NN>-<id>`
5. 배포: Netlify에 `public` 폴더 (WP-00b 뒤에는 규칙 게시 03 §9 — 규칙은 그때 한 번뿐)
6. 관리자 ⚙️ 설정에서 새 기능이 `beta`로 보이는지 → 필요할 때 켜기

여러 WP를 동시에(다른 폴더/세션) 진행하면 `features/index.js`·`STATUS.md`·`CHANGELOG.md`에 줄 충돌이 날 수 있어요 — 양쪽 줄을 모두 살리면 됩니다.

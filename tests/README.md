# tests/

Browser + static tests for the guestbook. No framework: `tests/run.mjs` serves `public/` on a free port and runs every
suite against real Chromium (Playwright) in **demo mode** (`?demo=1` — no Firebase needed).

```bash
npm i                     # once (Playwright only; set PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 if Chromium is already installed)
npx playwright install chromium   # once, only if `npm test` says it can't find a browser (or set CHROME_PATH)

npm run test:quick        # ~40 s  · static checks (incl. the v4 manifest), core-units, golden sprites, smoke loop, i18n, returning guest (suites tagged `slow` are skipped)
npm test                  # ~6–7 min · everything (add `-- --jobs 3` for ~3–4 min)
node tests/run.mjs core-smoke core-layout      # by name
node tests/run.mjs --grep village --verbose     # by regex, print every check
npm run golden:update     # re-record sprite baselines (only when a sprite change is intended)
```

Results: `tests/.out/results.json`; screenshots and downloads per suite in `tests/.out/<suite>/` (git-ignored).
Exit code 0 = green, 1 = a check failed, 2 = the harness itself broke.

| Folder | What |
|---|---|
| `suites/` | **core** — the v3.2 app. Must stay green forever; v4 work never edits these except to fix a selector in `lib/flows.mjs` that a WP renamed on purpose. |
| `features/` | one suite per v4 feature (`<feature-id>.mjs`); files starting with `_` are templates and never run. |
| `lib/harness.mjs` | the `h` object (pages, presets, checks, store access, banners, downloads, layout probe). Read its header. |
| `lib/flows.mjs` | reusable UI flows (sign the guestbook, open my village, send an event) — the selector contract. |
| `lib/files.mjs` | ZIP / PNG / PDF / CSV readers for downloaded files. |
| `fixtures/` | face photos for the avatar analysis. |
| `golden/` | sprite hashes + contact sheet (`npm run golden:update`). |

Full guide (how to write a feature suite, what every feature must prove): [`docs/v4/04-testing.md`](../docs/v4/04-testing.md).

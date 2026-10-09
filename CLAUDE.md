# CLAUDE.md — instructions for Claude Code (Sonnet) on this repo

Pixel-village wedding guestbook for 지환 (Patrick) ♥ 선경 (Sunkyung), wedding **2027-04-10**, Orlando, ~50 guests.
Static site in `public/` (no build step) + Firebase Firestore (Spark/free) · demo mode `?demo=1` runs everything locally.
v3.2 is finished and protected by tests. **v4 adds 18 features as plugins** — you implement them one work package (WP) at a time.

## Read first (every session, in this order)
1. This file
2. `docs/v4/README.md` → `docs/v4/01-architecture.md` → `docs/v4/02-contracts.md`
3. **Your WP file** in `docs/v4/wp/` (the prompt tells you which one)
4. The sections of `03-data-and-rules.md`, `04-testing.md`, `05-ux-and-art.md` your WP points to

The docs are in Korean with English code. Follow them literally. When the WP gives a KO/EN copy table, use those strings verbatim.

## Golden rules
1. **One WP per session.** Work on branch `wp/<NN>-<id>` (create it from `main`). Never touch another WP's feature.
2. **Stay inside the WP's "허락된 파일" (allowed files).** Anything else — core files, other features, tests in `tests/suites/` —
   is off-limits unless the WP lists it as a 코어 접점 (core touchpoint). If you need more, stop that part and write an S-question in
   `docs/v4/QUESTIONS.md` (format is in that file).
3. **Tests before and after.** Start: `npm run test:quick` must be green (if not, stop and report — don't fix unrelated things).
   End: full `npm test` green (Bash timeout 600000 ms). Never weaken, skip, or delete a test or an allowlist to get green.
4. **Feature isolation (02-contracts §1, §12):** files under `public/js/features/<id>/`; CSS selectors start with `.f-<id>-…`,
   `[data-f="<id>"]` or `html.f-<id>-…` (root class from `ctx.rootClass`); DOM ids `f-<id>-…`; i18n keys `<id>_…`; localStorage `wgb_f_<id>_…`;
   register everything through `ctx` (auto-cleanup); no globals, no imports from other feature folders, module top level does nothing but import/define.
   **Core imports are allow-listed (02 §1.1):** only `core/ui.js` (all), `core/phase.js` (`PHASES` `phaseAt` `liveWindow`), `config.js` (`CONFIG`),
   `avatar.js` (read-only constants/pure functions incl. `getSprite`, and `coupleLook` after WP-02), `scene.js` (`W` `H` `TILE` `Z` `buildGround` `buildProps`),
   `report.js` (`computeReport`). Everything else (store, guest/village/admin, bus, docdb, settings, i18n, snaps, vendor) goes through `ctx`.
   Core DOM is never edited: core text only via `ctx.texts` (keys the WP allows), hiding/moving core elements only via `ctx.rootClass` + your CSS.
5. **Off means gone.** With the flag off, the feature leaves zero DOM, listeners, timers, styles. Hot toggle must work without reload.
6. **No new dependencies.** No npm packages, no CDN/external URLs, no new files in `public/js/vendor/`. Allowed hosts: www.gstatic.com, www.w3.org (+ www.youtube-nocookie.com, only inside `core/ui.js` `youtubeFrame` — features never write a URL).
7. **Data only through `ctx.db`** with paths declared in `core/schema.js` (mirror of `firestore.rules`). Never change rules or schema
   in a feature WP. Respect the read budget in your WP (03 §7). Never add a listener per villager.
8. **Demo parity.** Everything must work in `?demo=1` with the same constraints as production.
9. **Safety of guests' data.** Photos, voices, capsules and "only for the couple" notes (`notes/`) are admin-only. Never put personal data in public docs, logs, or filenames.
   Never use `innerHTML`/`insertAdjacentHTML` with dynamic data — `textContent` only.
10. **Performance.** Per-frame hooks (`onUpdate`, `onDraw`, `decorate`, `onOverlay`) allocate nothing and stay O(villagers).
    The perf suite must not regress.
11. **Bilingual.** Every visible string in `features/<id>/i18n.js` (`const D = { ko: {…}, en: {…} }; export default D;`), both languages.
12. **Wedding-day freeze:** from 2027-02-28 to 2027-04-11 only bug fixes (no new feature code merged to `main`).

## Commands
```bash
npm i                                   # once (Playwright only)
npm run serve                           # http://127.0.0.1:8123/ (public/) — add ?demo=1
npm run test:quick                      # ~40 s
npm test                                # full (~6–7 min). Use a 600000 ms timeout
node tests/run.mjs <suite> [--verbose]  # e.g. node tests/run.mjs poll core-smoke
npm run gen:kiosk                       # after editing public/index.html (kiosk.html is generated)
```
Screenshots of every tested screen land in `tests/.out/<suite>/` — open the ones for screens you changed and look at them.
Test pages: `index.html?demo=1&phase=live&ff=<id>` · `village.html?demo=1&seed=30&ff=<id>` · `admin.html?demo=1&ff=<id>`.

## Definition of done (every WP)
- [ ] All acceptance criteria (수용 기준) in the WP map to checks in `tests/features/<id>.mjs` (name checks `A3 …`), plus S1–S9 (04 §4.1)
- [ ] `npm test` fully green; screenshots reviewed
- [ ] Manifest: your feature's `status` changed `'planned'` → `'beta'` (only your line)
- [ ] `docs/guide/<id>.md` written for the couple (Korean, short: how to turn on, how to use on the day, what happens if turned off)
- [ ] Your row in `docs/v4/STATUS.md` updated; one line in `docs/v4/CHANGELOG.md`
- [ ] Commits on your branch. Message: `feat(<id>): <summary>` / `fix(<id>): …` / `test(<id>): …` (keep Claude Code's default attribution trailer)

## Final report (paste at the end of the session)
```
WP-NN <id> — <done | partial | blocked>
Changed files: (list)
Tests: quick N/N · full N/N (suites with counts) · screenshots reviewed: (list)
Acceptance: A1 ✅ … A9 ✅ (or ❌ + why)
Copy not in the WP table (if any): key — KO / EN
Questions raised: S-0NN …
Risks / follow-ups:
```

## If something is unclear
Prefer the contract (02) over the WP, the WP over your own idea. If two documents disagree or a needed API is missing:
write an S-question in QUESTIONS.md, implement everything that does not depend on it, and report `partial`.

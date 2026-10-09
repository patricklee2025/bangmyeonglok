// ============================================================
//  Test harness — the `h` object every suite receives.
//
//  A suite is a module in tests/suites/ (core) or tests/features/ (one per v4 feature):
//
//      export const meta = { title: 'What this suite proves', timeout: 120000, tags: ['slow'] };
//      export default async (h) => {
//        const p = await h.page('phone');                    // fresh context with the "phone" preset
//        await p.goto(h.url('index.html'));                  // demo=1 is added automatically
//        h.check('welcome is visible', await p.isVisible('#s-welcome'));
//      };
//
//  Rules
//   • Never launch browsers yourself — use h.page()/h.context(); everything is closed for you.
//   • Every unexpected console error / uncaught exception on any page FAILS the suite at the end.
//     If an error is expected, whitelist it with h.allowErrors(/regex/).
//   • Prefer h.step('name', fn) around independent scenarios: a throw inside a step becomes one FAIL and
//     the suite carries on, so one broken selector doesn't hide every other result.
//   • Pages in the SAME context share localStorage/IndexedDB/BroadcastChannel (= the same "device"/demo world).
//     Different contexts are isolated devices that can NOT see each other in demo mode.
//   • Never take fullPage screenshots of a touch page before using it — it resets touch emulation.
// ============================================================
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as flows from './flows.mjs';

export const TESTS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const REPO = path.resolve(TESTS, '..');
export const PUBLIC = path.join(REPO, 'public');
export const FIXTURES = path.join(TESTS, 'fixtures');
export const GOLDEN = path.join(TESTS, 'golden');
export const OUT = path.join(TESTS, '.out');

/** Chromium to use: $CHROME_PATH, else the newest /opt/pw-browsers/chromium-* (cloud sandbox), else Playwright's own. */
export function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  try {
    const dirs = fs.readdirSync(root).filter(d => /^chromium-\d+$/.test(d)).sort((a, b) => +b.split('-')[1] - +a.split('-')[1]);
    for (const d of dirs) {
      for (const rel of ['chrome-linux/chrome', 'chrome-linux64/chrome', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium']) {
        const p = path.join(root, d, rel);
        if (fs.existsSync(p)) return p;
      }
    }
  } catch {}
  return undefined;   // Playwright-managed browser (run once: npx playwright install chromium)
}

export const LAUNCH_ARGS = ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'];

/** Device presets. Every context also gets camera+mic permission, downloads, ko-KR, and the venue time zone. */
export const PRESETS = {
  phone:           { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  phoneSE:         { viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  phoneLandscape:  { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  tablet:          { viewport: { width: 820, height: 1180 }, isMobile: true, hasTouch: true },          // kiosk iPad, portrait
  tabletLandscape: { viewport: { width: 1180, height: 820 }, isMobile: true, hasTouch: true },
  tv:              { viewport: { width: 1920, height: 1080 } },                                         // venue TV / laptop on HDMI
  laptop:          { viewport: { width: 1280, height: 720 } },
  desktop:         { viewport: { width: 1280, height: 900 } },                                          // admin
};
const CONTEXT_DEFAULTS = { permissions: ['camera', 'microphone'], acceptDownloads: true, locale: 'ko-KR', timezoneId: 'America/New_York' };

/** Console noise that is never a bug in this app. */
const ALWAYS_IGNORED = [/Failed to load resource/i, /favicon/i, /\b404\b/];

/** Init script: counts getUserMedia calls and live tracks → window.__gum, window.__live(kind). */
export const MEDIA_SPY = () => {
  window.__gum = { video: 0, audio: 0, tracks: [] };
  const md = navigator.mediaDevices; if (!md?.getUserMedia) return;
  const orig = md.getUserMedia.bind(md);
  md.getUserMedia = async c => { if (c?.video) window.__gum.video++; if (c?.audio) window.__gum.audio++; const s = await orig(c); s.getTracks().forEach(t => window.__gum.tracks.push(t)); return s; };
  window.__live = kind => window.__gum.tracks.filter(t => t.kind === kind && t.readyState === 'live').length;
};

/** Init script: frame counter for perf checks → window.__fps.frames / window.__fps.reset(). */
export const FPS_PROBE = () => {
  const f = window.__fps = { frames: 0, since: performance.now(), long: 0, reset() { this.frames = 0; this.long = 0; this.since = performance.now(); } };
  const raf = window.requestAnimationFrame.bind(window);
  (function tick() { f.frames++; raf(tick); })();
  try { new PerformanceObserver(l => { f.long += l.getEntries().length; }).observe({ type: 'longtask', buffered: false }); } catch {}
};

export async function launch() {
  return chromium.launch({ executablePath: findChrome(), args: LAUNCH_ARGS, headless: !process.env.HEADED });
}

/** FNV-1a 32-bit over a byte array → 8 hex chars (used for golden sprite hashes). */
export function fnv1a(bytes) {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) { h ^= bytes[i]; h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

export function createHarness({ name, base, browser, update = false, verbose = false }) {
  const out = path.join(OUT, name);
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });

  const checks = [], errors = [], allowed = [], contexts = [];
  let pageN = 0;

  const h = {
    name, base, browser, update, out, flows,
    fixtures: FIXTURES, golden: GOLDEN, repo: REPO, publicDir: PUBLIC,
    presets: PRESETS,

    /** Absolute URL of a page under public/. Adds demo=1 and phase=live unless the path or params already set them
     *  (phase=live = the wedding-day experience v3.2 was built for, so tests don't depend on today's date).
     *  h.url('village.html', { seed: 12, time: 'day' })  ·  params with null/false are removed. */
    url(file, params = {}) {
      const u = new URL(file, base);
      if (!u.searchParams.has('demo') && !('demo' in params)) u.searchParams.set('demo', '1');
      if (!u.searchParams.has('phase') && !('phase' in params)) u.searchParams.set('phase', 'live');
      for (const [k, v] of Object.entries(params)) {
        if (v === null || v === undefined || v === false) u.searchParams.delete(k);
        else u.searchParams.set(k, v === true ? '1' : String(v));
      }
      return u.href;
    },
    fixture: f => path.join(FIXTURES, f),
    file: f => path.join(out, f),

    /** New isolated browser context ("device"). preset: a PRESETS key or a raw options object. */
    async context(preset = 'desktop', extra = {}) {
      const base = typeof preset === 'string' ? PRESETS[preset] : preset;
      if (!base) throw new Error(`unknown preset "${preset}" (have: ${Object.keys(PRESETS).join(', ')})`);
      const ctx = await browser.newContext({ ...CONTEXT_DEFAULTS, ...base, ...extra });
      contexts.push(ctx);
      return ctx;
    },

    /** New page with the error watcher attached. target: preset name (→ new context) or an existing context.
     *  opts: { tag: 'label in error output', spyMedia: true (MEDIA_SPY), fps: true (FPS_PROBE) } */
    async page(target = 'desktop', opts = {}) {
      const ctx = typeof target === 'string' || !target?.newPage ? await h.context(target) : target;
      const p = await ctx.newPage();
      const tag = opts.tag || `${typeof target === 'string' ? target : 'page'}#${++pageN}`;
      p.on('pageerror', e => errors.push({ tag, msg: 'uncaught: ' + (e?.message || e) }));
      p.on('console', m => { if (m.type() === 'error') errors.push({ tag, msg: m.text() }); });
      if (opts.spyMedia) await p.addInitScript(MEDIA_SPY);
      if (opts.fps) await p.addInitScript(FPS_PROBE);
      return p;
    },

    /** Screenshot into tests/.out/<suite>/<name>.png (viewport only — see rules above). */
    async shot(page, file, opts = {}) {
      const p = path.join(out, file.endsWith('.png') ? file : file + '.png');
      await page.screenshot({ path: p, ...opts }).catch(e => h.log(`screenshot ${file} failed: ${e.message}`));
      return p;
    },

    /** Record a result. detail is shown next to FAILs (and with --verbose). */
    check(label, ok, detail = '') {
      checks.push({ name: label, ok: !!ok, detail: detail === undefined ? '' : String(detail).slice(0, 400) });
      if (verbose) console.log(`    ${ok ? 'PASS' : 'FAIL'}  ${label}${detail !== '' ? '  — ' + detail : ''}`);
      return !!ok;
    },
    eq(label, actual, expected) {
      const a = JSON.stringify(actual), e = JSON.stringify(expected);
      return h.check(label, a === e, a === e ? a : `got ${a}, want ${e}`);
    },
    /** Run an independent scenario; a throw becomes a single FAIL and the suite continues. */
    async step(label, fn) {
      if (verbose) console.log(`  · ${label}`);
      try { await fn(); }
      catch (e) { h.check(`${label} — step crashed`, false, String(e?.message || e).split('\n')[0]); }
    },
    /** Whitelist expected console errors: h.allowErrors(/quota/) for every page, or h.allowErrors({ tag: 'no-demo', re: /./ }) for one page. */
    allowErrors(...rules) { allowed.push(...rules.map(r => (r instanceof RegExp ? { re: r } : r))); },
    wait: ms => new Promise(r => setTimeout(r, ms)),
    log: (...a) => console.log(`    [${name}]`, ...a),

    /** Run fn(store, arg) inside the page against the page's own store (demo or firebase). fn must be self-contained. */
    store(page, fn, arg) {
      return page.evaluate(async ([src, a]) => {
        const { getStore } = await import(new URL('js/store.js', location.href).href);
        const s = await getStore();
        return (0, eval)('(' + src + ')')(s, a);
      }, [fn.toString(), arg ?? null]);
    },

    /** Resolve with the TV/phone banner text (#arrival) once it matches re, or null after timeout.
     *  Start it BEFORE triggering the thing that shows the banner. */
    waitBanner(page, re, timeout = 40000) {
      return page.evaluate(([src, flags, ms]) => new Promise(res => {
        const rx = new RegExp(src, flags), el = document.querySelector('#arrival');
        if (!el) return res(null);
        if (rx.test(el.textContent)) return res(el.textContent);
        const mo = new MutationObserver(() => { if (rx.test(el.textContent)) { mo.disconnect(); res(el.textContent); } });
        mo.observe(el, { childList: true, characterData: true, subtree: true });
        setTimeout(() => { mo.disconnect(); res(null); }, ms);
      }), [re.source, re.flags, timeout]);
    },

    /** Wait for a download triggered by `trigger()`; saves it into the out dir and returns the path (or null). */
    async download(page, trigger, file, timeout = 60000) {
      const wait = page.waitForEvent('download', { timeout });
      await trigger();
      const d = await wait.catch(() => null);
      if (!d) return null;
      const p = path.join(out, file || d.suggestedFilename());
      await d.saveAs(p);
      return p;
    },

    /** Read the visible overlap / tap-target / horizontal-scroll report of a page (see core-layout). */
    layoutReport: page => page.evaluate(LAYOUT_PROBE),
  };

  /** Called by the runner after the suite function returns (or throws). */
  h._finish = async () => {
    for (const c of contexts.splice(0)) await c.close().catch(() => {});
    const ignore = [...ALWAYS_IGNORED.map(re => ({ re })), ...allowed];
    const bad = errors.filter(e => !ignore.some(r => (!r.tag || r.tag === e.tag) && r.re.test(e.msg)));
    const uniq = [...new Map(bad.map(e => [e.tag + e.msg, e])).values()];
    h.check('no unexpected console errors / uncaught exceptions', uniq.length === 0,
      uniq.slice(0, 6).map(e => `${e.tag}: ${e.msg}`).join(' | '));
    return { checks, errors: uniq };
  };
  return h;
}

/** Runs in the page. Finds visible HUD/interactive boxes that overlap each other, small tap targets, and sideways scroll. */
export const LAYOUT_PROBE = async () => {
  await document.fonts?.ready;                      // fallback-font metrics differ by a pixel or two
  // a screen is mid-"pop" (scale .78 → 1, 0.25 s) for a moment after it appears: measuring then shrinks every box (a 40 px summary reads 31).
  // Wait for the finite animations — never the endless ones (spinners, idle bobbing).
  await Promise.all(document.getAnimations().filter(a => a.effect?.getComputedTiming().endTime !== Infinity).map(a => a.finished.catch(() => {})));
  const sel = 'button, a.px-btn, label.px-btn, .hud .lvpanel, .hud .ticker:not(.empty), .hud .arrival.on, .hud .polaroid.on, .hud .qr, .hud .demo-flag:not([hidden]), .demo-ribbon, .mremote, .mctl, input:not([type=file]), textarea, select'
    // v4: HUD zone content, spotlight, quiet chip, generic sheet, and every feature root node
    + ', .hud .hz > *, .hud .spot.on, .quiet-chip:not([hidden]), #fsheet:not([hidden]), [data-f]:not(link):not(style):not(script)';
  const vis = e => {
    // inside a closed <details> (content-visibility: hidden) Chromium still reports a real box — it is not on screen
    if (e.checkVisibility && !e.checkVisibility()) return false;
    const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
    if (r.width <= 2 || r.height <= 2 || cs.visibility === 'hidden' || cs.display === 'none' || r.bottom <= 0 || r.top >= innerHeight) return false;
    for (let n = e; n; n = n.parentElement) { const s = getComputedStyle(n); if (+s.opacity < 0.05 || s.display === 'none') return false; if (n.hidden) return false; }
    return true;
  };
  // pointer-events:none overlays (the demo ribbon, decorative layers) never block a tap
  const els = [...document.querySelectorAll(sel)].filter(vis).filter(e => getComputedStyle(e).pointerEvents !== 'none' && !e.closest('.demo-ribbon'));
  const name = e => e.id ? '#' + e.id : e.tagName.toLowerCase() + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).join('.') : '');
  // fixed/sticky layer an element lives in (null = scrolls with the page)
  const layer = e => { for (let n = e; n && n !== document.body; n = n.parentElement) { const p = getComputedStyle(n).position; if (p === 'fixed' || p === 'sticky') return n; } return null; };
  const modal = e => e.closest('.sheet, dialog[open], [role=dialog]');
  const overlaps = [];
  for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
    const a = els[i], b = els[j]; if (a.contains(b) || b.contains(a)) continue;
    const r1 = a.getBoundingClientRect(), r2 = b.getBoundingClientRect();
    const ix = Math.min(r1.right, r2.right) - Math.max(r1.left, r2.left), iy = Math.min(r1.bottom, r2.bottom) - Math.max(r1.top, r2.top);
    if (ix <= 2 || iy <= 2) continue;
    if (!!layer(a) !== !!layer(b)) continue;      // page content scrolling under a sticky/fixed bar: reachable by scrolling
    if (!!modal(a) !== !!modal(b)) continue;      // an open sheet/dialog intentionally covers what is behind it
    overlaps.push(`${name(a)} × ${name(b)}`);
  }
  // tap targets: a checkbox inside a <label> is as big as its label; mouse-only pages get the WCAG 2.2 floor (24 px)
  const min = matchMedia('(pointer: coarse)').matches ? 32 : 24;
  const target = e => (e.matches('input[type=checkbox], input[type=radio]') && e.closest('label')) || e;
  const small = [...document.querySelectorAll('button, a, label.px-btn, summary, input[type=checkbox]')].filter(vis)
    .map(e => [e, target(e).getBoundingClientRect()])
    .filter(([, r]) => r.height < min || r.width < min)
    .map(([e, r]) => `${name(e)} ${Math.round(r.width)}x${Math.round(r.height)}`);
  return { overlaps, small: [...new Set(small)], min, hscroll: document.documentElement.scrollWidth > innerWidth + 1 };
};

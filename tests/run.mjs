#!/usr/bin/env node
// ============================================================
//  Test runner (no framework). Starts the static server on a free port, then runs every suite in
//    tests/suites/*.mjs    (core — the existing app; must stay green forever)
//    tests/features/*.mjs  (one per v4 feature; files starting with "_" are templates and are skipped)
//
//    npm test                                  all suites
//    npm run test:core | test:features         one group
//    node tests/run.mjs core-static golden-sprites   by name (or --suite a,b)
//    node tests/run.mjs --grep village         names matching a regex
//    node tests/run.mjs --quick                skip suites tagged 'slow'
//    node tests/run.mjs --list                 list suites
//    node tests/run.mjs --update               let golden suites rewrite their baselines
//    node tests/run.mjs --verbose              print every check, not just failures
//    node tests/run.mjs --jobs 2               run suites in parallel (each gets its own browser)
//
//  Output: tests/.out/<suite>/ (screenshots, downloads) and tests/.out/results.json.
//  Exit code: 0 all green · 1 a check failed · 2 the harness itself broke.
// ============================================================
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { serve } from '../tools/serve.mjs';
import { createHarness, launch, findChrome, TESTS, OUT } from './lib/harness.mjs';

const argv = process.argv.slice(2);
const flag = k => argv.includes(k);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const VALUED = new Set(['--suite', '--only', '--grep', '--jobs']);
const positional = argv.filter((a, i) => !a.startsWith('--') && !VALUED.has(argv[i - 1]));

const verbose = flag('--verbose') || flag('-v');
const update = flag('--update');
const jobs = Math.max(1, +opt('--jobs', process.env.TEST_JOBS || 1) || 1);

// ---------- discover ----------
function discover() {
  const list = [];
  for (const [dir, kind] of [['suites', 'core'], ['features', 'features']]) {
    const abs = path.join(TESTS, dir);
    if (!fs.existsSync(abs)) continue;
    for (const f of fs.readdirSync(abs).sort()) {
      if (!f.endsWith('.mjs') || f.startsWith('_')) continue;
      list.push({ name: f.replace(/\.mjs$/, ''), kind, file: path.join(abs, f) });
    }
  }
  return list;
}

let suites = discover();
const wanted = [...positional, ...(opt('--suite', '') ? opt('--suite').split(',') : [])].map(s => s.trim()).filter(Boolean);
if (wanted.length) {
  const missing = wanted.filter(w => !suites.some(s => s.name === w));
  if (missing.length) { console.error(`unknown suite(s): ${missing.join(', ')}\nhave: ${suites.map(s => s.name).join(', ')}`); process.exit(2); }
  suites = suites.filter(s => wanted.includes(s.name));
}
if (opt('--only')) suites = suites.filter(s => s.kind === opt('--only'));
if (opt('--grep')) { const re = new RegExp(opt('--grep'), 'i'); suites = suites.filter(s => re.test(s.name)); }

// load metas (also validates that every suite module at least imports)
for (const s of suites) {
  try {
    const mod = await import(pathToFileURL(s.file).href);
    if (typeof mod.default !== 'function') throw new Error('suite must `export default async (h) => {…}`');
    s.fn = mod.default; s.meta = mod.meta || {};
  } catch (e) { s.loadError = e; s.meta = {}; }
}
if (flag('--quick')) suites = suites.filter(s => !(s.meta.tags || []).includes('slow'));

if (flag('--list')) {
  for (const s of suites) console.log(`${s.kind.padEnd(9)} ${s.name.padEnd(28)} ${(s.meta.tags || []).join(',').padEnd(8)} ${s.meta.title || ''}`);
  process.exit(0);
}
if (!suites.length) { console.log('no suites selected'); process.exit(0); }

// ---------- run ----------
fs.mkdirSync(OUT, { recursive: true });
const server = await serve({ port: 0 });
console.log(`serving public/ at ${server.url} · chromium: ${findChrome() || 'playwright-managed'} · ${suites.length} suite(s)${jobs > 1 ? ` · ${jobs} jobs` : ''}\n`);

async function runOne(s) {
  const t0 = Date.now();
  const res = { suite: s.name, kind: s.kind, title: s.meta.title || '', checks: [], errors: [], ms: 0, crashed: null };
  if (s.loadError) {
    res.checks.push({ name: 'suite module loads', ok: false, detail: String(s.loadError?.message || s.loadError).split('\n')[0] });
    res.crashed = 'load'; res.ms = Date.now() - t0; return res;
  }
  let browser = null;                                   // meta.browser === false → pure Node suite, no Chromium
  if (s.meta.browser !== false) {
    try { browser = await launch(); }
    catch (e) { res.checks.push({ name: 'browser launches', ok: false, detail: e.message.split('\n')[0] + ' — set CHROME_PATH or run: npx playwright install chromium' }); res.crashed = 'browser'; return res; }
  }
  const h = createHarness({ name: s.name, base: server.url, browser, update, verbose: verbose && jobs === 1 });
  const timeout = s.meta.timeout || 240000;
  let timer;
  try {
    await Promise.race([
      s.fn(h),
      new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`suite timed out after ${timeout / 1000}s`)), timeout); }),
    ]);
  } catch (e) {
    h.check('suite ran to the end', false, String(e?.stack || e).split('\n').slice(0, 2).join(' '));
    res.crashed = 'run';
  } finally { clearTimeout(timer); }
  const fin = await h._finish().catch(e => ({ checks: [{ name: 'cleanup', ok: false, detail: e.message }], errors: [] }));
  await browser?.close().catch(() => {});
  res.checks = fin.checks; res.errors = fin.errors; res.ms = Date.now() - t0;
  return res;
}

function print(r) {
  const fails = r.checks.filter(c => !c.ok), n = r.checks.length;
  const head = `${fails.length ? 'FAIL' : 'ok  '}  ${r.suite.padEnd(28, ' ')} ${String(n - fails.length).padStart(3)}/${String(n).padEnd(3)} ${(r.ms / 1000).toFixed(1).padStart(6)}s`;
  console.log(head);
  for (const c of verbose && jobs > 1 ? r.checks : fails) console.log(`      ${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.detail ? '  — ' + c.detail : ''}`);
}

const results = [];
const isSolo = s => (s.meta.tags || []).includes('exclusive');          // perf suites: never share the CPU
const queue = suites.filter(s => !isSolo(s));
const runAndPrint = async s => {
  if (verbose && jobs === 1) console.log(`▶ ${s.name}${s.meta.title ? ' — ' + s.meta.title : ''}`);
  const r = await runOne(s);
  results.push(r); print(r);
};
await Promise.all(Array.from({ length: Math.min(jobs, queue.length) }, async () => { while (queue.length) await runAndPrint(queue.shift()); }));
for (const s of suites.filter(isSolo)) await runAndPrint(s);
await server.close();

// ---------- summary ----------
results.sort((a, b) => suites.findIndex(s => s.name === a.suite) - suites.findIndex(s => s.name === b.suite));
const total = results.reduce((a, r) => a + r.checks.length, 0);
const failed = results.flatMap(r => r.checks.filter(c => !c.ok).map(c => ({ suite: r.suite, ...c })));
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ at: new Date().toISOString(), total, failed: failed.length, results }, null, 2));
console.log('\n' + (failed.length
  ? `✘ ${failed.length} of ${total} checks failed in ${new Set(failed.map(f => f.suite)).size} suite(s): ${[...new Set(failed.map(f => f.suite))].join(', ')}`
  : `✔ all ${total} checks passed in ${results.length} suite(s)`));
console.log('  details: tests/.out/results.json · screenshots: tests/.out/<suite>/');
process.exit(failed.length ? 1 : 0);

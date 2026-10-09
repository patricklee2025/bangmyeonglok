#!/usr/bin/env node
// ============================================================
//  tests/rules/run.mjs — firestore.rules against the REAL rules engine (Firebase emulator). No dependencies: plain fetch() to the emulator's REST API.
//
//    npm run test:rules          (= firebase emulators:exec --only firestore --project demo-wgb "node tests/rules/run.mjs")
//    node tests/rules/run.mjs --self       no emulator: checks the case table and builds every request (this runs inside `npm test`)
//    node tests/rules/run.mjs --verbose    also print the cases that passed
//
//  One-time setup on YOUR computer (the cloud workspace cannot download the emulator): Java 11+, `npm i -g firebase-tools`. No login needed.
//  The cases are tests/rules/cases.mjs — the SAME table the demo backend is tested against in tests/suites/core-units.mjs
//  (docs/v4/03-data-and-rules.md §5: the allow/deny matrix + the 8 numbered deny cases).
//  Exit code: 0 = all as expected · 1 = at least one case behaved differently · 2 = the emulator could not be reached.
//  Rules that depend on the date (anniv window, capsules 2028-04-10) use the emulator's real clock: the "allow" side is skipped (SKIP: 날짜 전)
//  until that date has come, the "deny" side is always checked.
// ============================================================
import { pathToFileURL } from 'node:url';
import { CASES, BASE_SEED } from './cases.mjs';

const PROJECT = 'demo-wgb';
const HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const ROOT = `projects/${PROJECT}/databases/(default)/documents`;
const REST = `http://${HOST}/v1/${ROOT}`;
const ADMIN_EMAIL = 'jihwan.patrick.lee@gmail.com';   // = adminEmails[0] in config.js and in firestore.rules

// ---- tokens: unsigned JWTs (alg: none) — the emulator reads the claims and does not check a signature -------------------------
const b64u = o => Buffer.from(JSON.stringify(o)).toString('base64url');
function token(actor) {
  if (actor === 'anon') return null;
  const iat = Math.floor(Date.now() / 1000);
  const who = actor === 'admin' ? { sub: 'admin1', email: ADMIN_EMAIL } : { sub: 'other1', email: 'someone@example.com' };
  return `${b64u({ alg: 'none', typ: 'JWT' })}.${b64u({
    iss: `https://securetoken.google.com/${PROJECT}`, aud: PROJECT, auth_time: iat, iat, exp: iat + 3600,
    user_id: who.sub, sub: who.sub, email: who.email, email_verified: true, firebase: { identities: { email: [who.email] }, sign_in_provider: 'google.com' },
  })}.`;
}

// ---- JS data → Firestore REST values -----------------------------------------------------------------------------------------
const OLD_TIME = '2020-01-01T00:00:00Z', CLIENT_TIME = '2021-06-01T00:00:00Z';
export function toValue(v) {
  if (v === null) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: v.length ? { values: v.map(toValue) } : {} };
  if (v && typeof v === 'object' && '@at' in v) return { timestampValue: v['@at'] === 'now' ? new Date().toISOString() : OLD_TIME };
  const keys = Object.keys(v);
  return { mapValue: keys.length ? { fields: Object.fromEntries(keys.map(k => [k, toValue(v[k])])) } : {} };
}
/** top-level '@ts' fields become server-time transforms, '@client' a fixed client timestamp */
function split(data) {
  const fields = {}, transforms = [];
  for (const [k, v] of Object.entries(data || {})) {
    if (v === '@ts') transforms.push({ fieldPath: k, setToServerValue: 'REQUEST_TIME' });
    else fields[k] = v === '@client' ? { timestampValue: CLIENT_TIME } : toValue(v);
  }
  return { fields, transforms };
}
const doc = path => `${ROOT}/${path}`;

/** one case-write → one Write of documents:commit */
export function buildWrite({ op, path, data }) {
  if (op === 'delete') return { delete: doc(path) };
  const { fields, transforms } = split(data);
  const w = { update: { name: doc(path), fields } };
  if (transforms.length) w.updateTransforms = transforms;
  if (op === 'create') w.currentDocument = { exists: false };
  if (op === 'update') { w.updateMask = { fieldPaths: Object.keys(fields) }; w.currentDocument = { exists: true }; }
  return w;
}
const seedWrite = s => ({ update: { name: doc(s.path), fields: split(s.data).fields } });

// ---- HTTP -----------------------------------------------------------------------------------------------------------------------
async function call(method, url, actor, body) {
  const headers = { 'content-type': 'application/json' };
  const t = actor === 'owner' ? 'owner' : token(actor);
  if (t) headers.authorization = 'Bearer ' + t;
  const r = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let json = null;
  try { json = await r.json(); } catch { /* empty body */ }
  return { status: r.status, json };
}
const clearAll = () => call('DELETE', `http://${HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, 'owner');
const commit = (writes, actor) => call('POST', `${REST}:commit`, actor, { writes });

// ---- planning: which cases can run right now ------------------------------------------------------------------------------
export function plan(c, now = Date.now()) {
  if (c.demoOnly) return { skip: 'demo only' };
  if (c.window) {
    const inside = now >= c.window[0] && now < c.window[1];
    if (c.expect === 'allow' && !inside) return { skip: 'SKIP: 날짜 전 (allow side opens ' + new Date(c.window[0]).toISOString().slice(0, 10) + ')' };
    if (c.expect === 'deny' && inside) return { skip: 'SKIP: 기간 안 (deny side only checkable outside the window)' };
  }
  return { run: true };
}

async function execute(c) {
  await clearAll();
  const seeds = [...BASE_SEED, ...(c.seed || [])];
  const s = await commit(seeds.map(seedWrite), 'owner');
  if (s.status !== 200) return { error: `seeding failed (${s.status}) ${JSON.stringify(s.json)}` };
  let r;
  if (c.op === 'get') r = await call('GET', `${REST}/${c.path}`, c.actor);
  else if (c.op === 'list') r = await call('GET', `${REST}/${c.path}`, c.actor);
  else r = await commit((c.writes || [c]).map(buildWrite), c.actor);
  // reads: 200 (found) / 404 (allowed, but nothing there) both mean "the rules let it through"
  const through = c.op === 'get' || c.op === 'list' ? r.status === 200 || r.status === 404 : r.status === 200;
  const denied = r.status === 403;
  if (!through && !denied) return { error: `unexpected HTTP ${r.status}: ${JSON.stringify(r.json)?.slice(0, 300)}` };
  return { allowed: through };
}

// ---- --self: no emulator needed ---------------------------------------------------------------------------------------------------
/** consistency of the table + every request can be built. Returns a list of problems (empty = fine). */
export function selfCheck() {
  const bad = [], ids = new Set();
  const OPS = ['create', 'set', 'update', 'delete', 'get', 'list', 'batch'];
  for (const c of CASES) {
    if (ids.has(c.id)) bad.push('duplicate case id ' + c.id);
    ids.add(c.id);
    if (!['anon', 'other', 'admin'].includes(c.actor)) bad.push(`${c.id}: bad actor ${c.actor}`);
    if (!OPS.includes(c.op)) bad.push(`${c.id}: bad op ${c.op}`);
    if (!['allow', 'deny'].includes(c.expect)) bad.push(`${c.id}: bad expect ${c.expect}`);
    if (!c.name) bad.push(`${c.id}: no name`);
    try {
      for (const w of c.writes || (['get', 'list'].includes(c.op) ? [] : [c])) JSON.stringify(buildWrite(w));
      for (const s of [...BASE_SEED, ...(c.seed || [])]) JSON.stringify(seedWrite(s));
    } catch (e) { bad.push(`${c.id}: cannot build the request — ${e.message}`); }
  }
  for (let n = 1; n <= 8; n++) if (!CASES.some(c => c.deny === n && !c.rulesOnly)) bad.push(`deny case ${n} (03 §5) has no case`);
  return bad;
}

async function main() {
  const args = process.argv.slice(2), verbose = args.includes('--verbose');
  if (args.includes('--self')) {
    const bad = selfCheck();
    console.log(bad.length ? 'FAIL\n  ' + bad.join('\n  ') : `ok — ${CASES.length} cases, every request builds, deny cases 1–8 are all covered`);
    process.exit(bad.length ? 1 : 0);
  }
  try { await fetch(`http://${HOST}/`); } catch {
    console.error(`Cannot reach the Firestore emulator at ${HOST}.\nRun this through:  npm run test:rules   (it starts the emulator; needs Java 11+ and firebase-tools)`);
    process.exit(2);
  }
  const problems = selfCheck();
  if (problems.length) { console.error('The case table is inconsistent:\n  ' + problems.join('\n  ')); process.exit(1); }

  let pass = 0, skipped = 0;
  const failed = [];
  const denyRan = new Set();
  for (const c of CASES) {
    const p = plan(c);
    if (!p.run) { skipped++; if (verbose || p.skip.startsWith('SKIP')) console.log(`  skip  ${c.id} — ${p.skip}`); continue; }
    const r = await execute(c);
    const want = c.expect === 'allow';
    const ok = !r.error && r.allowed === want;
    if (ok) { pass++; if (c.deny) denyRan.add(c.deny); if (verbose) console.log(`  ok    ${c.id} — ${c.name}`); }
    else { failed.push(c); console.log(`  FAIL  ${c.id} — ${c.name}\n          expected ${c.expect}, got ${r.error ? 'ERROR ' + r.error : r.allowed ? 'allow' : 'deny'}   [${c.actor} ${c.op} ${c.path || ''}]`); }
  }
  await clearAll();
  const missing = [1, 2, 3, 4, 5, 6, 7, 8].filter(n => !denyRan.has(n));
  console.log(`\n${pass} passed · ${failed.length} failed · ${skipped} skipped (${CASES.length} cases)`);
  console.log('numbered deny cases (03 §5) checked: ' + ([1, 2, 3, 4, 5, 6, 7, 8].filter(n => denyRan.has(n)).join(' ') || 'none') + (missing.length ? `   not run: ${missing.join(' ')}` : ''));
  if (failed.length) console.log('\nA FAIL means firestore.rules and the case table (= 03 §5) disagree — do not publish the rules until it is understood.');
  process.exit(failed.length ? 1 : 0);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main().catch(e => { console.error(e); process.exit(1); });

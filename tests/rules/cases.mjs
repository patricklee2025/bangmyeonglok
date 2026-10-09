// ============================================================
//  tests/rules/cases.mjs — the allow/deny matrix of docs/v4/03-data-and-rules.md §5 as DATA (no dependencies).
//
//  ONE table, two runners:
//    tests/rules/run.mjs            → the real rules engine (Firebase emulator, REST) — Patrick runs `npm run test:rules`
//    tests/suites/core-units.mjs    → the demo backend (core/schema.js mirror through core/docdb.js)  — part of `npm test`
//  If the two agree on every row, "passes in the demo ⇒ passes in production" holds for everything in this table.
//
//  Case = { id, name, actor, op, path, data?, writes?, seed?, expect, code?, deny?, rulesOnly?, clock?, window? }
//    actor   'anon' (guest phone, no login) · 'other' (signed in, not an admin) · 'admin'     (the demo cannot tell anon from other)
//    op      'create' (must not exist) · 'set' (upsert; a second set is an UPDATE for the rules) · 'update' (patch an existing doc)
//            · 'delete' · 'get' · 'list' (path = collection name)
//    data    '@ts' = server time (ctx.db.ts()) · '@client' = a time the client picked (must be refused) · plain JSON otherwise
//    seed    documents that exist before the case (written past the rules); seed values { '@at': 'old' | 'now' } are timestamps
//            ('old' = 2020, 'now' = the moment of seeding — "just written", for the 1 s / 2 s rate limits)
//    expect  'allow' | 'deny'          code (demo only) the error code the demo must give when it denies
//    deny    1…8 = the numbered "must be denied" list of 03 §5 (every number must be covered — the demo test checks)
//    rulesOnly  the emulator runs it, the demo does not (v3.2 collections are store.js's, batch semantics…)
//    clock   (demo only) ISO instant to freeze the clock at     window  [fromMs, toMs): the rules only allow inside this time window —
//            the emulator uses the real clock, so it checks 'allow' only while now is inside and 'deny' only while now is outside
// ============================================================

export const GUESTS = ['gA', 'gB'];        // always exist
export const TOKEN = 'abcdefghijklmnopqrstuv0123';      // 26 letters/digits
const OLD = { '@at': 'old' }, NOW = { '@at': 'now' };
const IMG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD';
const fill = (prefix, n) => prefix + 'A'.repeat(n - prefix.length);
const IMG_PREFIX = 'data:image/jpeg;base64,';

export const CASES = [];
const add = (id, name, actor, op, path, data, expect, extra = {}) => CASES.push({ id, name, actor, op, path, data, expect, ...extra });

// ---------------------------------------------------------------------------------------------------- app/settings · app/live
const ST = (o = {}) => ({ features: { poll: true }, safe: false, phase: 'auto', cfg: {}, updatedAt: '@ts', ...o });
const ST_SEED = [{ path: 'app/settings', data: { features: { poll: true }, safe: false, phase: 'auto', cfg: {}, updatedAt: OLD } }];
const many = (n, v) => Object.fromEntries(Array.from({ length: n }, (_, i) => ['k' + i, v]));
add('settings.anon-create', 'anonymous cannot create app/settings', 'anon', 'create', 'app/settings', ST(), 'deny', { deny: 1, code: 'permission-denied' });
add('settings.other-create', 'a signed-in non-admin cannot create app/settings', 'other', 'create', 'app/settings', ST(), 'deny', { deny: 1, code: 'permission-denied' });
add('settings.anon-update', 'anonymous cannot change app/settings', 'anon', 'update', 'app/settings', { safe: true, updatedAt: '@ts' }, 'deny', { deny: 1, seed: ST_SEED, code: 'permission-denied' });
add('settings.other-update', 'a signed-in non-admin cannot change app/settings', 'other', 'update', 'app/settings', { safe: true, updatedAt: '@ts' }, 'deny', { deny: 1, seed: ST_SEED, code: 'permission-denied' });
add('settings.admin-create', 'admin creates app/settings', 'admin', 'create', 'app/settings', ST(), 'allow');
add('settings.admin-update', 'admin updates app/settings', 'admin', 'update', 'app/settings', { safe: true, updatedAt: '@ts' }, 'allow', { seed: ST_SEED });
add('settings.admin-phase', 'admin forces a phase', 'admin', 'update', 'app/settings', { phase: 'anniversary', updatedAt: '@ts' }, 'allow', { seed: ST_SEED });
add('settings.40-features', 'exactly 40 features is fine', 'admin', 'create', 'app/settings', ST({ features: many(40, true) }), 'allow');
add('settings.41-features', 'features with 41 entries is refused', 'admin', 'create', 'app/settings', ST({ features: many(41, true) }), 'deny', { deny: 2, code: 'invalid-argument' });
add('settings.phase-party', 'phase "party" is refused', 'admin', 'create', 'app/settings', ST({ phase: 'party' }), 'deny', { deny: 2, code: 'invalid-argument' });
add('settings.client-time', 'updatedAt chosen by the client is refused', 'admin', 'create', 'app/settings', ST({ updatedAt: '@client' }), 'deny', { deny: 2, code: 'invalid-argument' });
add('settings.cfg-40', 'cfg with 40 entries is fine', 'admin', 'create', 'app/settings', ST({ cfg: many(40, {}) }), 'allow');
add('settings.cfg-41', 'cfg with 41 entries is refused', 'admin', 'create', 'app/settings', ST({ cfg: many(41, {}) }), 'deny', { code: 'invalid-argument' });
add('settings.extra-key', 'an unknown field is refused', 'admin', 'create', 'app/settings', ST({ secret: 1 }), 'deny', { code: 'invalid-argument' });
add('settings.safe-type', 'safe must be a bool', 'admin', 'create', 'app/settings', ST({ safe: 'yes' }), 'deny', { code: 'invalid-argument' });
add('settings.anon-get', 'everyone reads app/settings', 'anon', 'get', 'app/settings', null, 'allow', { seed: ST_SEED });
add('settings.anon-delete', 'anonymous cannot delete app/settings', 'anon', 'delete', 'app/settings', null, 'deny', { seed: ST_SEED });
add('settings.admin-delete', 'nobody deletes app/settings (not even an admin)', 'admin', 'delete', 'app/settings', null, 'deny', { seed: ST_SEED });
add('settings.other-doc-get', 'app/other does not exist for the rules', 'admin', 'get', 'app/other', null, 'deny', { code: 'unknown-path' });
add('settings.other-doc-create', 'admin cannot create app/other', 'admin', 'create', 'app/other', { updatedAt: '@ts' }, 'deny', { code: 'unknown-path' });

const LV = (o = {}) => ({ cue: 'cue1', cueSeq: 1, cueAt: '@ts', quiet: false, poll: null, msg: { ko: '안내', en: 'Notice' }, updatedAt: '@ts', ...o });
const LV_SEED = [{ path: 'app/live', data: { cue: null, cueSeq: 0, cueAt: null, quiet: false, poll: null, msg: null, updatedAt: OLD } }];
add('live.anon-create', 'anonymous cannot write app/live', 'anon', 'create', 'app/live', LV(), 'deny', { deny: 1, code: 'permission-denied' });
add('live.other-create', 'a signed-in non-admin cannot write app/live', 'other', 'create', 'app/live', LV(), 'deny', { deny: 1, code: 'permission-denied' });
add('live.anon-update', 'anonymous cannot change app/live', 'anon', 'update', 'app/live', { quiet: true, updatedAt: '@ts' }, 'deny', { deny: 1, seed: LV_SEED, code: 'permission-denied' });
add('live.admin-create', 'admin creates app/live', 'admin', 'create', 'app/live', LV(), 'allow');
add('live.admin-update', 'admin changes app/live', 'admin', 'update', 'app/live', { quiet: true, poll: 'p1', updatedAt: '@ts' }, 'allow', { seed: LV_SEED });
add('live.minimal', 'a document with only updatedAt is fine (every field has a default)', 'admin', 'create', 'app/live', { updatedAt: '@ts' }, 'allow');
add('live.cue-24', 'cue of 24 characters is fine', 'admin', 'create', 'app/live', LV({ cue: 'c'.repeat(24) }), 'allow');
add('live.cue-25', 'cue of 25 characters is refused', 'admin', 'create', 'app/live', LV({ cue: 'c'.repeat(25) }), 'deny', { code: 'invalid-argument' });
add('live.cueSeq-type', 'cueSeq must be an int', 'admin', 'create', 'app/live', LV({ cueSeq: 'x' }), 'deny', { code: 'invalid-argument' });
add('live.cueAt-type', 'cueAt must be a timestamp', 'admin', 'create', 'app/live', LV({ cueAt: 'now' }), 'deny', { code: 'invalid-argument' });
add('live.msg-80', 'a notice of 80 characters per language is fine', 'admin', 'create', 'app/live', LV({ msg: { ko: '가'.repeat(80), en: 'a'.repeat(80) } }), 'allow');
add('live.msg-81', 'a notice of 81 characters is refused', 'admin', 'create', 'app/live', LV({ msg: { ko: '가'.repeat(81), en: '' } }), 'deny', { code: 'invalid-argument' });
add('live.msg-key', 'a notice may only carry ko / en', 'admin', 'create', 'app/live', LV({ msg: { ko: 'a', fr: 'b' } }), 'deny', { code: 'invalid-argument' });
add('live.poll-25', 'poll id of 25 characters is refused', 'admin', 'create', 'app/live', LV({ poll: 'p'.repeat(25) }), 'deny', { code: 'invalid-argument' });
add('live.quiet-type', 'quiet must be a bool', 'admin', 'create', 'app/live', LV({ quiet: 1 }), 'deny', { code: 'invalid-argument' });
add('live.extra-key', 'an unknown field is refused', 'admin', 'create', 'app/live', LV({ secret: 1 }), 'deny', { code: 'invalid-argument' });
add('live.anon-get', 'everyone reads app/live', 'anon', 'get', 'app/live', null, 'allow', { seed: LV_SEED });
add('live.admin-delete', 'nobody deletes app/live', 'admin', 'delete', 'app/live', null, 'deny', { seed: LV_SEED });

// ---------------------------------------------------------------------------------------------------- checkins
const CI = (o = {}) => ({ via: 'phone', createdAt: '@ts', ...o });
const CI_SEED = [{ path: 'checkins/gA', data: { via: 'phone', createdAt: OLD } }];
for (const via of ['phone', 'kiosk', 'entrance']) add('checkins.anon-' + via, `a guest checks in (${via})`, 'anon', 'create', 'checkins/gA', CI({ via }), 'allow');
add('checkins.admin-admin', 'an admin checks a guest in (via admin)', 'admin', 'create', 'checkins/gA', CI({ via: 'admin' }), 'allow');
add('checkins.anon-via-admin', 'anonymous cannot use via "admin"', 'anon', 'create', 'checkins/gA', CI({ via: 'admin' }), 'deny', { deny: 3, code: 'permission-denied' });
add('checkins.other-via-admin', 'a signed-in non-admin cannot use via "admin"', 'other', 'create', 'checkins/gA', CI({ via: 'admin' }), 'deny', { deny: 3, code: 'permission-denied' });
add('checkins.no-guest', 'checking in a guest that does not exist is refused', 'anon', 'create', 'checkins/gZ', CI(), 'deny', { deny: 3, code: 'permission-denied' });
add('checkins.second', 'a second check-in (= an update) is refused', 'anon', 'set', 'checkins/gA', CI({ via: 'kiosk' }), 'deny', { deny: 3, seed: CI_SEED, code: 'permission-denied' });
add('checkins.admin-second', 'not even an admin may rewrite a check-in', 'admin', 'set', 'checkins/gA', CI({ via: 'admin' }), 'deny', { seed: CI_SEED, code: 'permission-denied' });
add('checkins.bad-via', 'via must be one of the four', 'anon', 'create', 'checkins/gA', CI({ via: 'teleport' }), 'deny', { code: 'invalid-argument' });
add('checkins.client-time', 'createdAt chosen by the client is refused', 'anon', 'create', 'checkins/gA', CI({ createdAt: '@client' }), 'deny', { code: 'invalid-argument' });
add('checkins.extra-key', 'an unknown field is refused', 'anon', 'create', 'checkins/gA', CI({ note: 'x' }), 'deny', { code: 'invalid-argument' });
add('checkins.anon-get', 'everyone reads a check-in', 'anon', 'get', 'checkins/gA', null, 'allow', { seed: CI_SEED });
add('checkins.anon-list', 'everyone lists check-ins', 'anon', 'list', 'checkins', null, 'allow', { seed: CI_SEED });
add('checkins.anon-delete', 'anonymous cannot undo a check-in', 'anon', 'delete', 'checkins/gA', null, 'deny', { seed: CI_SEED, code: 'permission-denied' });
add('checkins.admin-delete', 'an admin undoes a check-in', 'admin', 'delete', 'checkins/gA', null, 'allow', { seed: CI_SEED });

// ---------------------------------------------------------------------------------------------------- translations
const TR = (o = {}) => ({ src: 'ko', ko: '안녕하세요', en: 'Hello', engine: 'builtin', updatedAt: '@ts', ...o });
const TR_SEED = [{ path: 'translations/gA', data: { src: 'ko', ko: '안녕', en: 'Hi', engine: 'builtin', updatedAt: OLD } }];
add('translations.admin-create', 'admin saves a translation', 'admin', 'create', 'translations/gA', TR(), 'allow');
add('translations.admin-update', 'admin edits a translation', 'admin', 'update', 'translations/gA', { en: 'Hello!', updatedAt: '@ts' }, 'allow', { seed: TR_SEED });
add('translations.anon-create', 'anonymous cannot save a translation', 'anon', 'create', 'translations/gA', TR(), 'deny', { code: 'permission-denied' });
add('translations.other-update', 'a signed-in non-admin cannot edit a translation', 'other', 'update', 'translations/gA', { en: 'x', updatedAt: '@ts' }, 'deny', { seed: TR_SEED, code: 'permission-denied' });
add('translations.600', 'a translation of 600 characters is fine', 'admin', 'create', 'translations/gA', TR({ ko: '가'.repeat(600), en: 'a'.repeat(600) }), 'allow');
add('translations.601', 'a translation of 601 characters is refused', 'admin', 'create', 'translations/gA', TR({ en: 'a'.repeat(601) }), 'deny', { code: 'invalid-argument' });
add('translations.src', 'src must be ko or en', 'admin', 'create', 'translations/gA', TR({ src: 'fr' }), 'deny', { code: 'invalid-argument' });
add('translations.engine-20', 'engine of 21 characters is refused', 'admin', 'create', 'translations/gA', TR({ engine: 'e'.repeat(21) }), 'deny', { code: 'invalid-argument' });
add('translations.anon-get', 'everyone reads translations', 'anon', 'get', 'translations/gA', null, 'allow', { seed: TR_SEED });
add('translations.anon-list', 'everyone lists translations', 'anon', 'list', 'translations', null, 'allow', { seed: TR_SEED });
add('translations.anon-delete', 'anonymous cannot delete a translation', 'anon', 'delete', 'translations/gA', null, 'deny', { seed: TR_SEED });
add('translations.admin-delete', 'admin deletes a translation', 'admin', 'delete', 'translations/gA', null, 'allow', { seed: TR_SEED });

// ---------------------------------------------------------------------------------------------------- bingo
const BG = (o = {}) => ({ done: ['m0', 'm1'], lines: 0, updatedAt: '@ts', ...o });
const BG_SEED = (updatedAt) => [{ path: 'bingo/gA', data: { done: ['m0', 'm1'], lines: 1, updatedAt } }];
add('bingo.anon-create', 'a guest starts a bingo card', 'anon', 'create', 'bingo/gA', BG(), 'allow');
add('bingo.16-cells', 'sixteen cells are fine', 'anon', 'create', 'bingo/gA', BG({ done: Array.from({ length: 16 }, (_, i) => 'm' + i), lines: 10 }), 'allow');
add('bingo.17-cells', 'seventeen cells are refused', 'anon', 'create', 'bingo/gA', BG({ done: Array.from({ length: 17 }, (_, i) => 'm' + i) }), 'deny', { deny: 4, code: 'invalid-argument' });
add('bingo.m24', 'mission m24 does not exist', 'anon', 'create', 'bingo/gA', BG({ done: ['m24'] }), 'deny', { deny: 4, code: 'invalid-argument' });
add('bingo.m23', 'mission m23 is the last one', 'anon', 'create', 'bingo/gA', BG({ done: ['m23'] }), 'allow');
add('bingo.lines-11', 'lines above 10 are refused', 'anon', 'create', 'bingo/gA', BG({ lines: 11 }), 'deny', { code: 'invalid-argument' });
add('bingo.lines-neg', 'negative lines are refused', 'anon', 'create', 'bingo/gA', BG({ lines: -1 }), 'deny', { code: 'invalid-argument' });
add('bingo.done-type', 'done must be a list', 'anon', 'create', 'bingo/gA', BG({ done: 'm0' }), 'deny', { code: 'invalid-argument' });
add('bingo.no-guest', 'a card for a guest that does not exist is refused', 'anon', 'create', 'bingo/gZ', BG(), 'deny', { deny: 3, code: 'permission-denied' });
add('bingo.grow', 'a cell may be added later', 'anon', 'set', 'bingo/gA', BG({ done: ['m0', 'm1', 'm2'], lines: 1 }), 'allow', { seed: BG_SEED(OLD) });
add('bingo.same', 'the same cells again are fine', 'anon', 'set', 'bingo/gA', BG({ done: ['m0', 'm1'], lines: 1 }), 'allow', { seed: BG_SEED(OLD) });
add('bingo.shrink', 'a cell cannot be taken back', 'anon', 'set', 'bingo/gA', BG({ done: ['m0'], lines: 1 }), 'deny', { deny: 4, seed: BG_SEED(OLD), code: 'permission-denied' });
add('bingo.lines-down', 'lines cannot go down', 'anon', 'set', 'bingo/gA', BG({ done: ['m0', 'm1'], lines: 0 }), 'deny', { deny: 4, seed: BG_SEED(OLD), code: 'permission-denied' });
add('bingo.too-fast', 'a second update within one second is refused', 'anon', 'set', 'bingo/gA', BG({ done: ['m0', 'm1', 'm2'], lines: 1 }), 'deny', { deny: 4, seed: BG_SEED(NOW), code: 'permission-denied' });
add('bingo.client-time', 'updatedAt chosen by the client is refused', 'anon', 'create', 'bingo/gA', BG({ updatedAt: '@client' }), 'deny', { code: 'invalid-argument' });
add('bingo.anon-get', 'everyone reads a bingo card', 'anon', 'get', 'bingo/gA', null, 'allow', { seed: BG_SEED(OLD) });
add('bingo.anon-list', 'everyone lists bingo cards', 'anon', 'list', 'bingo', null, 'allow', { seed: BG_SEED(OLD) });
add('bingo.anon-delete', 'anonymous cannot delete a bingo card', 'anon', 'delete', 'bingo/gA', null, 'deny', { seed: BG_SEED(OLD) });
add('bingo.admin-delete', 'admin deletes a bingo card', 'admin', 'delete', 'bingo/gA', null, 'allow', { seed: BG_SEED(OLD) });

// ---------------------------------------------------------------------------------------------------- polls
const PQ = (o = {}) => ({ q: { ko: '질문', en: 'Question' }, kind: 'choice', options: ['a', 'b', 'c'], open: true, order: 1, createdAt: '@ts', updatedAt: '@ts', ...o });
const poll = (o = {}) => ({ q: { ko: '질문', en: 'Question' }, kind: 'choice', options: ['a', 'b', 'c'], open: true, order: 1, createdAt: OLD, updatedAt: OLD, ...o });
const PL_SEED = [{ path: 'polls/p1', data: poll() }];
add('polls.admin-create', 'admin creates a poll', 'admin', 'create', 'polls/p1', PQ(), 'allow');
add('polls.admin-update', 'admin closes a poll', 'admin', 'update', 'polls/p1', { open: false, result: { top: 1 }, updatedAt: '@ts' }, 'allow', { seed: PL_SEED });
add('polls.anon-create', 'anonymous cannot create a poll', 'anon', 'create', 'polls/p1', PQ(), 'deny', { code: 'permission-denied' });
add('polls.other-update', 'a signed-in non-admin cannot change a poll', 'other', 'update', 'polls/p1', { open: false, updatedAt: '@ts' }, 'deny', { seed: PL_SEED, code: 'permission-denied' });
add('polls.id-13', 'poll id "p" + 12 characters is fine', 'admin', 'create', 'polls/p' + 'a1b2c3d4e5f6', PQ(), 'allow');
add('polls.id-14', 'poll id longer than that is refused', 'admin', 'create', 'polls/p' + 'a1b2c3d4e5f67', PQ(), 'deny', { code: 'invalid-argument' });
add('polls.id-upper', 'poll id must be lowercase', 'admin', 'create', 'polls/pAB', PQ(), 'deny', { code: 'invalid-argument' });
add('polls.id-bare-p', 'poll id "p" alone is refused', 'admin', 'create', 'polls/p', PQ(), 'deny', { code: 'invalid-argument' });
add('polls.id-no-p', 'poll id must start with p', 'admin', 'create', 'polls/q1', PQ(), 'deny', { code: 'invalid-argument' });
add('polls.8-options', 'eight options are fine', 'admin', 'create', 'polls/p1', PQ({ options: Array.from({ length: 8 }, (_, i) => 'o' + i) }), 'allow');
add('polls.9-options', 'nine options are refused', 'admin', 'create', 'polls/p1', PQ({ options: Array.from({ length: 9 }, (_, i) => 'o' + i) }), 'deny', { code: 'invalid-argument' });
add('polls.guest-kind', 'a "pick a guest" poll', 'admin', 'create', 'polls/p1', PQ({ kind: 'guest', options: [] }), 'allow');
add('polls.kind', 'kind must be choice or guest', 'admin', 'create', 'polls/p1', PQ({ kind: 'essay' }), 'deny', { code: 'invalid-argument' });
add('polls.q-120', 'a question of 120 characters is fine', 'admin', 'create', 'polls/p1', PQ({ q: { ko: '가'.repeat(120), en: 'a'.repeat(120) } }), 'allow');
add('polls.q-121', 'a question of 121 characters is refused', 'admin', 'create', 'polls/p1', PQ({ q: { ko: '가'.repeat(121), en: 'a' } }), 'deny', { code: 'invalid-argument' });
add('polls.open-type', 'open must be a bool', 'admin', 'create', 'polls/p1', PQ({ open: 'yes' }), 'deny', { code: 'invalid-argument' });
add('polls.order-type', 'order must be an int', 'admin', 'create', 'polls/p1', PQ({ order: 1.5 }), 'deny', { code: 'invalid-argument' });
add('polls.result-type', 'result must be a map', 'admin', 'create', 'polls/p1', PQ({ result: 'x' }), 'deny', { code: 'invalid-argument' });
add('polls.anon-get', 'everyone reads a poll', 'anon', 'get', 'polls/p1', null, 'allow', { seed: PL_SEED });
add('polls.anon-list', 'everyone lists polls', 'anon', 'list', 'polls', null, 'allow', { seed: PL_SEED });
add('polls.anon-delete', 'anonymous cannot delete a poll', 'anon', 'delete', 'polls/p1', null, 'deny', { seed: PL_SEED });
add('polls.admin-delete', 'admin deletes a poll', 'admin', 'delete', 'polls/p1', null, 'allow', { seed: PL_SEED });

// ---------------------------------------------------------------------------------------------------- votes
const VT = (pid, gid, choice, o = {}) => ({ pid, gid, choice, updatedAt: '@ts', ...o });
const VP = [{ path: 'polls/p1', data: poll() }, { path: 'polls/p2', data: poll({ open: false }) }, { path: 'polls/p3', data: poll({ kind: 'guest', options: [] }) }];
add('votes.anon-create', 'a guest votes in an open poll', 'anon', 'create', 'votes/p1_gA', VT('p1', 'gA', 1), 'allow', { seed: VP });
add('votes.first-option', 'option 0 is a valid choice', 'anon', 'create', 'votes/p1_gA', VT('p1', 'gA', 0), 'allow', { seed: VP });
add('votes.last-option', 'the last option (2 of 3) is a valid choice', 'anon', 'create', 'votes/p1_gA', VT('p1', 'gA', 2), 'allow', { seed: VP });
add('votes.closed', 'a closed poll takes no votes', 'anon', 'create', 'votes/p2_gA', VT('p2', 'gA', 1), 'deny', { deny: 5, seed: VP, code: 'permission-denied' });
add('votes.range-high', 'choice beyond the options is refused', 'anon', 'create', 'votes/p1_gA', VT('p1', 'gA', 3), 'deny', { deny: 5, seed: VP, code: 'invalid-argument' });
add('votes.range-low', 'a negative choice is refused', 'anon', 'create', 'votes/p1_gA', VT('p1', 'gA', -1), 'deny', { deny: 5, seed: VP, code: 'invalid-argument' });
add('votes.choice-type', 'a choice poll needs an int', 'anon', 'create', 'votes/p1_gA', VT('p1', 'gA', 'b'), 'deny', { deny: 5, seed: VP, code: 'invalid-argument' });
add('votes.guest-poll', 'a "pick a guest" poll takes a guest id', 'anon', 'create', 'votes/p3_gA', VT('p3', 'gA', 'gB'), 'allow', { seed: VP });
add('votes.guest-missing', 'a "pick a guest" vote for a guest that does not exist is refused', 'anon', 'create', 'votes/p3_gA', VT('p3', 'gA', 'gZ'), 'deny', { deny: 5, seed: VP, code: 'permission-denied' });
add('votes.guest-type', 'a "pick a guest" vote needs a string', 'anon', 'create', 'votes/p3_gA', VT('p3', 'gA', 1), 'deny', { seed: VP, code: 'invalid-argument' });
add('votes.other-name', 'voting under another guest’s name (gid ≠ the id suffix) is refused', 'anon', 'create', 'votes/p1_gA', VT('p1', 'gB', 1), 'deny', { deny: 5, seed: VP, code: 'permission-denied' });
add('votes.other-pid', 'pid must match the id prefix', 'anon', 'create', 'votes/p1_gA', VT('p3', 'gA', 1), 'deny', { seed: VP, code: 'permission-denied' });
add('votes.no-guest', 'a vote from a guest that does not exist is refused', 'anon', 'create', 'votes/p1_gZ', VT('p1', 'gZ', 1), 'deny', { deny: 3, seed: VP, code: 'permission-denied' });
add('votes.no-poll', 'a vote in a poll that does not exist is refused', 'anon', 'create', 'votes/p9_gA', VT('p9', 'gA', 1), 'deny', { seed: VP, code: 'permission-denied' });
add('votes.bad-id', 'a vote id must be <pollId>_<guestId>', 'anon', 'create', 'votes/p1gA', VT('p1', 'gA', 1), 'deny', { seed: VP, code: 'invalid-argument' });
add('votes.extra-key', 'an unknown field is refused', 'anon', 'create', 'votes/p1_gA', VT('p1', 'gA', 1, { weight: 5 }), 'deny', { seed: VP, code: 'invalid-argument' });
add('votes.client-time', 'updatedAt chosen by the client is refused', 'anon', 'create', 'votes/p1_gA', VT('p1', 'gA', 1, { updatedAt: '@client' }), 'deny', { seed: VP, code: 'invalid-argument' });
const VOTED = t => [...VP, { path: 'votes/p1_gA', data: { pid: 'p1', gid: 'gA', choice: 0, updatedAt: t } }];
add('votes.change', 'a vote can be changed after two seconds', 'anon', 'set', 'votes/p1_gA', VT('p1', 'gA', 2), 'allow', { seed: VOTED(OLD) });
add('votes.change-fast', 'a vote cannot be changed within two seconds', 'anon', 'set', 'votes/p1_gA', VT('p1', 'gA', 2), 'deny', { deny: 5, seed: VOTED(NOW), code: 'permission-denied' });
add('votes.change-closed', 'a vote cannot be changed once the poll is closed', 'anon', 'set', 'votes/p2_gA', VT('p2', 'gA', 2), 'deny', { seed: [...VP, { path: 'votes/p2_gA', data: { pid: 'p2', gid: 'gA', choice: 0, updatedAt: OLD } }], code: 'permission-denied' });
add('votes.anon-get', 'everyone reads a vote', 'anon', 'get', 'votes/p1_gA', null, 'allow', { seed: VOTED(OLD) });
add('votes.anon-list', 'everyone lists votes', 'anon', 'list', 'votes', null, 'allow', { seed: VOTED(OLD) });
add('votes.anon-delete', 'anonymous cannot delete a vote', 'anon', 'delete', 'votes/p1_gA', null, 'deny', { seed: VOTED(OLD) });
add('votes.admin-delete', 'admin deletes a vote', 'admin', 'delete', 'votes/p1_gA', null, 'allow', { seed: VOTED(OLD) });

// ---------------------------------------------------------------------------------------------------- thanks
const TH = (o = {}) => ({ gid: 'gA', name: 'Kim', note: { ko: '와주셔서 감사합니다', en: 'Thank you for coming' }, photo: null, theme: 'classic', createdAt: '@ts', updatedAt: '@ts', ...o });
const TH_SEED = [{ path: 'thanks/' + TOKEN, data: { gid: 'gA', name: 'Kim', note: { ko: 'a', en: 'b' }, photo: null, theme: 'classic', createdAt: OLD, updatedAt: OLD } }];
const SHORT = 'abcdefghijklmnopqrs';   // 19
add('thanks.admin-create', 'admin writes a thank-you card', 'admin', 'create', 'thanks/' + TOKEN, TH(), 'allow');
add('thanks.admin-photo', 'a card may carry a data-URL photo', 'admin', 'create', 'thanks/' + TOKEN, TH({ photo: IMG }), 'allow');
add('thanks.admin-update', 'admin edits a card', 'admin', 'update', 'thanks/' + TOKEN, { theme: 'night', updatedAt: '@ts' }, 'allow', { seed: TH_SEED });
add('thanks.anon-create', 'anonymous cannot write a card', 'anon', 'create', 'thanks/' + TOKEN, TH(), 'deny', { deny: 6, code: 'permission-denied' });
add('thanks.other-create', 'a signed-in non-admin cannot write a card', 'other', 'create', 'thanks/' + TOKEN, TH(), 'deny', { deny: 6, code: 'permission-denied' });
add('thanks.anon-get', 'whoever knows the token reads the card', 'anon', 'get', 'thanks/' + TOKEN, null, 'allow', { seed: TH_SEED });
add('thanks.short-get', 'a 19-character token is refused', 'anon', 'get', 'thanks/' + SHORT, null, 'deny', { deny: 6, code: 'permission-denied' });
add('thanks.40-get', 'a 40-character token is fine', 'anon', 'get', 'thanks/' + 'a'.repeat(40), null, 'allow', { seed: [{ path: 'thanks/' + 'a'.repeat(40), data: TH_SEED[0].data }] });
add('thanks.41-get', 'a 41-character token is refused', 'anon', 'get', 'thanks/' + 'a'.repeat(41), null, 'deny', { code: 'permission-denied' });
add('thanks.anon-list', 'anonymous cannot list the cards', 'anon', 'list', 'thanks', null, 'deny', { deny: 6, seed: TH_SEED, code: 'permission-denied' });
add('thanks.other-list', 'a signed-in non-admin cannot list the cards', 'other', 'list', 'thanks', null, 'deny', { seed: TH_SEED, code: 'permission-denied' });
add('thanks.admin-list', 'admin lists the cards', 'admin', 'list', 'thanks', null, 'allow', { seed: TH_SEED });
add('thanks.short-create', 'admin cannot create a card under a short token', 'admin', 'create', 'thanks/' + SHORT, TH(), 'deny', { code: 'invalid-argument' });
add('thanks.theme', 'theme must be classic, garden or night', 'admin', 'create', 'thanks/' + TOKEN, TH({ theme: 'neon' }), 'deny', { code: 'invalid-argument' });
add('thanks.note-600', 'a note of 600 characters is fine', 'admin', 'create', 'thanks/' + TOKEN, TH({ note: { ko: '가'.repeat(600), en: 'a'.repeat(600) } }), 'allow');
add('thanks.note-601', 'a note of 601 characters is refused', 'admin', 'create', 'thanks/' + TOKEN, TH({ note: { ko: '가'.repeat(601), en: 'a' } }), 'deny', { code: 'invalid-argument' });
add('thanks.photo-link', 'a photo that is a link is refused', 'admin', 'create', 'thanks/' + TOKEN, TH({ photo: 'https://example.com/a.jpg' }), 'deny', { code: 'invalid-argument' });
add('thanks.name-31', 'a name of 31 characters is refused', 'admin', 'create', 'thanks/' + TOKEN, TH({ name: 'n'.repeat(31) }), 'deny', { code: 'invalid-argument' });
add('thanks.gid-65', 'a gid of 65 characters is refused', 'admin', 'create', 'thanks/' + TOKEN, TH({ gid: 'g'.repeat(65) }), 'deny', { code: 'invalid-argument' });
add('thanks.anon-delete', 'anonymous cannot delete a card', 'anon', 'delete', 'thanks/' + TOKEN, null, 'deny', { seed: TH_SEED });
add('thanks.admin-delete', 'admin deletes a card', 'admin', 'delete', 'thanks/' + TOKEN, null, 'allow', { seed: TH_SEED });

// ---------------------------------------------------------------------------------------------------- postcards · postcardImages
const PC = (o = {}) => ({ title: { ko: '파리', en: 'Paris' }, msg: { ko: '안녕', en: 'Hello' }, place: 'Paris', theme: 'city', thumb: IMG, order: 1, createdAt: '@ts', updatedAt: '@ts', ...o });
const PC_SEED = [{ path: 'postcards/c1', data: { title: { ko: '파리', en: 'Paris' }, place: 'Paris', theme: 'city', thumb: IMG, order: 1, createdAt: OLD, updatedAt: OLD } }];
add('postcards.admin-create', 'admin creates a postcard', 'admin', 'create', 'postcards/c1', PC(), 'allow');
add('postcards.no-msg', 'msg is optional', 'admin', 'create', 'postcards/c1', (() => { const d = PC(); delete d.msg; return d; })(), 'allow');
add('postcards.admin-update', 'admin edits a postcard', 'admin', 'update', 'postcards/c1', { place: 'Nice', updatedAt: '@ts' }, 'allow', { seed: PC_SEED });
add('postcards.anon-create', 'anonymous cannot create a postcard', 'anon', 'create', 'postcards/c1', PC(), 'deny', { code: 'permission-denied' });
add('postcards.thumb-link', 'a thumbnail that is a link is refused', 'admin', 'create', 'postcards/c1', PC({ thumb: 'https://example.com/a.jpg' }), 'deny', { deny: 7, code: 'invalid-argument' });
add('postcards.thumb-199999', 'a thumbnail just under 200 KB is fine', 'admin', 'create', 'postcards/c1', PC({ thumb: fill(IMG_PREFIX, 199999) }), 'allow');
add('postcards.thumb-200000', 'a thumbnail of 200 KB is refused', 'admin', 'create', 'postcards/c1', PC({ thumb: fill(IMG_PREFIX, 200000) }), 'deny', { deny: 7, code: 'invalid-argument' });
add('postcards.theme', 'theme must be one of the six', 'admin', 'create', 'postcards/c1', PC({ theme: 'space' }), 'deny', { code: 'invalid-argument' });
add('postcards.title-61', 'a title of 61 characters is refused', 'admin', 'create', 'postcards/c1', PC({ title: { ko: '가'.repeat(61), en: 'a' } }), 'deny', { code: 'invalid-argument' });
add('postcards.place-41', 'a place of 41 characters is refused', 'admin', 'create', 'postcards/c1', PC({ place: 'p'.repeat(41) }), 'deny', { code: 'invalid-argument' });
add('postcards.msg-301', 'a message of 301 characters is refused', 'admin', 'create', 'postcards/c1', PC({ msg: { ko: '가'.repeat(301), en: 'a' } }), 'deny', { code: 'invalid-argument' });
add('postcards.order-type', 'order must be an int', 'admin', 'create', 'postcards/c1', PC({ order: '1' }), 'deny', { code: 'invalid-argument' });
add('postcards.anon-get', 'everyone reads a postcard', 'anon', 'get', 'postcards/c1', null, 'allow', { seed: PC_SEED });
add('postcards.anon-list', 'everyone lists postcards', 'anon', 'list', 'postcards', null, 'allow', { seed: PC_SEED });
add('postcards.anon-delete', 'anonymous cannot delete a postcard', 'anon', 'delete', 'postcards/c1', null, 'deny', { seed: PC_SEED });
add('postcards.admin-delete', 'admin deletes a postcard', 'admin', 'delete', 'postcards/c1', null, 'allow', { seed: PC_SEED });

const PI = (o = {}) => ({ data: IMG, updatedAt: '@ts', ...o });
const PI_SEED = [{ path: 'postcardImages/c1', data: { data: IMG, updatedAt: OLD } }];
add('images.admin-create', 'admin stores the big photo', 'admin', 'create', 'postcardImages/c1', PI(), 'allow');
add('images.admin-update', 'admin replaces the big photo', 'admin', 'update', 'postcardImages/c1', { data: IMG + 'A', updatedAt: '@ts' }, 'allow', { seed: PI_SEED });
add('images.anon-create', 'anonymous cannot store a photo', 'anon', 'create', 'postcardImages/c1', PI(), 'deny', { code: 'permission-denied' });
add('images.link', 'a photo that is a link is refused', 'admin', 'create', 'postcardImages/c1', PI({ data: 'https://example.com/a.jpg' }), 'deny', { deny: 7, code: 'invalid-argument' });
add('images.899999', 'a photo just under 900 KB is fine', 'admin', 'create', 'postcardImages/c1', PI({ data: fill(IMG_PREFIX, 899999) }), 'allow');
add('images.900000', 'a photo of 900 KB is refused', 'admin', 'create', 'postcardImages/c1', PI({ data: fill(IMG_PREFIX, 900000) }), 'deny', { deny: 7, code: 'invalid-argument' });
add('images.not-image', 'only image data URLs are accepted', 'admin', 'create', 'postcardImages/c1', PI({ data: 'data:text/html;base64,PGI+' }), 'deny', { code: 'invalid-argument' });
add('images.anon-get', 'everyone reads a photo', 'anon', 'get', 'postcardImages/c1', null, 'allow', { seed: PI_SEED });
add('images.anon-delete', 'anonymous cannot delete a photo', 'anon', 'delete', 'postcardImages/c1', null, 'deny', { seed: PI_SEED });
add('images.admin-delete', 'admin deletes a photo', 'admin', 'delete', 'postcardImages/c1', null, 'allow', { seed: PI_SEED });

// ---------------------------------------------------------------------------------------------------- anniv (open 2028-04-03 … 04-23, UTC)
const AN = (o = {}) => ({ text: '1주년 축하해요', createdAt: '@ts', ...o });
const WIN = [Date.UTC(2028, 3, 3), Date.UTC(2028, 3, 24)];
const AN_SEED = [{ path: 'anniv/gA', data: { text: 'hi', createdAt: OLD } }];
add('anniv.in-window', 'a guest leaves a note inside the window', 'anon', 'create', 'anniv/gA', AN(), 'allow', { window: WIN, clock: '2028-04-10T12:00:00Z' });
add('anniv.first-second', 'the window opens 2028-04-03 00:00 UTC', 'anon', 'create', 'anniv/gA', AN(), 'allow', { window: WIN, clock: '2028-04-03T00:00:00Z' });
add('anniv.last-second', 'the window is still open 2028-04-23 23:59:59 UTC', 'anon', 'create', 'anniv/gA', AN(), 'allow', { window: WIN, clock: '2028-04-23T23:59:59Z' });
add('anniv.before-window', 'a note before the window is refused', 'anon', 'create', 'anniv/gA', AN(), 'deny', { window: WIN, clock: '2028-04-02T23:59:59Z', code: 'permission-denied' });
add('anniv.after-window', 'a note after 2028-04-24 is refused', 'anon', 'create', 'anniv/gA', AN(), 'deny', { deny: 8, window: WIN, clock: '2028-04-24T00:00:00Z', code: 'permission-denied' });
add('anniv.today', 'a note today (outside the window) is refused', 'anon', 'create', 'anniv/gA', AN(), 'deny', { window: WIN, code: 'permission-denied' });
add('anniv.300', 'a note of 300 characters is fine (in the window)', 'anon', 'create', 'anniv/gA', AN({ text: '가'.repeat(300) }), 'allow', { window: WIN, clock: '2028-04-10T12:00:00Z' });
add('anniv.301', 'a note of 301 characters is refused', 'anon', 'create', 'anniv/gA', AN({ text: '가'.repeat(301) }), 'deny', { deny: 8, clock: '2028-04-10T12:00:00Z', code: 'invalid-argument' });
add('anniv.empty', 'an empty note is refused', 'anon', 'create', 'anniv/gA', AN({ text: '' }), 'deny', { clock: '2028-04-10T12:00:00Z', code: 'invalid-argument' });
add('anniv.no-guest', 'a note from a guest that does not exist is refused', 'anon', 'create', 'anniv/gZ', AN(), 'deny', { deny: 3, clock: '2028-04-10T12:00:00Z', code: 'permission-denied' });
add('anniv.second', 'a second note (= an update) is refused', 'anon', 'set', 'anniv/gA', AN({ text: 'again' }), 'deny', { seed: AN_SEED, clock: '2028-04-10T12:00:00Z', code: 'permission-denied' });
add('anniv.anon-get', 'everyone reads a note', 'anon', 'get', 'anniv/gA', null, 'allow', { seed: AN_SEED });
add('anniv.anon-list', 'everyone lists notes', 'anon', 'list', 'anniv', null, 'allow', { seed: AN_SEED });
add('anniv.anon-delete', 'anonymous cannot delete a note', 'anon', 'delete', 'anniv/gA', null, 'deny', { seed: AN_SEED });
add('anniv.admin-delete', 'admin deletes a note', 'admin', 'delete', 'anniv/gA', null, 'allow', { seed: AN_SEED });

// ---------------------------------------------------------------------------------------------------- docdb boundaries (demo only — the rules have no opinion)
add('docdb.v3-photos', 'docdb never touches photos (v3.2 collection)', 'admin', 'get', 'photos/gA', null, 'deny', { demoOnly: true, code: 'permission-denied' });
add('docdb.v3-guests-create', 'docdb never writes guests', 'anon', 'create', 'guests/gX', { name: 'X', side: 'both', message: '', avatar: {}, hidden: false, hasPhoto: false, createdAt: '@ts' }, 'deny', { demoOnly: true, code: 'permission-denied' });
add('docdb.v3-guests-get', 'docdb reads guests', 'anon', 'get', 'guests/gA', null, 'allow', { demoOnly: true });
add('docdb.v3-guests-list', 'docdb lists guests', 'anon', 'list', 'guests', null, 'allow', { demoOnly: true });
add('docdb.unknown', 'a path that is not declared is unknown-path', 'admin', 'get', 'whatever/x', null, 'deny', { demoOnly: true, code: 'unknown-path' });

// ---------------------------------------------------------------------------------------------------- v3.2 collections (store.js writes them) — the emulator runs these, the demo does not
const GUEST = (o = {}) => ({ name: 'Park', side: 'bride', message: 'congrats', avatar: { skin: 1, hair: 2 }, activity: 'walk', hidden: false, hasPhoto: false, hasVoice: false, hasCapsule: false, createdAt: '@ts', ...o });
const G_SEED = GUESTS.map(id => ({ path: 'guests/' + id, data: { name: 'Kim', side: 'groom', message: '', avatar: { skin: 1 }, activity: 'walk', hidden: false, hasPhoto: false, createdAt: OLD } }));
const R = (id, name, actor, op, path, data, expect, extra = {}) => add(id, name, actor, op, path, data, expect, { rulesOnly: true, ...extra });
R('v32.guests-create', 'anyone may sign the guestbook', 'anon', 'create', 'guests/gN', GUEST(), 'allow');
R('v32.guests-hidden', 'a guest cannot create themselves hidden=true', 'anon', 'create', 'guests/gN', GUEST({ hidden: true }), 'deny');
R('v32.guests-name', 'a 31-character name is refused', 'anon', 'create', 'guests/gN', GUEST({ name: 'n'.repeat(31) }), 'deny');
R('v32.guests-get', 'everyone reads guests', 'anon', 'get', 'guests/gA', null, 'allow');
R('v32.guests-list', 'everyone lists guests', 'anon', 'list', 'guests', null, 'allow');
R('v32.guests-update-anon', 'anonymous cannot edit a guest', 'anon', 'update', 'guests/gA', { message: 'hacked' }, 'deny');
R('v32.guests-update-admin', 'admin edits a guest', 'admin', 'update', 'guests/gA', { message: 'edited' }, 'allow');
R('v32.guests-delete-anon', 'anonymous cannot delete a guest', 'anon', 'delete', 'guests/gA', null, 'deny');
R('v32.guests-delete-admin', 'admin deletes a guest', 'admin', 'delete', 'guests/gA', null, 'allow');
R('v32.photos-batch', 'a photo is created in the same batch as its guest (hasPhoto = true)', 'anon', 'batch', null, null, 'allow', { writes: [
  { op: 'create', path: 'guests/gN', data: GUEST({ hasPhoto: true }) }, { op: 'create', path: 'photos/gN', data: { data: IMG, createdAt: '@ts' } }] });
R('v32.photos-alone', 'a photo without its guest in the batch is refused', 'anon', 'create', 'photos/gA', { data: IMG, createdAt: '@ts' }, 'deny');
R('v32.photos-get-anon', 'anonymous cannot read a photo', 'anon', 'get', 'photos/gA', null, 'deny', { seed: [{ path: 'photos/gA', data: { data: IMG, createdAt: OLD } }] });
R('v32.photos-get-admin', 'admin reads a photo', 'admin', 'get', 'photos/gA', null, 'allow', { seed: [{ path: 'photos/gA', data: { data: IMG, createdAt: OLD } }] });
R('v32.photos-update', 'a photo is never updated', 'admin', 'update', 'photos/gA', { data: IMG + 'A' }, 'deny', { seed: [{ path: 'photos/gA', data: { data: IMG, createdAt: OLD } }] });
R('v32.voices-get-anon', 'anonymous cannot read a voice message', 'anon', 'get', 'voices/gA', null, 'deny', { seed: [{ path: 'voices/gA', data: { data: 'data:audio/webm;base64,AAAA', mime: 'audio/webm', createdAt: OLD } }] });
R('v32.capsules-get-anon', 'anonymous cannot read a capsule', 'anon', 'get', 'capsules/gA', null, 'deny', { seed: [{ path: 'capsules/gA', data: { text: 'hello', name: 'Kim', createdAt: OLD } }] });
R('v32.capsules-before-date', 'not even an admin reads a capsule before 2028-04-10', 'admin', 'get', 'capsules/gA', null, 'deny', { window: [Date.UTC(2028, 3, 10), Infinity], seed: [{ path: 'capsules/gA', data: { text: 'hello', name: 'Kim', createdAt: OLD } }] });
R('v32.capsules-after-date', 'admin reads a capsule from 2028-04-10 on', 'admin', 'get', 'capsules/gA', null, 'allow', { window: [Date.UTC(2028, 3, 10), Infinity], seed: [{ path: 'capsules/gA', data: { text: 'hello', name: 'Kim', createdAt: OLD } }] });
R('v32.snaps-create', 'a guest uploads a snap (slot 0)', 'anon', 'create', 'snaps/gA_0', { gid: 'gA', name: 'Kim', caption: 'cheers', data: IMG, hidden: false, createdAt: '@ts' }, 'allow');
R('v32.snaps-slot-5', 'slot 5 is one too many', 'anon', 'create', 'snaps/gA_5', { gid: 'gA', name: 'Kim', caption: '', data: IMG, hidden: false, createdAt: '@ts' }, 'deny');
R('v32.snaps-stranger', 'a snap from a guest that does not exist is refused', 'anon', 'create', 'snaps/gZ_0', { gid: 'gZ', name: 'Z', caption: '', data: IMG, hidden: false, createdAt: '@ts' }, 'deny');
R('v32.snaps-hide-admin', 'admin hides a snap', 'admin', 'update', 'snaps/gA_0', { hidden: true }, 'allow', { seed: [{ path: 'snaps/gA_0', data: { gid: 'gA', name: 'Kim', caption: '', data: IMG, hidden: false, createdAt: OLD } }] });
R('v32.snaps-hide-anon', 'anonymous cannot hide a snap', 'anon', 'update', 'snaps/gA_0', { hidden: true }, 'deny', { seed: [{ path: 'snaps/gA_0', data: { gid: 'gA', name: 'Kim', caption: '', data: IMG, hidden: false, createdAt: OLD } }] });
R('v32.snaps-list', 'everyone lists snaps', 'anon', 'list', 'snaps', null, 'allow');
R('v32.pulse-create', 'a guest sends a first reaction', 'anon', 'create', 'pulse/gA', { type: 'heart', n: 1, createdAt: '@ts' }, 'allow');
R('v32.pulse-n-2', 'the first reaction must have n = 1', 'anon', 'create', 'pulse/gA', { type: 'heart', n: 2, createdAt: '@ts' }, 'deny');
R('v32.pulse-fast', 'a reaction within two seconds is refused', 'anon', 'update', 'pulse/gA', { type: 'clap', n: 2, createdAt: '@ts' }, 'deny', { seed: [{ path: 'pulse/gA', data: { type: 'heart', n: 1, createdAt: NOW } }] });
R('v32.pulse-ok', 'a reaction after two seconds is fine', 'anon', 'update', 'pulse/gA', { type: 'clap', n: 2, createdAt: '@ts' }, 'allow', { seed: [{ path: 'pulse/gA', data: { type: 'heart', n: 1, createdAt: OLD } }] });
R('v32.events-anon', 'anonymous cannot start an event', 'anon', 'create', 'events/e1', { type: 'bouquet', createdAt: '@ts' }, 'deny');
R('v32.events-admin', 'admin starts a bouquet', 'admin', 'create', 'events/e1', { type: 'bouquet', createdAt: '@ts' }, 'allow');
R('v32.events-type', 'an unknown event type is refused', 'admin', 'create', 'events/e1', { type: 'rain', createdAt: '@ts' }, 'deny');
R('v32.events-list', 'everyone lists events', 'anon', 'list', 'events', null, 'allow');
// v4 "only for the couple": guests.priv + notes/{id} (store.addGuest writes them in one batch)
const NOTE = { message: 'only for you two', createdAt: '@ts' };
R('v4.guests-priv', 'a guest marks the message private (public message empty)', 'anon', 'create', 'guests/gN', GUEST({ message: '', priv: true }), 'allow');
R('v4.guests-priv-text', 'priv = true with the text still in the public document is refused', 'anon', 'create', 'guests/gN', GUEST({ priv: true }), 'deny');
R('v4.guests-priv-false', 'priv = false with a message is fine', 'anon', 'create', 'guests/gN', GUEST({ priv: false }), 'allow');
R('v4.guests-priv-type', 'priv must be a bool', 'anon', 'create', 'guests/gN', GUEST({ message: '', priv: 'yes' }), 'deny');
R('v4.guests-priv-admin-edit', 'not even an admin flips priv afterwards', 'admin', 'update', 'guests/gA', { priv: true, message: '' }, 'deny');
R('v4.notes-batch', 'the private text is created in the same batch as its priv guest', 'anon', 'batch', null, null, 'allow', { writes: [
  { op: 'create', path: 'guests/gN', data: GUEST({ message: '', priv: true }) }, { op: 'create', path: 'notes/gN', data: NOTE }] });
R('v4.notes-not-priv', 'a note for a guest without priv is refused', 'anon', 'batch', null, null, 'deny', { writes: [
  { op: 'create', path: 'guests/gN', data: GUEST() }, { op: 'create', path: 'notes/gN', data: NOTE }] });
R('v4.notes-alone', 'a note without its guest in the batch is refused', 'anon', 'create', 'notes/gA', NOTE, 'deny');
R('v4.notes-empty', 'an empty note is refused', 'anon', 'batch', null, null, 'deny', { writes: [
  { op: 'create', path: 'guests/gN', data: GUEST({ message: '', priv: true }) }, { op: 'create', path: 'notes/gN', data: { message: '', createdAt: '@ts' } }] });
R('v4.notes-get-anon', 'anonymous cannot read a private note', 'anon', 'get', 'notes/gA', null, 'deny', { seed: [{ path: 'notes/gA', data: { message: 'secret', createdAt: OLD } }] });
R('v4.notes-list-anon', 'anonymous cannot list private notes', 'anon', 'list', 'notes', null, 'deny');
R('v4.notes-get-admin', 'admin reads a private note', 'admin', 'get', 'notes/gA', null, 'allow', { seed: [{ path: 'notes/gA', data: { message: 'secret', createdAt: OLD } }] });
R('v4.notes-update', 'a private note is never edited', 'admin', 'update', 'notes/gA', { message: 'edited' }, 'deny', { seed: [{ path: 'notes/gA', data: { message: 'secret', createdAt: OLD } }] });
R('v4.notes-delete-admin', 'admin deletes a private note (with its guest)', 'admin', 'delete', 'notes/gA', null, 'allow', { seed: [{ path: 'notes/gA', data: { message: 'secret', createdAt: OLD } }] });
R('v32.unknown-path', 'any other path is closed', 'admin', 'get', 'secrets/x', null, 'deny', { seed: [{ path: 'secrets/x', data: { v: 1 } }] });
R('v32.unknown-write', 'any other path is closed for writes too', 'admin', 'create', 'secrets/y', { v: 1 }, 'deny');

/** the documents every case starts with (besides its own seed): the two guests */
export const BASE_SEED = G_SEED;

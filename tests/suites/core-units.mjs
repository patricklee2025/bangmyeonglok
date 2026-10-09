// ============================================================
//  core-units (WP-00b) — v4 코어 모듈을 브라우저 안에서 직접 import 해 검사합니다 (docs/v4/04-testing.md §3.2).
//  페이지(guest/village/admin)를 거치지 않는 "빈 페이지 + 진짜 모듈" 방식이라 빠르고, 모듈이 서로 어떻게 엮이는지도 그대로 확인됩니다.
//
//  1단계: bus · phase · i18n 확장 · ui 도우미 · config.schedule
//  2단계(지금): schema 거울 · docdb · settings · deleteMany · tests/rules 표
//  3단계: features 로더 · resolveEnabled · gate · claim · texts/rootClass
// ============================================================
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadDictionary } from './core-static.mjs';
import { CASES, GUESTS } from '../rules/cases.mjs';
import { selfCheck } from '../rules/run.mjs';
import { inPage, UNIT_PAGE, BLANK, HELPERS, unitTools } from '../lib/units.mjs';

export const meta = { title: 'v4 core modules: phase, bus, i18n, ui helpers, schema mirror, docdb, settings, deleteMany', timeout: 240000 };

export default async (h) => {
  // 사전에 일부러 일으키는 오류가 콘솔로 나가는 경우만 허용
  h.allowErrors(/UNIT-INTENTIONAL/);

  const { open, unitPage } = unitTools(h);
  const page = await h.page('desktop', { tag: 'units' });
  await page.route(UNIT_PAGE, r => r.fulfill({ contentType: 'text/html', body: BLANK }));
  await open(page);

  // ---------------------------------------------------------------- config.schedule
  await h.step('config.schedule (03 §1)', async () => {
    const r = await inPage(page, async () => {
      const { CONFIG } = await import('/js/config.js'); const { liveWindow } = await import('/js/core/phase.js');
      const w = liveWindow(CONFIG.schedule);
      return { s: CONFIG.schedule, archive: CONFIG.archive, start: w.start, end: w.end, couple: CONFIG.couple.date };
    });
    h.eq('schedule values (03 §1)', r.s, { weddingDate: '2027-04-10', utcOffset: '-04:00', liveStartHour: 6, liveHours: 24, anniversaryDays: 7 });
    h.check('config.archive defaults to null', r.archive === null);
    h.check('liveWindow is finite, 24 h long, starts 2027-04-10 06:00 EDT', Number.isFinite(r.start) && r.end - r.start === 86400e3 && new Date(r.start).toISOString() === '2027-04-10T10:00:00.000Z', new Date(r.start).toISOString());
    h.check('couple.date matches schedule.weddingDate', r.couple.replace(/\./g, '-') === r.s.weddingDate, r.couple);
  });

  // ---------------------------------------------------------------- phaseAt
  await h.step('A6 phaseAt boundaries (03 §1)', async () => {
    const rows = [
      ['2027-04-10T05:59:59-04:00', 'pre'], ['2027-04-10T06:00:00-04:00', 'live'],
      ['2027-04-11T05:59:59-04:00', 'live'], ['2027-04-11T06:00:00-04:00', 'after'],
      ['2028-04-09T23:59:59-04:00', 'after'], ['2028-04-10T00:00:00-04:00', 'anniversary'],
      ['2028-04-17T00:00:00-04:00', 'after'], ['2029-04-12T12:00:00-04:00', 'anniversary'],
    ];
    const got = await inPage(page, async rows => {
      const { phaseAt } = await import('/js/core/phase.js'); const { CONFIG } = await import('/js/config.js');
      return rows.map(([s]) => phaseAt(Date.parse(s), CONFIG.schedule));
    }, rows);
    rows.forEach(([s, want], i) => h.eq(`A6 phaseAt(${s}) = ${want}`, got[i], want));
  });

  await h.step('phaseAt: more edges', async () => {
    const r = await inPage(page, async () => {
      const { phaseAt } = await import('/js/core/phase.js'); const { CONFIG } = await import('/js/config.js');
      const at = s => phaseAt(Date.parse(s), CONFIG.schedule), S = CONFIG.schedule;
      const wrap = { weddingDate: '2027-12-28', utcOffset: '+09:00', liveStartHour: 6, liveHours: 24, anniversaryDays: 7 };
      return {
        weddingMidnight: at('2027-04-10T00:00:00-04:00'),            // 같은 날이어도 06:00 전 = pre
        longBefore: at('2026-10-07T12:00:00-04:00'),
        annLastSecond: at('2028-04-16T23:59:59-04:00'),
        year2: at('2029-04-09T23:59:59-04:00'), year2start: at('2029-04-10T00:00:00-04:00'),
        year3: at('2030-04-10T00:00:00-04:00'),
        firstAnnOnly: at('2027-04-12T00:00:00-04:00'),                // 1주년 전 해에는 기념일이 없음 (k ≥ 1)
        yearWrapIn: phaseAt(Date.parse('2029-01-02T12:00:00+09:00'), wrap),     // 12월 말 결혼식: 기념일 창이 새해로 넘어감
        yearWrapLast: phaseAt(Date.parse('2029-01-03T23:59:59+09:00'), wrap),
        yearWrapOut: phaseAt(Date.parse('2029-01-04T00:00:00+09:00'), wrap),
        invalid: phaseAt(Date.now(), { ...S, weddingDate: 'nope', utcOffset: '??' }),
        sameAsStringParse: Date.parse('2028-04-10T00:00:00-04:00') === Date.UTC(2028, 3, 10) + 4 * 3600e3,
      };
    });
    h.eq('wedding day 00:00 (before 06:00) is still pre', r.weddingMidnight, 'pre');
    h.eq('months before is pre', r.longBefore, 'pre');
    h.eq('last second of anniversary week', r.annLastSecond, 'anniversary');
    h.eq('day before the 2nd anniversary is after', r.year2, 'after');
    h.eq('2nd anniversary 00:00 is anniversary', r.year2start, 'anniversary');
    h.eq('3rd anniversary 00:00 is anniversary', r.year3, 'anniversary');
    h.eq('2 days after the wedding is after (no anniversary before year 1)', r.firstAnnOnly, 'after');
    h.eq('year-end wedding: window crossing New Year is anniversary', [r.yearWrapIn, r.yearWrapLast, r.yearWrapOut], ['anniversary', 'anniversary', 'after']);
    h.eq('invalid schedule falls back to pre (never crashes)', r.invalid, 'pre');
    h.check('anniversary start = same instant as the 03 §1 string formulation', r.sameAsStringParse);
  });

  await h.step('resolvePhase: url > admin > auto', async () => {
    const r = await inPage(page, async () => {
      const { resolvePhase } = await import('/js/core/phase.js');
      const now = Date.parse('2027-04-10T12:00:00-04:00');
      return [
        resolvePhase({ now, settings: { phase: 'after' }, url: 'pre' }), resolvePhase({ now, settings: { phase: 'after' }, url: null }),
        resolvePhase({ now, settings: { phase: 'auto' }, url: 'bogus' }), resolvePhase({ now, settings: null, url: null }),
        resolvePhase({ now, settings: { phase: 'bogus' }, url: null }),
      ];
    });
    h.eq('url wins', r[0], { phase: 'pre', source: 'url' });
    h.eq('admin forced phase wins over the clock', r[1], { phase: 'after', source: 'admin' });
    h.eq('"auto" and junk fall through to the clock', [r[2], r[3], r[4]], [{ phase: 'live', source: 'auto' }, { phase: 'live', source: 'auto' }, { phase: 'live', source: 'auto' }]);
  });

  // ---------------------------------------------------------------- startPhase (fresh page loads: sessionStorage memory)
  await h.step('startPhase: ?phase= memory, <html data-phase>, emit only on change', async () => {
    const boot = () => inPage(page, async () => {
      const bus = await import('/js/core/bus.js'); const ph = await import('/js/core/phase.js'); const { CONFIG } = await import('/js/config.js');
      ph.startPhase(); ph.startPhase();                                    // 두 번 불러도 1번만 시작
      return { last: bus.last('phase'), attr: document.documentElement.dataset.phase, kept: sessionStorage.getItem('wgb_phase'), cur: ph.currentPhase(), auto: ph.phaseAt(Date.now(), CONFIG.schedule) };
    });
    await open(page, { phase: 'pre' });
    let r = await boot();
    h.eq('?phase=pre → pre from url', [r.last, r.attr, r.cur], [{ phase: 'pre', source: 'url' }, 'pre', 'pre']);
    h.eq('?phase= is remembered in sessionStorage', r.kept, 'pre');
    await page.goto(h.url('__units.html', { phase: null }));               // 같은 탭, 주소에는 phase 없음
    r = await boot();
    h.eq('remembered in the tab when the next page has no ?phase=', r.last, { phase: 'pre', source: 'url' });
    await page.goto(h.url('__units.html', { phase: 'bogus' }));
    r = await boot();
    h.eq('a junk ?phase= is ignored (the remembered one stays)', r.last, { phase: 'pre', source: 'url' });
    await page.goto(h.url('__units.html', { phase: 'anniversary' }));
    r = await boot();
    h.eq('a new ?phase= replaces the memory', [r.last.phase, r.attr, r.kept], ['anniversary', 'anniversary', 'anniversary']);
    await page.goto(h.url('__units.html', { phase: 'auto' }));
    r = await boot();
    h.eq('?phase=auto clears the memory and follows the clock', [r.last, r.kept, r.attr], [{ phase: r.auto, source: 'auto' }, null, r.auto]);

    // settings 로 강제 → 바뀔 때만 emit
    const s = await inPage(page, async () => {
      const bus = await import('/js/core/bus.js'); const events = [];
      bus.on('phase', p => events.push(p));
      bus.emit('settings', { phase: 'after' });
      bus.emit('settings', { phase: 'after', safe: true });               // 같은 페이즈·같은 출처 → emit 없음
      bus.emit('settings', { phase: 'live' });
      bus.emit('settings', { phase: 'auto' });
      return { events, attr: document.documentElement.dataset.phase };
    });
    h.eq('settings.phase forces the phase (admin), same value emits nothing, auto returns to the clock', s.events.map(e => `${e.phase}/${e.source}`).join(' '), ['after/admin', 'live/admin', `${s.attr}/auto`].join(' '));
  });

  await h.step('startPhase: 30 s tick crosses a boundary (fake clock)', async () => {
    const p2 = await h.page('desktop', { tag: 'units-clock' });
    await p2.route(UNIT_PAGE, r => r.fulfill({ contentType: 'text/html', body: BLANK }));
    await p2.clock.install({ time: new Date('2027-04-10T05:59:45-04:00') });
    await p2.goto(h.url('__units.html', { phase: null }));
    const a = await inPage(p2, async () => {
      const bus = await import('/js/core/bus.js'); const ph = await import('/js/core/phase.js');
      window.__ev = []; bus.on('phase', p => window.__ev.push(p.phase + '/' + p.source));
      ph.startPhase();
      return { first: bus.last('phase'), attr: document.documentElement.dataset.phase };
    });
    h.eq('05:59:45 EDT → pre', [a.first, a.attr], [{ phase: 'pre', source: 'auto' }, 'pre']);
    await p2.clock.runFor(31000);
    const b = await inPage(p2, async () => ({ ev: window.__ev, attr: document.documentElement.dataset.phase }));
    h.eq('after the 30 s tick (06:00:16) → live, exactly one new event (after the initial pre)', [b.ev, b.attr], [['pre/auto', 'live/auto'], 'live']);
  });

  // ---------------------------------------------------------------- bus
  await h.step('bus: sticky, replay, isolation, ownership', async () => {
    const r = await inPage(page, async () => {
      const bus = await import('/js/core/bus.js'); const out = {};
      const reports = []; bus.setErrorReporter((owner, e, type) => reports.push([owner, e.message, type]));
      // sticky + 동기 replay
      bus.emit('lang', { lang: 'ko' });
      let got = null, sync = false; bus.on('lang', v => { got = v; }, { replay: true }); sync = got !== null;
      out.replay = { got, sync, last: bus.last('lang') };
      // 스티키가 아니면 replay 해도 호출 없음 / 아직 값이 없는 스티키도
      let n = 0; bus.on('vote:cast', () => n++, { replay: true }); bus.on('bgm:state', () => n++, { replay: true }); out.noReplay = n;
      // 핸들러 오류 격리 + owner 보고
      const seen = []; bus.on('x', () => { throw new Error('UNIT-INTENTIONAL owner'); }, { owner: 'f1' }); bus.on('x', v => seen.push(v)); bus.emit('x', 1);
      out.isolation = { seen, reports: reports.slice() };
      // owner 없는 오류는 console.error 로 (다른 핸들러는 계속)
      bus.on('y', () => { throw new Error('UNIT-INTENTIONAL anon'); }); const seen2 = []; bus.on('y', v => seen2.push(v)); bus.emit('y', 2); out.anon = seen2;
      // replay 중 오류도 격리
      bus.emit('guest:simple', { on: true }); let ok = false; try { bus.on('guest:simple', () => { throw new Error('UNIT-INTENTIONAL replay'); }, { replay: true, owner: 'f1' }); ok = true; } catch {} out.replayThrow = ok;
      // emit 중 off: 뒤 핸들러는 건너뜀 / emit 중 on: 이번 emit 에는 불리지 않음
      const order = []; let offB; bus.on('z', () => { order.push('a'); offB(); }); offB = bus.on('z', () => order.push('b')); bus.on('z', () => order.push('c')); bus.emit('z'); out.removeDuring = order;
      const late = []; bus.on('w', () => { late.push('first'); if (late.length === 1) bus.on('w', () => late.push('late')); }); bus.emit('w'); out.addDuring = late.slice(); bus.emit('w'); out.addDuring2 = late;
      // 재진입 emit
      const re = []; bus.on('r', v => { re.push(v); if (v < 3) bus.emit('r', v + 1); }); bus.emit('r', 1); out.reentrant = re;
      // offOwner
      const o3 = []; bus.on('q', () => o3.push(1), { owner: 'f2' }); bus.on('q', () => o3.push(2), { owner: 'f2' }); bus.on('q', () => o3.push(3));
      out.countBefore = bus.count('f2'); bus.offOwner('f2'); bus.emit('q'); out.offOwner = { o3, count: bus.count('f2') };
      // off 은 여러 번 불러도 안전
      const off = bus.on('t', () => {}); const before = bus.count(); off(); off(); out.offTwice = before - bus.count();
      // 잘못된 인자
      try { bus.on('t', 5); out.badFn = 'no throw'; } catch (e) { out.badFn = e.constructor.name; }
      out.sticky = [...bus.STICKY].sort();
      return out;
    });
    h.eq('sticky replay is synchronous and last() agrees', r.replay, { got: { lang: 'ko' }, sync: true, last: { lang: 'ko' } });
    h.eq('replay does nothing for non-sticky events or sticky events with no value yet', r.noReplay, 0);
    h.eq('a throwing handler is reported to its owner and the next handler still runs', [r.isolation.seen, r.isolation.reports], [[1], [['f1', 'UNIT-INTENTIONAL owner', 'x']]]);
    h.eq('an ownerless handler error does not stop the others', r.anon, [2]);
    h.check('a throwing replay handler never throws out of bus.on', r.replayThrow);
    h.eq('a handler removed during emit is skipped', r.removeDuring, ['a', 'c']);
    h.eq('a handler added during emit waits for the next emit', [r.addDuring, r.addDuring2], [['first'], ['first', 'first', 'late']]);
    h.eq('re-entrant emit works', r.reentrant, [1, 2, 3]);
    h.eq('offOwner removes only that owner', [r.countBefore, r.offOwner], [2, { o3: [3], count: 0 }]);
    h.eq('calling off() twice is harmless', r.offTwice, 1);
    h.eq('bus.on(type, notAFunction) throws TypeError', r.badFn, 'TypeError');

    // 코드의 STICKY 와 02 §5 표(✓)가 같아야 함 — 문서가 계약
    const doc = fs.readFileSync(path.join(h.repo, 'docs/v4/02-contracts.md'), 'utf8');
    const sec = doc.slice(doc.indexOf('## 5. 버스 이벤트'), doc.indexOf('## 6. 하객 페이지 API'));
    const fromDoc = sec.split('\n').filter(l => /^\| `/.test(l)).map(l => l.split(/(?<!\\)\|/).map(s => s.trim())).filter(c => c[3] === '✓').map(c => c[1].replace(/`/g, '')).sort();
    h.eq('bus STICKY list = the ✓ rows of 02 §5', r.sticky, fromDoc);
    h.check('02 §5 table parsed (16 sticky events)', fromDoc.length === 16, String(fromDoc.length));
  });

  // ---------------------------------------------------------------- i18n extension
  await h.step('i18n: addStrings / overrideStrings / t(k, vars)', async () => {
    const r = await inPage(page, async () => {
      const i = await import('/js/i18n.js'); const out = {}; const { t } = i;
      const pick = (...ks) => ks.map(k => t(k));
      i.setLang('ko');
      out.core = [t('start'), t('nope_x'), t('snap_count').replace('{n}', 3)];
      i.addStrings('poll', { ko: { poll_title: '투표', poll_n: '{n}명 참여' }, en: { poll_title: 'Poll' } });
      out.feature = [t('poll_title'), t('poll_n', { n: 7 }), t('poll_n', {})];
      i.setLang('en'); out.featureEn = [t('poll_title'), t('poll_n', { n: 2 }), t('start')];
      i.overrideStrings('archive', { ko: { welcome_sub: '함께해 주셔서 고마워요' }, en: { welcome_sub: 'Thank you for celebrating with us' } });
      out.overEn = t('welcome_sub'); i.setLang('ko'); out.overKo = t('welcome_sub');
      i.overrideStrings('prereg', { ko: { welcome_sub: 'prereg 문구' } }); out.later = t('welcome_sub');
      i.setLang('en'); out.perLang = [t('start'), t('welcome_sub')];       // 한 언어만 덮어쓰면 다른 언어는 코어 문구
      i.overrideStrings('archive', { ko: { welcome_sub: '다시' } }); out.replaced = t('welcome_sub').startsWith('Sign the guestbook');
      i.setLang('ko'); out.replacedKo = t('welcome_sub');
      i.overrideStrings('archive', null); out.released = t('welcome_sub');
      i.overrideStrings('prereg', null); out.allReleased = t('welcome_sub').startsWith('방명록을 남기면');
      i.removeStrings('poll'); out.removed = t('poll_title');
      i.addStrings('x', { ko: { x_a: 'ok' } }); out.proto = [t('toString'), t('constructor'), t('__proto__'), t('hasOwnProperty'), t('x_a')];
      i.addStrings('bad', null); i.addStrings('bad2', { ko: 5, en: { a: 1 } }); out.badDict = t('a');
      // DOM 다시 칠하기 (ctx.texts 의 바탕): data-i18n 요소가 덮어쓴 문구로 바뀌고, 해제하면 원래대로
      document.body.innerHTML = '<p id="u1" data-i18n="welcome_sub"></p><input id="u2" data-i18n-ph="name_ph">';
      i.applyI18n(); const base = document.getElementById('u1').textContent;
      i.overrideStrings('archive', { ko: { welcome_sub: '덮어쓴 문구', name_ph: '덮어쓴 자리표시' } }); i.applyI18n();
      out.dom = [base.startsWith('방명록을 남기면'), document.getElementById('u1').textContent, document.getElementById('u2').placeholder];
      i.overrideStrings('archive', null); i.applyI18n(); out.domBack = document.getElementById('u1').textContent === base;
      document.body.innerHTML = '';
      i.setLang('ko');
      return out;
    });
    h.eq('core strings unchanged (t(k), unknown key, legacy .replace)', r.core, ['방명록 남기기', 'nope_x', '3장 올렸어요']);
    h.eq('feature strings + {n} substitution; missing var keeps the token', r.feature, ['투표', '7명 참여', '{n}명 참여']);
    h.eq('English: feature key, missing en → ko fallback, core key', r.featureEn, ['Poll', '2명 참여', 'Sign the Guestbook']);
    h.eq('override applies per language', [r.overEn, r.overKo], ['Thank you for celebrating with us', '함께해 주셔서 고마워요']);
    h.eq('the later registration wins', r.later, 'prereg 문구');
    h.eq('an override with only ko leaves en on the core text (other override still applies)', r.perLang, ['Sign the Guestbook', 'Thank you for celebrating with us']);
    h.check('re-calling overrideStrings replaces that feature wholesale', r.replaced);
    h.eq('…and re-registers it as the latest', r.replacedKo, '다시');
    h.eq('overrideStrings(id, null) releases only that feature', r.released, 'prereg 문구');
    h.check('releasing all overrides restores the core text', r.allReleased);
    h.eq('removeStrings drops a feature dictionary', r.removed, 'poll_title');
    h.eq('Object.prototype names are just unknown keys (never a function)', r.proto, ['toString', 'constructor', '__proto__', 'hasOwnProperty', 'ok']);
    h.eq('malformed dictionaries are ignored', r.badDict, 'a');
    h.eq('applyI18n paints overrides into text and placeholders', r.dom, [true, '덮어쓴 문구', '덮어쓴 자리표시']);
    h.check('…and releasing restores the original text', r.domBack);

    // 소스 규칙: i18n.js 는 정적 테스트의 "const D = {…};" 모양을 유지
    const src = fs.readFileSync(path.join(h.publicDir, 'js/i18n.js'), 'utf8');
    const D = loadDictionary(src);
    h.check('i18n.js still has its top-level dictionary (static parity test depends on it)', !!D && Object.keys(D.ko).length > 100);
  });

  // ---------------------------------------------------------------- ui: codes, language, random
  await h.step('ui: guestCode, detectLang, seeded', async () => {
    const GOLDEN = [['gA1b2C3d4E5f6G7h8I9j0', 'MUNE'], ['g1', 'GDDY'], ['demo-guest-12', 'VQ9P'], ['HbVq3mZ0sT7rYw2xKp9L', 'G9QG']];
    const seeds = ['bouquet-1', 'g123', 42, 0.5, ''];
    // village.js 의 seeded 를 소스에서 그대로 꺼내 같은 수열인지 비교 (한쪽만 바뀌면 빨간불)
    const vsrc = fs.readFileSync(path.join(h.publicDir, 'js/village.js'), 'utf8');
    const line = /^function seeded\(seed\) \{.*\}$/m.exec(vsrc);
    h.check('village.js still defines seeded() on one line (test extracts it)', !!line);
    const vseeded = new Function(line[0] + '; return seeded;')();
    const want = seeds.map(s => { const r = vseeded(s); return Array.from({ length: 20 }, r); });

    const r = await inPage(page, async ([golden, seeds]) => {
      const ui = await import('/js/core/ui.js');
      const codes = golden.map(([g]) => ui.guestCode(g));
      const pool = Array.from({ length: 3000 }, (_, i) => 'id' + (i * 7919).toString(36) + i);
      const all = pool.map(ui.guestCode);
      return {
        codes, again: golden.map(([g]) => ui.guestCode(g)),
        charset: all.every(c => /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/.test(c)),
        spread: new Set(all).size, noConfusing: !all.some(c => /[01ILO]/.test(c)),
        emptyOk: /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/.test(ui.guestCode('')) && /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/.test(ui.guestCode(undefined)),
        lang: ['안녕하세요 hello', 'Congrats!! 🎉', 'ㅋㅋㅋ', '', null, 'Kim 지환', 'こんにちは'].map(ui.detectLang),
        seq: seeds.map(s => { const r = ui.seeded(s); return Array.from({ length: 20 }, r); }),
        range: (() => { const r = ui.seeded('range'); for (let i = 0; i < 5000; i++) { const v = r(); if (!(v >= 0 && v < 1)) return false; } return true; })(),
        differs: JSON.stringify((() => { const a = ui.seeded('a'), b = ui.seeded('b'); return [a(), a()]; })()) !== JSON.stringify((() => { const b = ui.seeded('b'); return [b(), b()]; })()),
      };
    }, [GOLDEN, seeds]);
    h.eq('guestCode golden values (printed on tickets — never change)', r.codes, GOLDEN.map(g => g[1]));
    h.eq('guestCode is deterministic', r.again, r.codes);
    h.check('guestCode: 4 chars from the 31-letter set for 3000 ids', r.charset);
    h.check('guestCode never uses 0 1 I L O', r.noConfusing);
    h.check('guestCode spreads (≥ 2990 distinct of 3000)', r.spread >= 2990, String(r.spread));
    h.check('guestCode tolerates empty / undefined', r.emptyOk);
    h.eq('detectLang: Hangul (syllables, jamo) → ko, else en', r.lang, ['ko', 'en', 'ko', 'en', 'en', 'ko', 'en']);
    h.eq('seeded() = village.js seeded() (5 seeds × 20 values)', r.seq, want);
    h.check('seeded() stays in [0, 1) and differs per seed', r.range && r.differs);
  });

  // ---------------------------------------------------------------- ui: dates & calendar
  await h.step('ui: fmtDate (venue time) and icsEvent (RFC 5545)', async () => {
    const T = Date.parse('2027-04-10T14:05:00-04:00');
    const run = p => inPage(p, async T => {
      const ui = await import('/js/core/ui.js');
      return {
        ko: ['date', 'time', 'datetime'].map(s => ui.fmtDate(T, 'ko', s)), en: ['date', 'time', 'datetime'].map(s => ui.fmtDate(T, 'en', s)),
        night: ui.fmtDate(Date.parse('2027-04-10T23:30:00-04:00'), 'ko', 'date'), bad: [ui.fmtDate(NaN, 'ko', 'date'), ui.fmtDate(undefined, 'en', 'time')],
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      };
    }, T);
    const a = await run(page);
    h.eq('fmtDate ko', a.ko, ['2027년 4월 10일', '오후 2:05', '2027년 4월 10일 오후 2:05']);
    h.eq('fmtDate en', a.en, ['Apr 10, 2027', '2:05 PM', 'Apr 10, 2027, 2:05 PM']);
    h.eq('fmtDate shows the venue day for a late evening', a.night, '2027년 4월 10일');
    h.eq('fmtDate of a non-number is empty', a.bad, ['', '']);
    const seoul = await h.page(await h.context('desktop', { timezoneId: 'Asia/Seoul' }), { tag: 'units-seoul' });
    await seoul.route(UNIT_PAGE, r => r.fulfill({ contentType: 'text/html', body: BLANK }));
    await seoul.goto(h.url('__units.html', { phase: null }));
    const b = await run(seoul);
    h.check('device in Seoul sees the same venue time (device time zone is irrelevant)', b.tz === 'Asia/Seoul' && JSON.stringify([b.ko, b.en, b.night]) === JSON.stringify([a.ko, a.en, a.night]), b.tz);

    const ics = await inPage(page, async T => {
      const ui = await import('/js/core/ui.js');
      const full = ui.icsEvent({ title: '지환 ♥ 선경 결혼식, "Orlando"; 축하해요', start: T, end: T + 3 * 3600e3, location: 'Orlando, FL', description: '첫 줄\n둘째 줄 ' + '가나다라마바사'.repeat(12) });
      const min = ui.icsEvent({ title: 'x', start: new Date(T).toISOString() });
      let err = null; try { ui.icsEvent({ title: 'x' }); } catch (e) { err = e.code; }
      return { full, min, same: ui.icsEvent({ title: 'x', start: T }).match(/UID:.*/)[0] === ui.icsEvent({ title: 'x', start: T }).match(/UID:.*/)[0], err };
    }, T);
    const lines = ics.full.split('\r\n'), bytes = l => Buffer.byteLength(l, 'utf8'), unfolded = ics.full.replace(/\r\n /g, '');
    h.check('ics: BEGIN/END VCALENDAR + VEVENT, VERSION 2.0, ends with CRLF', lines[0] === 'BEGIN:VCALENDAR' && lines.includes('VERSION:2.0') && lines.includes('BEGIN:VEVENT') && lines.includes('END:VEVENT') && ics.full.endsWith('END:VCALENDAR\r\n'));
    h.check('ics: only CRLF line breaks', !/(^|[^\r])\n/.test(ics.full) && !/\r(?!\n)/.test(ics.full));
    h.check('ics: no line longer than 75 bytes (UTF-8), no multi-byte char split', lines.every(l => bytes(l) <= 75) && /DESCRIPTION:첫 줄\\n둘째 줄 (가나다라마바사){12}/.test(unfolded));
    h.check('ics: DTSTART/DTEND are UTC (20270410T180500Z → 210500Z)', ics.full.includes('DTSTART:20270410T180500Z') && ics.full.includes('DTEND:20270410T210500Z') && /DTSTAMP:\d{8}T\d{6}Z/.test(ics.full));
    h.check('ics: , ; \\ and newlines are escaped', unfolded.includes('결혼식\\, "Orlando"\\; 축하해요') && unfolded.includes('LOCATION:Orlando\\, FL'));
    h.check('ics: end defaults to start + 2 h (ISO string start works)', ics.min.includes('DTSTART:20270410T180500Z') && ics.min.includes('DTEND:20270410T200500Z'));
    h.check('ics: UID is stable for the same event (calendar apps update instead of duplicating)', ics.same && /UID:\S+@wedding-guestbook/.test(ics.full));
    h.eq('ics: missing start → invalid-argument', ics.err, 'invalid-argument');
  });

  // ---------------------------------------------------------------- ui: drawing
  await h.step('ui: spriteCanvas, qrCanvas, canvasText, ensureFonts', async () => {
    const r = await inPage(page, async () => {
      const ui = await import('/js/core/ui.js'); const av = await import('/js/avatar.js'); const { CONFIG } = await import('/js/config.js');
      const out = {};
      const px = (c, x, y) => Array.from(c.getContext('2d').getImageData(x, y, 1, 1).data);
      // spriteCanvas
      const a = ui.spriteCanvas(CONFIG.groomAvatar, 'idle', 3), b = ui.spriteCanvas(av.getSprite(CONFIG.groomAvatar), 'idle', 3);
      out.size = [a.width, a.height, ui.spriteCanvas(CONFIG.groomAvatar).width, ui.spriteCanvas(CONFIG.groomAvatar, 'wave', 2.4).height, ui.spriteCanvas(CONFIG.groomAvatar, 'nope', 0).width];
      out.rendering = a.style.imageRendering;
      out.sameFromFrames = a.toDataURL() === b.toDataURL();
      const src = av.getSprite(CONFIG.groomAvatar).idle; let diff = 0;
      for (let y = 0; y < av.SPRITE_H; y++) for (let x = 0; x < av.SPRITE_W; x++) { const s = src.getContext('2d').getImageData(x, y, 1, 1).data, d = px(a, x * 3 + 1, y * 3 + 1); if (s.some((v, i) => v !== d[i])) diff++; }
      out.pixelDiff = diff;
      out.waveDiffers = ui.spriteCanvas(CONFIG.groomAvatar, 'wave', 1).toDataURL() !== ui.spriteCanvas(CONFIG.groomAvatar, 'idle', 1).toDataURL();
      // qrCanvas
      const q1 = ui.qrCanvas('index.html#me=abc&n=Kim'), q3 = ui.qrCanvas('index.html#me=abc&n=Kim', { scale: 3, pad: 4, ecc: 'H' }), q1b = ui.qrCanvas('index.html#me=abc&n=Kim', { scale: 1, pad: 2, ecc: 'M' });
      const n = q1.width - 4; let dark = 0, mism = 0;
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) { const d = px(q1, c + 2, r + 2)[0] < 128; if (d) dark++; }
      out.qr = { w1: q1.width, same: q1.toDataURL() === q1b.toDataURL(), finder: [px(q1, 2, 2)[0] < 128, px(q1, 2 + n - 1, 2)[0] < 128, px(q1, 2, 2 + n - 1)[0] < 128], quiet: px(q1, 0, 0)[0] === 255 && px(q1, q1.width - 1, q1.height - 1)[0] === 255, ratio: dark / (n * n), scaled: q3.width % 3 === 0 };
      const n3 = q3.width / 3 - 8; for (let r = 0; r < n3; r += 5) for (let c = 0; c < n3; c += 5) { const d = px(q3, (c + 4) * 3 + 1, (r + 4) * 3 + 1)[0] < 128; if (c < 8 && r < 8 && !d && (r === 0 || c === 0)) mism++; }
      out.qr.finderScaled = mism === 0;
      // canvasText
      await ui.ensureFonts();
      const cv = document.createElement('canvas'); cv.width = 400; cv.height = 80; const g = cv.getContext('2d');
      const used = ui.canvasText(g, '지환 ♥ 선경 결혼식에 와주셔서 정말 감사합니다', 10, 10, { size: 24, maxWidth: 200, color: '#000' });
      const used2 = ui.canvasText(g, 'Hi', 300, 10, { size: 20, align: 'center' });
      const used3 = ui.canvasText(g, '아주아주아주아주아주아주 긴 문장입니다 정말로', 10, 45, { size: 16, maxWidth: 40, minSize: 12 });
      const ink = (x0, x1) => { const d = g.getImageData(x0, 0, x1 - x0, 80).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 40) n++; return n; };
      out.text = { used, used2, used3, leftInk: ink(0, 215) > 50, overflowInk: ink(215, 260), centered: ink(280, 320) > 10 && ink(0, 215) > 0, stateRestored: g.textAlign === 'start' && g.textBaseline === 'alphabetic' };
      // ensureFonts: 글꼴 선언이 없는 빈 페이지에서도 곧 resolve
      const t0 = performance.now(); await ui.ensureFonts(); out.fontsMs = performance.now() - t0;
      return out;
    });
    h.eq('spriteCanvas sizes: ×3 = 66×102, default ×1 = 22, 2.4 → ×2 = 68 high, junk scale → ×1', r.size, [66, 102, 22, 68, 22]);
    h.eq('spriteCanvas uses image-rendering: pixelated', r.rendering, 'pixelated');
    h.check('spriteCanvas accepts a getSprite() frames object (couple:sprites payload) and a plain avatar alike', r.sameFromFrames);
    h.eq('spriteCanvas: every ×3 block is the source pixel (crisp, no smoothing)', r.pixelDiff, 0);
    h.check('spriteCanvas: frame "wave" differs from "idle"', r.waveDiffers);
    h.check('qrCanvas: (modules + 2×pad) px square, default = scale 1 / pad 2 / ecc M', r.qr.w1 > 21 && r.qr.same, String(r.qr.w1));
    h.check('qrCanvas: three finder corners are dark, quiet zone is white, dark ratio plausible', r.qr.finder.every(Boolean) && r.qr.quiet && r.qr.ratio > 0.3 && r.qr.ratio < 0.7, JSON.stringify(r.qr));
    h.check('qrCanvas: scale multiplies the canvas and keeps the pattern', r.qr.scaled && r.qr.finderScaled);
    h.check('canvasText: long text shrinks to fit maxWidth (returns the size used) and stays inside', r.text.used < 24 && r.text.used >= 8 && r.text.leftInk && r.text.overflowInk === 0, JSON.stringify(r.text));
    h.check('canvasText: respects minSize (then squeezes horizontally) and align:center', r.text.used3 === 12 && r.text.used2 === 20 && r.text.centered, JSON.stringify(r.text));
    h.check('canvasText restores the caller’s canvas state', r.text.stateRestored);
    h.check('ensureFonts resolves quickly even without font faces (blank page)', r.fontsMs < 1500, r.fontsMs.toFixed(0) + ' ms');
  });

  // ---------------------------------------------------------------- ui: downloads & share
  await h.step('ui: downloadDataURL / downloadBlob / shareImage', async () => {
    const PNG = await inPage(page, async () => { const c = document.createElement('canvas'); c.width = 8; c.height = 8; c.getContext('2d').fillRect(0, 0, 4, 4); return c.toDataURL('image/png'); });
    const dl = async (fn, arg, timeout = 4000) => {
      const wait = page.waitForEvent('download', { timeout }).catch(() => null);
      const ret = await inPage(page, fn, arg);
      return { ret, d: await wait };
    };
    let x = await dl(async png => (await import('/js/core/ui.js')).downloadDataURL('ticket/a:b?.png', png), PNG);
    h.check('downloadDataURL: a base64 PNG downloads, file name is sanitized', x.ret === true && !!x.d && x.d.suggestedFilename() === 'ticket_a_b_.png', x.d?.suggestedFilename());
    for (const bad of ['javascript:alert(1)', 'https://example.org/a.png', 'data:text/html;base64,PGI+', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:image/png;base64,@@@', '', null]) {
      x = await dl(async v => (await import('/js/core/ui.js')).downloadDataURL('x.png', v), bad, 600);
      h.check(`downloadDataURL refuses ${JSON.stringify(bad)}`, x.ret === false && x.d === null);
    }
    x = await dl(async () => (await import('/js/core/ui.js')).downloadBlob('wedding.ics', new Blob(['BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n'], { type: 'text/calendar' })));
    h.check('downloadBlob: a Blob downloads under its name', x.ret === true && x.d?.suggestedFilename() === 'wedding.ics');
    x = await dl(async () => (await import('/js/core/ui.js')).downloadBlob('x', 'not a blob'), null, 600);
    h.check('downloadBlob refuses non-Blobs', x.ret === false && x.d === null);
    h.eq('download helpers leave no <a> behind', await page.evaluate(() => document.querySelectorAll('a').length), 0);

    // shareImage — 1) 이 Chromium 에는 파일 공유가 없음 → 다운로드
    x = await dl(async png => (await import('/js/core/ui.js')).shareImage({ dataURL: png, filename: 'pixel-card-ABCD.png', title: 't', text: 'x' }), PNG);
    h.check('shareImage falls back to a download when file sharing is unavailable', x.ret === 'downloaded' && x.d?.suggestedFilename() === 'pixel-card-ABCD.png', String(x.ret));
    // 2) 공유 시트가 열림 → 'shared' (파일 이름·형식·크기, title/text 전달)
    const shared = await inPage(page, async png => {
      const ui = await import('/js/core/ui.js'); let seen = null;
      Object.defineProperty(navigator, 'canShare', { value: d => !!d.files?.length, configurable: true });
      Object.defineProperty(navigator, 'share', { value: async d => { seen = { n: d.files[0].name, t: d.files[0].type, s: d.files[0].size, title: d.title, text: d.text }; }, configurable: true });
      return { ret: await ui.shareImage({ dataURL: png, filename: 'a.png', title: 'T', text: 'X' }), seen };
    }, PNG);
    h.check('shareImage → "shared" with the file, title and text', shared.ret === 'shared' && shared.seen.n === 'a.png' && shared.seen.t === 'image/png' && shared.seen.s > 50 && shared.seen.title === 'T' && shared.seen.text === 'X', JSON.stringify(shared));
    // 3) 사용자가 시트를 닫음 → 'cancelled' (오류 아님, 다운로드 없음)
    x = await dl(async png => {
      Object.defineProperty(navigator, 'share', { value: async () => { throw new DOMException('closed', 'AbortError'); }, configurable: true });
      return (await import('/js/core/ui.js')).shareImage({ dataURL: png, filename: 'c.png' });
    }, PNG, 700);
    h.check('shareImage → "cancelled" when the share sheet is dismissed (no download, no error)', x.ret === 'cancelled' && x.d === null, String(x.ret));
    // 4) 공유가 거부됨(권한 등) → 다운로드로 대신
    x = await dl(async png => {
      Object.defineProperty(navigator, 'share', { value: async () => { throw new DOMException('no gesture', 'NotAllowedError'); }, configurable: true });
      return (await import('/js/core/ui.js')).shareImage({ dataURL: png, filename: 'd.png' });
    }, PNG);
    h.check('shareImage falls back to a download when sharing is refused', x.ret === 'downloaded' && x.d?.suggestedFilename() === 'd.png', String(x.ret));
    // 5) 이미지가 아닌 값 → invalid-argument
    const rej = await inPage(page, async () => { try { await (await import('/js/core/ui.js')).shareImage({ dataURL: 'javascript:alert(1)' }); return 'resolved'; } catch (e) { return e.code; } });
    h.eq('shareImage rejects a non-image dataURL with invalid-argument', rej, 'invalid-argument');
  });

  await h.step('ui: compressImage is the snaps.js implementation', async () => {
    const same = await inPage(page, async () => (await import('/js/core/ui.js')).compressImage === (await import('/js/snaps.js')).compressImage);
    h.check('core/ui.compressImage === snaps.compressImage (one implementation)', same);
  });

  // ================================================================ 2단계 (WP-00b ②): schema 거울 · docdb · settings · deleteMany
  const world = await unitPage('units-world');
  const clockPage = await unitPage('units-fixed-clock');

  // ---------------------------------------------------------------- schema.js (Node: it is a pure module)
  await h.step('schema.js: a pure module that mirrors firestore.rules', async () => {
    const file = path.join(h.publicDir, 'js/core/schema.js'), src = fs.readFileSync(file, 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map(l => l.replace(/\s\/\/.*$/, '').replace(/^\s*\/\/.*$/, '')).join('\n');
    h.check('schema.js imports nothing and touches no browser API (it runs in Node, too)', !/^\s*import\s/m.test(code) && !/\b(window|localStorage|sessionStorage|indexedDB|BroadcastChannel)\b|document\.(body|querySelector|getElementById|createElement)|\bfetch\(|navigator\./.test(code));
    const S = await import(pathToFileURL(file).href);
    const rules = fs.readFileSync(path.join(h.repo, 'firestore.rules'), 'utf8');
    const inRules = [...rules.matchAll(/^\s*match\s+\/(\S+)\s*\{/gm)].map(m => m[1]).filter(p => !p.startsWith('databases/')).sort();
    h.eq('schema.js declares exactly the paths firestore.rules matches', S.SCHEMA.map(d => d.pattern).sort(), inRules);
    h.check('19 paths: 8 written only by store.js (7 v3.2 + notes, 2026-10) + 11 v4', inRules.length === 19 && S.SCHEMA.filter(d => d.v3).length === 8, `${inRules.length} / ${S.SCHEMA.filter(d => d.v3).length}`);

    const m = p => { const r = S.matchPath(p); return r && { pattern: r.def.pattern, params: r.params, id: r.id }; };
    h.eq('matchPath: a document path → pattern, params and id', m('votes/p1_gA'), { pattern: 'votes/{vid}', params: { vid: 'p1_gA' }, id: 'p1_gA' });
    h.eq('matchPath: the two fixed documents', [m('app/settings')?.pattern, m('app/live')?.pattern], ['app/settings', 'app/live']);
    h.eq('matchPath: undeclared or malformed paths are null', ['app/other', 'app', 'guests', 'guests/a/b', '', 'guests/.', 'guests/..', 'guests/__x__', 'guests/' + 'a'.repeat(101), 5, null, undefined].map(p => S.matchPath(p)), Array(12).fill(null));
    h.check('matchPath: ids of 100 characters are fine', !!S.matchPath('guests/' + 'a'.repeat(100)));
    h.eq('matchCollection: collections only (the fixed app/ documents are not collections)', [S.matchCollection('checkins')?.def.pattern, S.matchCollection('app'), S.matchCollection('a/b'), S.matchCollection(7), S.matchCollection('nope')], ['checkins/{gid}', null, null, null, null]);
    h.eq('validId: 1–100 chars, no "/", not . .. or __x__', ['a', 'g-1_x', 'a'.repeat(100), '', 'a/b', '.', '..', '__a__', 'a'.repeat(101), 5].map(S.validId), [true, true, true, false, false, false, false, false, false, false]);

    h.check('markers: ts() is one frozen shared object, inc(n) a frozen { $sv: "inc", n }', S.serverTs() === S.serverTs() && Object.isFrozen(S.serverTs()) && JSON.stringify(S.increment(3)) === '{"$sv":"inc","n":3}' && Object.isFrozen(S.increment(3)));
    h.eq('marker predicates', [S.isServerTs(S.serverTs()), S.isServerTs({ $sv: 'inc' }), S.isServerTs(null), S.isServerTs(5), S.isIncrement(S.increment(1)), S.isIncrement(S.serverTs()), S.isStoredTs({ $ts: 5 }), S.isStoredTs({ $ts: '5' }), S.isStoredTs(null)],
      [true, false, false, false, true, false, true, false, false]);

    // check(): the pieces the demo backend and the browser pre-check are built from
    const ts = S.serverTs, adminEnv = { admin: true, now: Date.now() };
    const c = (op, p, next, prev, env) => S.check(op, p, next, prev, env).then(r => (r ? r.code : null));
    h.eq('check: an undeclared path or collection is unknown-path', [await c('get', 'app/other'), await c('list', 'app'), await c('get', 'nope/x')], ['unknown-path', 'unknown-path', 'unknown-path']);
    h.eq('check: reads — public collections open, thanks list admin-only, photos closed to docdb, guests readable',
      [await c('get', 'app/live'), await c('list', 'polls'), await c('list', 'thanks'), await c('list', 'thanks', null, null, adminEnv), await c('get', 'photos/gA'), await c('list', 'guests')],
      [null, null, 'permission-denied', null, 'permission-denied', null]);
    h.eq('check: writes — who first (permission-denied), then shape (invalid-argument)',
      [await c('create', 'app/live', { updatedAt: ts() }, null, { admin: false }), await c('create', 'app/live', { updatedAt: ts() }, null, adminEnv),
        await c('create', 'app/live', { updatedAt: ts(), bogus: 1 }, null, adminEnv), await c('create', 'app/live', 'not a map', null, adminEnv)],
      ['permission-denied', null, 'invalid-argument', 'invalid-argument']);
    const part = { admin: true, partial: true, relational: false };
    h.eq('check: partial (the browser pre-check of an update patch) judges only the key list; a dotted key counts by its first segment',
      [await c('update', 'app/live', { quiet: 'not even a bool' }, null, part), await c('update', 'app/live', { 'msg.ko': 'x' }, null, part), await c('update', 'app/live', { bogus: 1 }, null, part)],
      [null, null, 'invalid-argument']);
    h.eq('check: relational:false skips "does that guest exist" but not the id shape',
      [await c('create', 'checkins/nobody', { via: 'phone', createdAt: ts() }, null, { relational: false }), await c('create', 'checkins/nobody', { via: 'phone', createdAt: ts() }, null, {}),
        await c('create', 'checkins/' + 'g'.repeat(65), { via: 'phone', createdAt: ts() }, null, { relational: false })],
      [null, 'permission-denied', 'permission-denied']);
    const env = { guestExists: async id => id === 'gA', get: async p => (p === 'polls/p1' ? { open: false, kind: 'choice', options: ['a', 'b'] } : null), now: Date.now() };
    h.eq('check: the FIRST failing condition decides the error class (closed poll beats a bad choice, a stray key beats the poll lookup, a stranger beats the poll)',
      [await c('create', 'votes/p1_gA', { pid: 'p1', gid: 'gA', choice: 99, updatedAt: ts() }, null, env),
        await c('create', 'votes/p1_gA', { pid: 'p1', gid: 'gA', choice: 99, updatedAt: ts(), extra: 1 }, null, env),
        await c('create', 'votes/p1_gZ', { pid: 'p1', gid: 'gZ', choice: 0, updatedAt: ts() }, null, env)],
      ['permission-denied', 'invalid-argument', 'permission-denied']);
    const now = Date.now(), prevBingo = t => ({ done: ['m0'], lines: 0, updatedAt: { $ts: t } });
    const bg = t => c('update', 'bingo/gA', { done: ['m0', 'm1'], lines: 0, updatedAt: ts() }, prevBingo(t), { guestExists: async () => true, now });
    h.eq('check: the 1 s rate limit compares env.now with the stored updatedAt', [await bg(now - 1500), await bg(now - 500)], [null, 'permission-denied']);
  });

  // ---------------------------------------------------------------- layering (permanent): the base modules never import core/
  await h.step('layering: store, i18n, config, avatar, scene, report, snaps never import core/', async () => {
    const bad = [];
    for (const f of ['store.js', 'i18n.js', 'config.js', 'avatar.js', 'scene.js', 'report.js', 'snaps.js', 'face.js']) {
      const src = fs.readFileSync(path.join(h.publicDir, 'js', f), 'utf8');
      if (/(?:\bfrom|\bimport)\s*\(?\s*['"`][^'"`]*\/core\//.test(src)) bad.push(f);
    }
    h.eq('no base module imports core/ (core depends on them, never the other way round)', bad, []);
  });

  // ---------------------------------------------------------------- A5: the rules matrix against the demo backend
  await h.step('A5 demo backend answers like the rules (tests/rules/cases.mjs — the table the emulator runs)', async () => {
    const now = Date.now();
    const runs = c => {
      if (c.rulesOnly) return false;                                   // v3.2 collections & batch semantics: the emulator's job
      if (c.clock) return true;                                        // the demo freezes the clock
      if (c.window) { const inside = now >= c.window[0] && now < c.window[1]; return c.expect === 'allow' ? inside : !inside; }
      return true;
    };
    const runnable = CASES.filter(runs), withGuests = cs => cs.map(c => ({ ...c, guests: GUESTS }));
    const rows = await inPage(world, cs => window.__T.matrix(cs), withGuests(runnable.filter(c => !c.clock)));
    for (const c of runnable.filter(c => c.clock)) {
      await clockPage.clock.setFixedTime(new Date(c.clock));
      rows.push(...await inPage(clockPage, cs => window.__T.matrix(cs), withGuests([c])));
    }
    const byId = new Map(rows.map(r => [r.id, r])), groups = {}, deniedOk = new Set(), bad = [];
    for (const c of runnable) {
      const r = byId.get(c.id), want = c.expect === 'allow', g = c.id.split('.')[0];
      const ok = !!r && r.ok === want && (want || !c.code || r.code === c.code);
      (groups[g] ||= { n: 0, bad: [] }).n++;
      if (!ok) { const msg = `${c.id}: want ${c.expect}${c.code ? '/' + c.code : ''}, got ${!r ? 'nothing' : r.ok ? 'allow' : 'deny/' + r.code} ${r?.msg || ''}`; groups[g].bad.push(msg); bad.push(msg); }
      else if (c.deny) deniedOk.add(c.deny);
    }
    if (bad.length) h.log(`${bad.length} matrix mismatch(es):\n      ` + bad.join('\n      '));
    for (const [g, v] of Object.entries(groups)) h.check(`A5 ${g}: ${v.n} cases answer as the rules do`, v.bad.length === 0, v.bad.slice(0, 3).join(' | '));
    h.check(`A5 ${runnable.length} of ${CASES.length} cases ran (the rest: v3.2 collections / batches, the emulator’s job)`, runnable.length >= 180 && rows.length === runnable.length, `${runnable.length} runnable, ${rows.length} answered`);
    h.check('A5 the cases frozen in time (anniversary window) ran on a fixed clock', runnable.filter(c => c.clock).length >= 8, String(runnable.filter(c => c.clock).length));
    h.check('A5 every v4 path of the schema appears in the table', ['app', 'checkins', 'translations', 'bingo', 'polls', 'votes', 'thanks', 'postcards', 'postcardImages', 'anniv'].every(p => CASES.some(c => c.path?.split('/')[0] === p)));
    h.eq('A5 the eight numbered deny cases of 03 §5 are all exercised and refused', [1, 2, 3, 4, 5, 6, 7, 8].filter(n => !deniedOk.has(n)), []);
  });

  // ---------------------------------------------------------------- A9: the emulator runner (Patrick runs it on his computer)
  await h.step('A9 tests/rules: the case table is consistent and the emulator runner loads', async () => {
    h.eq('selfCheck(): unique ids, valid actors/ops, every request builds, deny cases 1–8 covered', selfCheck(), []);
    h.check('the table has the 03 §5 breadth (≥ 200 cases, ≥ 30 for the v3.2 collections and docdb boundaries)', CASES.length >= 200 && CASES.filter(c => c.rulesOnly || c.demoOnly).length >= 30, String(CASES.length));
    const { execFileSync } = await import('node:child_process');
    let out = '';
    try { out = execFileSync(process.execPath, [path.join(h.repo, 'tests/rules/run.mjs'), '--self'], { encoding: 'utf8', timeout: 20000 }); } catch (e) { out = 'FAILED ' + (e.stdout || '') + (e.stderr || ''); }
    h.check('node tests/rules/run.mjs --self exits 0 (no syntax error)', /^ok — \d+ cases/.test(out), out.trim().slice(0, 200));
    const pkg = JSON.parse(fs.readFileSync(path.join(h.repo, 'package.json'), 'utf8'));
    h.check('npm run test:rules starts the emulator with the runner', /firebase emulators:exec --only firestore .*tests\/rules\/run\.mjs/.test(pkg.scripts?.['test:rules'] || ''), pkg.scripts?.['test:rules']);
    const fj = JSON.parse(fs.readFileSync(path.join(h.repo, 'firebase.json'), 'utf8'));
    h.check('firebase.json points at firestore.rules and the emulator port the runner uses', fj.firestore?.rules === 'firestore.rules' && fj.emulators?.firestore?.port === 8080);
  });

  // ---------------------------------------------------------------- docdb: the facade
  await h.step('docdb: usable at once, one backend, shared markers, a watcher can be cancelled before the backend exists', async () => {
    const f1 = await unitPage('units-fresh');
    const r = await inPage(f1, async () => {
      const m = await import('/js/core/docdb.js'), db = m.docdb(), out = {};
      out.early = { backend: db.backend, keys: Object.keys(db).sort(), again: db === m.docdb(), register: typeof m.registerBackend };
      out.first = await db.doc('app/live').get();
      out.late = { backend: db.backend, sameDB: (await m.getDB()) === db };
      out.markers = { ts: db.ts() === db.ts(), tsFrozen: Object.isFrozen(db.ts()), tsShape: JSON.stringify(db.ts()), inc: JSON.stringify(db.inc(2)), incFrozen: Object.isFrozen(db.inc(2)) };
      return out;
    });
    h.eq('before the store has loaded the backend ("demo") is known and the facade has exactly its documented members', r.early, { backend: 'demo', keys: ['backend', 'batch', 'col', 'doc', 'inc', 'ts'], again: true, register: 'function' });
    h.eq('a read issued before the store exists waits for it and answers null for a missing document', r.first, null);
    h.eq('after the backend is ready: still "demo", getDB() hands out the same facade', r.late, { backend: 'demo', sameDB: true });
    h.eq('ts() / inc(n): shared frozen marker objects', r.markers, { ts: true, tsFrozen: true, tsShape: '{"$sv":"ts"}', inc: '{"$sv":"inc","n":2}', incFrozen: true });

    const f2 = await unitPage('units-cancel');
    const fired = await inPage(f2, async () => {
      const m = await import('/js/core/docdb.js'), T = window.__T, db = m.docdb(); let n = 0;
      const off = db.doc('app/live').watch(() => { n++; });
      const isFn = typeof off === 'function'; off();
      await T.sleep(400); T.actor('admin');                                           // by now the store is up
      await db.doc('app/live').set({ cue: 'x', updatedAt: db.ts() }); await T.sleep(100);
      return { isFn, n };
    });
    h.eq('watch() returns off() at once; switched off before the backend is ready it never fires', fired, { isFn: true, n: 0 });
  });

  // ---------------------------------------------------------------- docdb: CRUD
  await h.step('docdb: create / get / set / merge / update / delete, ts(), inc(), auto ids', async () => {
    const r = await inPage(world, async () => {
      const T = window.__T, out = {};
      await T.reset(['gA']); T.actor('admin');
      const db = await T.db(), live = db.doc('app/live'), t0 = Date.now();
      out.empty = await live.get();
      await live.create({ cue: 'c1', cueSeq: 1, cueAt: db.ts(), quiet: false, poll: null, msg: null, updatedAt: db.ts() });
      const a = await live.get();
      out.created = { id: a.id, cue: a.cue, cueSeq: a.cueSeq, quiet: a.quiet, poll: a.poll, msg: a.msg, nums: [typeof a.cueAt, typeof a.updatedAt], same: a.cueAt === a.updatedAt, recent: Math.abs(a.updatedAt - t0) < 15000 };
      out.createAgain = await T.code(live.create({ updatedAt: db.ts() }));
      // set replaces the document; set + merge merges maps deeply and keeps what it does not mention
      await live.set({ quiet: true, updatedAt: db.ts() });
      out.replaced = Object.keys(await live.get()).sort();
      await live.set({ cue: 'c2', msg: { ko: '가', en: 'a' }, updatedAt: db.ts() }, { merge: true });
      await live.set({ msg: { en: 'b' }, updatedAt: db.ts() }, { merge: true });
      const c = await live.get(); out.merged = { cue: c.cue, quiet: c.quiet, msg: c.msg };
      // update: dotted paths replace that one entry wholesale; missing intermediate maps are created
      const st = db.doc('app/settings');
      await st.set({ features: { a: true }, safe: false, phase: 'auto', cfg: { poll: { x: 1 }, bingo: { y: 2 } }, updatedAt: db.ts() });
      await st.update({ 'cfg.poll': { z: 9 }, safe: true, updatedAt: db.ts() });
      const s1 = await st.get(); out.dotted = { cfg: s1.cfg, safe: s1.safe, features: s1.features };
      await st.update({ 'cfg.fresh.deep': 1, features: { b: false }, updatedAt: db.ts() });
      const s2 = await st.get(); out.deep = { cfg: s2.cfg, features: s2.features };
      out.updateMissing = await T.code(db.doc('postcards/nope').update({ place: 'x', updatedAt: db.ts() }));
      out.badFieldPath = await T.code(st.update({ 'cfg..x': 1, updatedAt: db.ts() }));
      // increments: a missing field counts as 0; set has no base value; merge and update use the stored one; concurrent ones are never lost
      await live.set({ updatedAt: db.ts() });
      const seq = async () => (await live.get()).cueSeq, steps = [];
      await live.update({ cueSeq: db.inc(2), updatedAt: db.ts() }); steps.push(await seq());
      for (let i = 0; i < 3; i++) await live.update({ cueSeq: db.inc(1), updatedAt: db.ts() });
      steps.push(await seq());
      await live.update({ cueSeq: db.inc(-1), updatedAt: db.ts() }); steps.push(await seq());
      await Promise.all(Array.from({ length: 10 }, () => live.update({ cueSeq: db.inc(1), updatedAt: db.ts() }))); steps.push(await seq());
      await live.set({ cueSeq: db.inc(3), updatedAt: db.ts() }); steps.push(await seq());
      await live.set({ cueSeq: db.inc(1), updatedAt: db.ts() }, { merge: true }); steps.push(await seq());
      out.inc = steps;
      // delete (and deleting what is not there is fine, as in Firestore)
      const IMG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD', pc = db.doc('postcards/c1');
      await pc.create({ title: { ko: '파리', en: 'Paris' }, place: 'Paris', theme: 'city', thumb: IMG, order: 1, createdAt: db.ts(), updatedAt: db.ts() });
      out.pc = [(await pc.get())?.place, (await db.col('postcards').get()).length];
      await pc.delete();
      out.pcGone = [await pc.get(), (await db.col('postcards').get()).length, await T.code(pc.delete())];
      // auto ids
      const m = await import('/js/core/docdb.js'), ids = Array.from({ length: 2000 }, () => m.newId());
      out.ids = { len20: ids.every(i => i.length === 20), charset: ids.every(i => /^[A-Za-z0-9]{20}$/.test(i)), unique: new Set(ids).size };
      const card = { gid: 'gA', name: 'Kim', note: { ko: 'a', en: 'b' }, photo: null, theme: 'classic', createdAt: db.ts(), updatedAt: db.ts() };
      const id = await db.col('thanks').add(card), got = await db.doc('thanks/' + id).get();
      out.add = { token: /^[A-Za-z0-9]{20}$/.test(id), sameId: got.id === id, theme: got.theme, created: typeof got.createdAt };
      out.addPollId = await T.code(db.col('polls').add({ q: { ko: '가', en: 'a' }, kind: 'choice', options: [], open: true, order: 1, updatedAt: db.ts() }));
      return out;
    });
    h.eq('get of a missing document is null', r.empty, null);
    h.eq('create → get: { id, ...fields }; ts() fields read back as plain ms numbers stamped at the same instant', r.created, { id: 'live', cue: 'c1', cueSeq: 1, quiet: false, poll: null, msg: null, nums: ['number', 'number'], same: true, recent: true });
    h.eq('create on an existing document is already-exists', r.createAgain, 'already-exists');
    h.eq('set replaces the whole document (only the new fields + id remain)', r.replaced, ['id', 'quiet', 'updatedAt']);
    h.eq('set + merge: maps merge deeply, untouched fields stay', r.merged, { cue: 'c2', quiet: true, msg: { ko: '가', en: 'b' } });
    h.eq('update with a dotted path replaces that entry only', r.dotted, { cfg: { poll: { z: 9 }, bingo: { y: 2 } }, safe: true, features: { a: true } });
    h.eq('update creates missing intermediate maps; a plain key is replaced wholesale', r.deep, { cfg: { poll: { z: 9 }, bingo: { y: 2 }, fresh: { deep: 1 } }, features: { b: false } });
    h.eq('update of a missing document is not-found · an empty path segment is invalid-argument', [r.updateMissing, r.badFieldPath], ['not-found', 'invalid-argument']);
    h.eq('inc(): missing → 0+2 · +3 · −1 · 10 concurrent +1 · set has no base (3) · merge uses the stored value (4)', r.inc, [2, 5, 4, 14, 3, 4]);
    h.eq('delete removes the document (and the collection listing); deleting it again is fine', [r.pc, r.pcGone], [['Paris', 1], [null, 0, 'resolved']]);
    h.eq('auto ids: 20 letters/digits, 2000 distinct', r.ids, { len20: true, charset: true, unique: 2000 });
    h.eq('col.add(): returns the id, which is a valid thanks token, and the card reads back', r.add, { token: true, sameId: true, theme: 'classic', created: 'number' });
    h.eq('col.add() into polls is refused: a 20-character auto id is not a poll id (p + up to 12)', r.addPollId, 'invalid-argument');
  });

  // ---------------------------------------------------------------- docdb: invalid data and paths
  await h.step('docdb: data that cannot be stored → invalid-argument (always a rejection); unknown paths → unknown-path', async () => {
    const r = await inPage(world, async () => {
      const T = window.__T, out = {};
      await T.reset([]); T.actor('admin');
      const db = await T.db(), m = await import('/js/core/docdb.js');
      let deep = { v: 1 }; for (let i = 0; i < 25; i++) deep = { n: deep };
      const bad = {
        undefined: { a: undefined }, NaN: { a: NaN }, Infinity: { a: -Infinity }, Date: { a: new Date() }, function: { a: () => 1 }, Map: { a: new Map() }, Set: { a: new Set() },
        instance: { a: new (class Foo {})() }, symbol: { a: Symbol('x') }, bigint: { a: 10n }, svKey: { a: { $sv: 'x' } }, tsKey: { a: { $ts: 5 } }, emptyKey: { '': 1 },
        protoKey: JSON.parse('{"__proto__":1}'), dunderKey: { __x__: 1 }, incInList: { a: [db.inc(1)] }, tsInList: { a: [db.ts()] }, incNaN: { a: db.inc(NaN) }, undefInList: { a: [1, undefined] }, tooDeep: deep,
      };
      out.n = Object.keys(bad).length;
      out.accepted = Object.entries(bad).filter(([, v]) => { try { m.encode(v); return true; } catch (e) { return e.code !== 'invalid-argument'; } }).map(([k]) => k);
      const good = { s: 'x', n: 1.5, z: null, b: false, l: [1, 'a', { k: 2 }, [3]], m: { k: { j: 1 } }, t: db.ts(), i: db.inc(2) }, enc = m.encode(good);
      out.good = { equal: JSON.stringify(enc) === JSON.stringify(good), copy: enc !== good && enc.m !== good.m && enc.l[2] !== good.l[2], markers: enc.t === db.ts(), nullProto: Object.keys(m.encode(Object.assign(Object.create(null), { k: 1 }))) };
      const p = db.doc('app/live').set({ a: NaN, updatedAt: db.ts() });
      out.promise = [p instanceof Promise, await T.code(p)];
      out.api = [
        await T.code(db.doc('app/live').set([1, 2])), await T.code(db.doc('app/live').set(null)), await T.code(db.doc('app/live').set('x')), await T.code(db.doc('app/live').set(undefined)),
        await T.code(db.doc('app/live').update(undefined)), await T.code(db.doc('app/live').create(new Map())), await T.code(db.col('thanks').add(5)),
      ];
      out.paths = [
        await T.code(db.doc('nope/x').get()), await T.code(db.doc('app/other').get()), await T.code(db.doc('guests').get()), await T.code(db.doc('votes/a/b').get()), await T.code(db.doc(5).get()), await T.code(db.doc().get()),
        await T.code(db.col('nope').get()), await T.code(db.col('app').get()), await T.code(db.doc('nope/x').set({ a: 1 })), await T.code(db.doc('nope/x').delete()), await T.code(db.col('nope').add({ a: 1 })),
      ];
      out.building = T.codeSync(() => { db.doc('nope/x'); db.col('nope'); db.doc(5); });
      out.watchSync = [T.codeSync(() => db.doc('nope/x').watch(() => {})), T.codeSync(() => db.col('nope').watch(() => {})), T.codeSync(() => db.doc('app/live').watch('not a function')), T.codeSync(() => db.col('polls').watch(null))];
      return out;
    });
    h.check(`${r.n} kinds of unstorable data are all refused by encode() with invalid-argument`, r.n >= 20 && r.accepted.length === 0, JSON.stringify(r.accepted));
    h.eq('encode() copies plain data (maps, lists, null, nested), keeps the ts()/inc() markers, accepts null-prototype maps', r.good, { equal: true, copy: true, markers: true, nullProto: ['k'] });
    h.eq('a write of bad data returns a rejected promise (never throws synchronously)', r.promise, [true, 'invalid-argument']);
    h.eq('a document must be a map (list, null, string, undefined, Map)', r.api, Array(7).fill('invalid-argument'));
    h.eq('undeclared paths and collections (and "app" as a collection) are unknown-path, for reads and writes', r.paths, Array(11).fill('unknown-path'));
    h.eq('doc() / col() never throw while only building a reference', r.building, 'no throw');
    h.eq('watch() validates synchronously: unknown path/collection → unknown-path, a non-function → invalid-argument', r.watchSync, ['unknown-path', 'unknown-path', 'invalid-argument', 'invalid-argument']);
  });

  // ---------------------------------------------------------------- docdb: guests (v3.2) are readable, never writable
  await h.step('docdb: guests are readable (and watchable) · the other v3.2 collections are closed to docdb', async () => {
    const r = await inPage(world, async () => {
      const T = window.__T, out = {};
      await T.reset(['gA', 'gB']); T.actor('anon');
      const db = await T.db(), store = await (await import('/js/store.js')).getStore();
      out.list = (await db.col('guests').get()).map(g => g.id);
      const one = await db.doc('guests/gA').get();
      out.one = { id: one.id, name: one.name, hidden: one.hidden, createdAt: typeof one.createdAt };
      out.none = await db.doc('guests/zzz').get();
      out.writes = [await T.code(db.doc('guests/gA').update({ message: 'x' })), await T.code(db.doc('guests/gC').set({ name: 'x' })), await T.code(db.doc('guests/gA').delete()), await T.code(db.col('guests').add({ name: 'x' }))];
      out.closed = [await T.code(db.doc('photos/gA').get()), await T.code(db.col('photos').get()), await T.code(db.doc('voices/gA').get()), await T.code(db.doc('capsules/gA').get()),
        await T.code(db.doc('snaps/gA_0').get()), await T.code(db.doc('pulse/gA').get()), await T.code(db.doc('events/e1').get()), await T.code(db.doc('photos/gA').set({ data: 'x' }))];
      // watching: the guest list lives in localStorage — the store tells docdb when it changes
      const calls = [], docs = [];
      const off1 = db.col('guests').watch((list, ch) => calls.push(ch.map(c => c.type + ':' + (c.id.length > 6 ? 'NEW' : c.id)).join(',')));
      const off2 = db.doc('guests/gA').watch(v => docs.push(v ? v.name : null));
      await T.until(() => calls.length >= 1 && docs.length >= 1);
      const { id } = await store.addGuest({ name: 'New', side: 'bride', message: '', avatar: {} });
      await T.until(() => calls.length >= 2);
      await store.updateGuest('gA', { name: 'Renamed' });
      await T.until(() => docs.length >= 2 && calls.length >= 3);
      await store.deleteMany([id]);
      await T.until(() => calls.length >= 4);
      off1(); off2();
      out.calls = calls; out.docs = docs;
      return out;
    });
    h.eq('col("guests").get() lists the guest book; doc("guests/id") reads one ({ id, ...fields }); a stranger is null', [r.list, r.one, r.none], [['gA', 'gB'], { id: 'gA', name: 'Guest gA', hidden: false, createdAt: 'number' }, null]);
    h.eq('docdb never writes guests (update / set / delete / add → permission-denied)', r.writes, Array(4).fill('permission-denied'));
    h.eq('photos · voices · capsules · snaps · pulse · events belong to the store, not docdb (permission-denied, also for a write)', r.closed, Array(8).fill('permission-denied'));
    h.eq('a watcher on guests sees the store’s adds, edits and deletes', r.calls, ['added:gA,added:gB', 'added:NEW', 'modified:gA', 'removed:NEW']);
    h.eq('a watcher on one guest follows its edits', r.docs, ['Guest gA', 'Renamed']);
  });

  // ---------------------------------------------------------------- docdb: queries
  await h.step('docdb: queries — where / orderBy / limit with Firestore’s ordering, and nothing that needs a composite index', async () => {
    const r = await inPage(world, async () => {
      const T = window.__T, out = {};
      await T.reset(['gA']); T.actor('admin');
      const db = await T.db(), m = await import('/js/core/docdb.js');
      const P = (n, o = {}) => ({ q: { ko: '질문 ' + n, en: 'Q' + n }, kind: 'choice', options: ['a', 'b'], open: true, order: n, createdAt: db.ts(), updatedAt: db.ts(), ...o });
      await db.batch().set('polls/pa', P(3)).set('polls/pb', P(1, { open: false })).set('polls/pc', P(2)).set('polls/pd', P(5, { kind: 'guest', options: [] })).set('polls/pe', P(4, { open: false })).commit();
      const ids = q => q.get().then(l => l.map(d => d.id).join(',')), col = () => db.col('polls');
      out.q = {
        all: await ids(col()), open: await ids(col().where('open', '==', true)), two: await ids(col().where('open', '==', true).where('kind', '==', 'choice')),
        byOrder: await ids(col().orderBy('order')), top2: await ids(col().orderBy('order', 'desc').limit(2)),
        range: await ids(col().where('order', '>=', 3)), band: await ids(col().where('order', '>', 1).where('order', '<=', 4).orderBy('order', 'desc')),
        inList: await ids(col().where('order', 'in', [5, 1, 9])), limit1: await ids(col().limit(1)), nested: await ids(col().where('q.ko', '==', '질문 3')), none: await ids(col().where('order', '>', 99)),
      };
      const base = col(), q1 = base.where('open', '==', true);
      out.immutable = [(await base.get()).length, (await q1.get()).length];
      const refused = async f => { try { await f(); return 'resolved'; } catch (e) { return e.code; } };
      out.needIndex = [
        await refused(() => col().where('open', '==', true).orderBy('order').get()), await refused(() => col().orderBy('order').orderBy('open').get()),
        await refused(() => col().where('order', '>', 1).where('open', '==', true).get()), await refused(() => col().where('order', '>', 1).orderBy('kind').get()),
        await refused(() => col().where('order', '>', 1).where('kind', '<', 'z').get()),
      ];
      out.needIndexWatch = T.codeSync(() => col().where('open', '==', true).orderBy('order').watch(() => {}));
      const many = n => Array.from({ length: n }, (_, i) => i);
      out.args = [
        T.codeSync(() => col().where(5, '==', 1)), T.codeSync(() => col().where('a', '!=', 1)), T.codeSync(() => col().where('a', 'in', [])), T.codeSync(() => col().where('a', 'in', many(31))),
        T.codeSync(() => col().where('a', '==', undefined)), T.codeSync(() => col().where('a', '==', [1])), T.codeSync(() => col().orderBy('a', 'up')), T.codeSync(() => col().orderBy('')),
        T.codeSync(() => col().limit(0)), T.codeSync(() => col().limit(1.5)), T.codeSync(() => col().limit(10001)),
      ];
      out.argsOk = [T.codeSync(() => col().where('a', 'in', many(30))), T.codeSync(() => col().limit(10000)), T.codeSync(() => col().where('a', '>=', 1).orderBy('a', 'desc'))];
      // the query engine itself (also what the archive backend of WP-14 will use)
      const docs = [
        { id: 'a', n: 3, s: 'x', b: true, m: { k: 1 }, t: null }, { id: 'b', n: 1, s: 'y', b: false }, { id: 'c', n: 2, s: 'x', b: true, t: 5 },
        { id: 'd', s: 'z' }, { id: 'e', n: 2, s: 'y', b: true }, { id: 'f', n: '2', s: 'x' },
      ];
      const Q = (where = [], order = [], limit = 0) => ({ where, order, limit }), run = q => m.applyQuery(docs, q).map(d => d.id).join('');
      out.apply = {
        all: run(Q()), eq: run(Q([['n', '==', 2]])), twoEq: run(Q([['s', '==', 'x'], ['b', '==', true]])), gt: run(Q([['n', '>', 1]])), gteDesc: run(Q([['n', '>=', 2]], [['n', 'desc']])),
        inList: run(Q([['n', 'in', [1, 3]]])), order: run(Q([], [['n', 'asc']])), orderDesc: run(Q([], [['n', 'desc']], 2)), orderStr: run(Q([], [['s', 'asc']], 3)),
        isNull: run(Q([['t', '==', null]])), deepEq: run(Q([['m', '==', { k: 1 }]])), lt: run(Q([['n', '<', 10]])), missing: run(Q([['zzz', '==', 1]])), typeMismatch: run(Q([['n', '>', '1']])),
      };
      const ai = q => { try { m.assertIndexable(q, 'x'); return 'ok'; } catch (e) { return e.code; } };
      out.index = [
        ai(Q()), ai(Q([['a', '==', 1], ['b', '==', 2]])), ai(Q([['a', 'in', [1]], ['b', '==', 2]])), ai(Q([['a', '>', 1], ['a', '<', 5]])), ai(Q([['a', '>', 1]], [['a', 'asc']])), ai(Q([], [['a', 'desc']])),
        ai(Q([['a', '==', 1]], [['b', 'asc']])), ai(Q([], [['a', 'asc'], ['b', 'asc']])), ai(Q([['a', '>', 1], ['b', '==', 2]])), ai(Q([['a', '>', 1]], [['b', 'asc']])), ai(Q([['a', '>', 1], ['b', '<', 2]])),
      ];
      return out;
    });
    h.eq('no filter → by id · == · two == on different fields · order asc/desc + limit · range filter orders by its field · in · nested field path', r.q,
      { all: 'pa,pb,pc,pd,pe', open: 'pa,pc,pd', two: 'pa,pc', byOrder: 'pb,pc,pa,pe,pd', top2: 'pd,pe', range: 'pa,pe,pd', band: 'pe,pa,pc', inList: 'pb,pd', limit1: 'pa', nested: 'pa', none: '' });
    h.eq('where() / orderBy() / limit() return new references (the original is unchanged)', r.immutable, [5, 3]);
    h.eq('queries that would need a composite index in production are refused as invalid-argument (get → rejection)', r.needIndex, Array(5).fill('invalid-argument'));
    h.eq('…and watch() throws synchronously for them', r.needIndexWatch, 'invalid-argument');
    h.eq('bad where / orderBy / limit arguments throw invalid-argument at once', r.args, Array(11).fill('invalid-argument'));
    h.eq('30 values in "in", limit 10000 and a range + orderBy on the same field are fine', r.argsOk, Array(3).fill('no throw'));
    h.eq('applyQuery: Firestore semantics — missing fields never match, types do not mix, null/deep equality, ties by id, implicit order for ranges', r.apply, {
      all: 'abcdef', eq: 'ce', twoEq: 'ac', gt: 'cea', gteDesc: 'aec', inList: 'ab', order: 'bceaf', orderDesc: 'fa', orderStr: 'acf', isNull: 'a', deepEq: 'a', lt: 'bcea', missing: '', typeMismatch: 'f' });
    h.eq('assertIndexable: equality / one range field / one order field are fine; equality+order(other), 2 orders, range+other filter or order are refused', r.index,
      ['ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'invalid-argument', 'invalid-argument', 'invalid-argument', 'invalid-argument', 'invalid-argument']);
  });

  // ---------------------------------------------------------------- docdb: watch
  await h.step('docdb: watch — documents and collections, off(), same-tab ordering, errors, throwing callbacks, bursts', async () => {
    const r = await inPage(world, async () => {
      const T = window.__T, out = {};
      await T.reset(['gA']); T.actor('admin');
      const db = await T.db(), live = db.doc('app/live');
      // --- a document
      const seen = [], off = live.watch(v => seen.push(v === null ? null : v.cue ?? '-'));
      await T.until(() => seen.length >= 1);
      out.first = seen.slice();
      await live.set({ cue: 'a', updatedAt: db.ts() });
      out.syncAfterWrite = seen.slice();                                // the callback has already run when the write promise resolves
      await T.sleep(5); await live.update({ cue: 'b', updatedAt: db.ts() });
      off(); await T.sleep(5); await live.update({ cue: 'c', updatedAt: db.ts() }); await T.sleep(60);
      out.afterOff = seen.slice();
      // --- a document that does not exist yet / is deleted again
      const pc = [], offPc = db.doc('postcards/c1').watch(v => pc.push(v ? v.place : null));
      await T.until(() => pc.length >= 1);
      const IMG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD';
      await db.doc('postcards/c1').create({ title: { ko: '가', en: 'a' }, place: 'P', theme: 'city', thumb: IMG, order: 1, createdAt: db.ts(), updatedAt: db.ts() });
      await db.doc('postcards/c1').delete();
      offPc(); out.pc = pc;
      // --- a collection: initial state, added / modified / removed, batch = one call
      const P = (n, o = {}) => ({ q: { ko: '질문', en: 'Q' }, kind: 'choice', options: ['a'], open: true, order: n, createdAt: db.ts(), updatedAt: db.ts(), ...o });
      const calls = [], offC = db.col('polls').watch((docs, ch) => calls.push(`${docs.map(d => d.id).join('+')} | ${ch.map(c => `${c.type}:${c.id}${c.data === null ? ':null' : ''}`).join(',')}`));
      await T.until(() => calls.length >= 1);
      await db.doc('polls/pa').create(P(1)); await db.doc('polls/pb').create(P(2));
      await T.sleep(3); await db.doc('polls/pa').update({ order: 7, updatedAt: db.ts() });
      await db.doc('polls/pb').delete();
      await db.batch().set('polls/pc', P(3)).set('polls/pd', P(4)).commit();
      offC(); out.calls = calls;
      // --- a filtered collection follows documents in and out of the filter
      const f = [], offF = db.col('polls').where('open', '==', true).watch((docs, ch) => f.push(ch.map(c => c.type + ':' + c.id).join(',')));
      await T.until(() => f.length >= 1);
      await db.doc('polls/pa').update({ open: false, updatedAt: db.ts() }); await T.sleep(3); await db.doc('polls/pa').update({ open: true, updatedAt: db.ts() });
      offF(); out.filtered = f;
      // --- errors reach onError, not the console; the watcher is simply not attached
      T.actor('anon');
      const errs = [], offT = db.col('thanks').watch(() => errs.push('DATA'), e => errs.push(e.code)), offP = db.doc('photos/gA').watch(() => errs.push('DATA'), e => errs.push(e.code));
      await T.until(() => errs.length >= 2); offT(); offP(); out.errs = errs; T.actor('admin');
      // --- a callback that throws is reported (console.error) and does not stop the watcher
      let n = 0; const offB = live.watch(() => { n++; if (n === 2) throw new Error('UNIT-INTENTIONAL watcher'); });
      await T.until(() => n >= 1);
      await live.update({ cue: 'b1', updatedAt: db.ts() }); await T.sleep(5); await live.update({ cue: 'b2', updatedAt: db.ts() });
      offB(); out.survived = n;
      // --- a burst of 20 writes: strictly increasing values, ending on the last one
      const log = [], offR = live.watch(v => log.push(v && typeof v.cueSeq === 'number' ? v.cueSeq : null));
      await T.until(() => log.length >= 1);
      await Promise.all(Array.from({ length: 20 }, () => live.update({ cueSeq: db.inc(1), updatedAt: db.ts() })));
      offR();
      out.burst = { last: log[log.length - 1], increasing: log.slice(1).every((v, i) => v > (log[i] ?? -1)), calls: log.length };
      return out;
    });
    h.eq('doc.watch: the first call carries the current value (null when missing)', r.first, [null]);
    h.eq('doc.watch: the callback has run before the write promise resolves (same tab)', r.syncAfterWrite, [null, 'a']);
    h.eq('doc.watch: later changes arrive, and off() stops them', r.afterOff, [null, 'a', 'b']);
    h.eq('doc.watch on a missing document: null → value → null again', r.pc, [null, 'P', null]);
    h.eq('col.watch: [] first, then added / modified / removed (removed carries data: null), a batch is ONE call with all its changes', r.calls,
      [' | ', 'pa | added:pa', 'pa+pb | added:pb', 'pa+pb | modified:pa', 'pa | removed:pb:null', 'pa+pc+pd | added:pc,added:pd']);
    h.eq('col.where(...).watch: a document leaves and re-enters the result', r.filtered, ['added:pa,added:pc,added:pd', 'removed:pa', 'added:pa']);
    h.eq('permission errors go to onError (list of thanks and a photo, as a non-admin) — the callback never fires', r.errs, ['permission-denied', 'permission-denied']);
    h.eq('a throwing callback does not kill the watcher', r.survived, 3);
    h.check('a burst of 20 concurrent writes: values only ever increase and the last call carries the final state', r.burst.last === 20 && r.burst.increasing && r.burst.calls <= 22, JSON.stringify(r.burst));

    // identical rewrites are silent: needs a frozen clock (ts() would otherwise differ by a millisecond)
    await clockPage.clock.setFixedTime(new Date('2027-04-10T12:00:00Z'));
    const same = await inPage(clockPage, async () => {
      const T = window.__T; await T.reset([]); T.actor('admin');
      const db = await T.db(), live = db.doc('app/live'), seen = [], off = live.watch(v => seen.push(v ? v.cue : null));
      await T.until(() => seen.length >= 1);
      await live.set({ cue: 'same', updatedAt: db.ts() }); await live.set({ cue: 'same', updatedAt: db.ts() }); await live.set({ cue: 'other', updatedAt: db.ts() });
      off(); return seen;
    });
    h.eq('a rewrite that changes nothing does not call the watcher again', same, [null, 'same', 'other']);
  });

  // ---------------------------------------------------------------- docdb: attaching watchers
  await h.step('docdb: a watcher cancelled while it attaches is detached again; a store that is not ready yet is retried with back-off', async () => {
    const f1 = await unitPage('units-attach');
    const a = await inPage(f1, async () => {
      const m = await import('/js/core/docdb.js'), T = window.__T, rec = { attached: 0, detached: 0 }; let offFn = null;
      m.registerBackend('demo', () => ({
        kind: 'demo', admin: () => { if (offFn) offFn(); return true; }, read: async () => null, list: async () => [], write: async () => {},
        watchDoc: (path, fn) => { rec.attached++; fn(null); return () => { rec.detached++; }; }, watchList: () => () => {},
      }));
      offFn = m.docdb().doc('app/live').watch(() => {});          // admin() runs while the watcher is being attached: off() arrives in the middle
      await T.sleep(150);
      return rec;
    });
    h.eq('off() that arrives while the watcher is being wired up detaches the backend watcher (no leak)', a, { attached: 1, detached: 1 });

    const f2 = await unitPage('units-retry');
    const b = await inPage(f2, async () => {
      const m = await import('/js/core/docdb.js'), T = window.__T, errs = [], got = [], rec = { attached: 0 }; let tries = 0;
      m.registerBackend('demo', () => {
        tries++;
        if (tries === 1) throw Object.assign(new Error('store still loading'), { code: 'unavailable' });
        return { kind: 'demo', admin: () => true, read: async () => null, list: async () => [], write: async () => {}, watchDoc: (path, fn) => { rec.attached++; fn(null); return () => {}; }, watchList: () => () => {} };
      });
      const t0 = performance.now(), off = m.docdb().doc('app/live').watch(v => got.push(v), e => errs.push(e.code));
      await T.until(() => got.length >= 1, 6000);
      const ms = performance.now() - t0; off();
      const late = await T.code(m.docdb().doc('app/live').get());
      return { tries, errs, got, attached: rec.attached, backoff: ms >= 1800 && ms < 5000, late };
    });
    h.eq('"unavailable" is reported once, the watcher retries after ≈ 2 s and attaches (and later calls work)', b, { tries: 2, errs: ['unavailable'], got: [null], attached: 1, backoff: true, late: 'resolved' });
  });

  // ---------------------------------------------------------------- docdb: batch
  await h.step('docdb: batch — all-or-nothing, one change notice, sees the state from before the batch (like get() in the rules)', async () => {
    const r = await inPage(world, async () => {
      const T = window.__T, out = {};
      await T.reset(['gA']); T.actor('admin');
      const db = await T.db(), IMG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD';
      const pc = (n, o = {}) => ({ title: { ko: '엽서', en: 'Card' }, place: 'P' + n, theme: 'city', thumb: IMG, order: n, createdAt: db.ts(), updatedAt: db.ts(), ...o });
      const calls = [], off = db.col('postcards').watch((docs, ch) => calls.push(ch.map(c => c.type + ':' + c.id).join(',')));
      await T.until(() => calls.length >= 1);
      await db.doc('postcards/c9').create(pc(9));
      const b = db.batch();
      await b.set('postcards/c1', pc(1)).set('postcards/c2', pc(2)).update('postcards/c9', { place: 'moved', updatedAt: db.ts() }).commit();
      out.after = (await db.col('postcards').get()).map(d => d.id + ':' + d.place).join(',');
      out.twice = await T.code(b.commit());                                             // a committed batch is empty
      await db.batch().delete('postcards/c9').set('postcards/c3', pc(3)).commit();
      off(); out.calls = calls;
      const before = (await db.col('postcards').get()).length;
      out.failShape = await T.code(db.batch().set('postcards/c4', pc(4)).set('postcards/c5', pc(5, { theme: 'space' })).commit());
      out.failMissing = await T.code(db.batch().set('postcards/c6', pc(6)).update('postcards/zz', { place: 'x', updatedAt: db.ts() }).commit());
      T.actor('anon'); out.failWho = await T.code(db.batch().set('postcards/c7', pc(7)).commit()); T.actor('admin');
      out.untouched = [(await db.col('postcards').get()).length === before, ...(await Promise.all(['c4', 'c5', 'c6', 'c7'].map(id => db.doc('postcards/' + id).get())))];
      out.dup = await T.code(db.batch().set('postcards/c1', pc(1)).delete('postcards/c1').commit());
      const big = db.batch(); for (let i = 0; i < 501; i++) big.set('postcards/x' + i, pc(1));
      out.big = await T.code(big.commit());
      const exact = db.batch(); for (let i = 0; i < 500; i++) exact.set('postcards/y' + i, pc(i));
      out.exact = [await T.code(exact.commit()), (await db.col('postcards').get()).length];
      out.empty = await T.code(db.batch().commit());
      // the rules' get()/exists() read the state BEFORE the batch: a poll created in the same batch is invisible to the vote
      await T.reset(['gA']); T.actor('admin');
      out.relational = await T.code(db.batch().set('polls/p9', { q: { ko: '가', en: 'a' }, kind: 'choice', options: ['x'], open: true, order: 1, createdAt: db.ts(), updatedAt: db.ts() })
        .set('votes/p9_gA', { pid: 'p9', gid: 'gA', choice: 0, updatedAt: db.ts() }).commit());
      out.relationalAfter = [await db.doc('polls/p9').get(), await db.doc('votes/p9_gA').get()];
      return out;
    });
    h.eq('a batch of create + create + update lands together', r.after, 'c1:P1,c2:P2,c9:moved');
    h.eq('committing a batch twice does not write twice', r.twice, 'resolved');
    h.eq('watchers hear ONE call per batch', r.calls, ['', 'added:c9', 'added:c1,added:c2,modified:c9', 'added:c3,removed:c9']);
    h.eq('a batch with one bad write (shape / not-found / not allowed) writes nothing at all', [r.failShape, r.failMissing, r.failWho, ...r.untouched], ['invalid-argument', 'not-found', 'permission-denied', true, null, null, null, null]);
    h.eq('the same document twice in a batch and more than 500 writes are invalid-argument; exactly 500 is fine; an empty batch is fine', [r.dup, r.big, r.exact, r.empty], ['invalid-argument', 'invalid-argument', ['resolved', 503], 'resolved']);
    h.eq('a poll created in the same batch is not visible to the vote that needs it (denied, nothing written) — as in production', [r.relational, ...r.relationalAfter], ['permission-denied', null, null]);
  });

  // ---------------------------------------------------------------- docdb: two tabs of one device
  await h.step('docdb: a second tab sees changes (BroadcastChannel) and concurrent writers never collide (Web Locks)', async () => {
    const pb = await unitPage('units-tab-b', world.context());
    await inPage(world, async () => { const T = window.__T; await T.reset(['gA']); T.actor('admin'); });
    await inPage(pb, async () => {
      const T = window.__T; T.actor('admin'); const db = await T.db();
      window.__seen = []; window.__list = []; window.__seq = null;
      db.doc('app/live').watch(v => { window.__seen.push(v ? v.cue ?? '-' : null); window.__seq = v ? v.cueSeq ?? 0 : null; });
      db.col('polls').watch((docs, ch) => window.__list.push(ch.map(c => c.type + ':' + c.id).join(',')));
      await T.until(() => window.__seen.length >= 1 && window.__list.length >= 1);
    });
    await inPage(world, async () => {
      const db = await window.__T.db();
      await db.doc('app/live').set({ cue: 'from-A', updatedAt: db.ts() });
      await db.doc('polls/pa').create({ q: { ko: '가', en: 'a' }, kind: 'choice', options: ['x'], open: true, order: 1, createdAt: db.ts(), updatedAt: db.ts() });
    });
    const seenB = await inPage(pb, async () => { const T = window.__T; await T.until(() => window.__seen.length >= 2 && window.__list.length >= 2); return { seen: window.__seen, list: window.__list }; });
    h.eq('tab B’s watchers fire when tab A writes', seenB, { seen: [null, 'from-A'], list: ['', 'added:pa'] });
    const incs = pg => inPage(pg, async () => { const db = await window.__T.db(); await Promise.all(Array.from({ length: 10 }, () => db.doc('app/live').update({ cueSeq: db.inc(1), updatedAt: db.ts() }))); });
    await Promise.all([incs(world), incs(pb)]);
    const total = await inPage(world, async () => (await (await window.__T.db()).doc('app/live').get()).cueSeq);
    h.eq('20 concurrent increments from two tabs add up to 20 (writes are serialised across tabs)', total, 20);
    const lastB = await inPage(pb, async () => { const T = window.__T; await T.until(() => window.__seq === 20); return window.__seq; });
    h.eq('…and tab B’s watcher ends on 20', lastB, 20);
    await pb.close();
  });

  // ---------------------------------------------------------------- settings
  await h.step('settings: normalizeSettings / normalizeLive never trust the stored document', async () => {
    const r = await inPage(world, async () => {
      const st = await import('/js/core/settings.js'), out = {};
      const proto = JSON.parse('{"features":{"__proto__":true,"ok":true},"cfg":{"__proto__":{"x":1},"a":{"b":1}}}');
      out.defaults = [null, undefined, [], 'x', 5].map(v => JSON.stringify(st.normalizeSettings(v)));
      out.good = st.normalizeSettings({ features: { poll: true, bingo: false }, safe: true, phase: 'after', cfg: { poll: { n: 3 } }, updatedAt: 1234, id: 'settings', secret: 1 });
      out.junk = st.normalizeSettings({ features: { a: 'yes', b: 1, c: null, d: true }, safe: 'true', phase: 'party', cfg: { a: 5, b: [1], c: { ok: 1 } }, updatedAt: '5' });
      out.proto = [st.normalizeSettings(proto), ({}).x === undefined && ({}).ok === undefined];
      const s = st.normalizeSettings({ features: { a: true }, cfg: { a: { n: 1 } } });
      out.frozen = [Object.isFrozen(s), Object.isFrozen(s.features), Object.isFrozen(s.cfg), Object.isFrozen(s.cfg.a), Object.isFrozen(st.DEFAULT_SETTINGS), Object.isFrozen(st.DEFAULT_LIVE), Object.isFrozen(st.normalizeLive(null))];
      const src = { cfg: { a: { n: 1 } } }, n2 = st.normalizeSettings(src); src.cfg.a.n = 99; out.copy = n2.cfg.a.n;
      out.live = {
        defaults: JSON.stringify(st.normalizeLive(null)),
        good: st.normalizeLive({ cue: 'cue1', cueSeq: 4, cueAt: 99, quiet: true, poll: 'p1', msg: { ko: '안내', en: 'Notice' }, updatedAt: 7 }),
        junk: st.normalizeLive({ cue: 'c'.repeat(25), cueSeq: -1, cueAt: 'x', quiet: 1, poll: 5, msg: 'x', updatedAt: null }),
        cueSeq: [st.normalizeLive({ cueSeq: 1.5 }).cueSeq, st.normalizeLive({ cueSeq: 7 }).cueSeq, st.normalizeLive({ cueSeq: '3' }).cueSeq],
        msg: [st.normalizeLive({ msg: { ko: '가'.repeat(100), en: 'e' } }).msg.ko.length, st.normalizeLive({ msg: { ko: '', en: '' } }).msg, st.normalizeLive({ msg: { ko: 5, en: 'only' } }).msg, st.normalizeLive({ msg: { fr: 'x' } }).msg],
      };
      return out;
    });
    const DEF = '{"features":{},"safe":false,"phase":"auto","cfg":{},"updatedAt":null}';
    h.eq('anything that is not a map normalizes to the defaults (features {}, safe false, phase auto, cfg {}, updatedAt null)', r.defaults, Array(5).fill(DEF));
    h.eq('a good document passes; unknown keys (id, secret) are dropped', r.good, { features: { poll: true, bingo: false }, safe: true, phase: 'after', cfg: { poll: { n: 3 } }, updatedAt: 1234 });
    h.eq('wrong types fall back one by one: only boolean flags, only map cfg entries, safe must be true, unknown phase → auto, updatedAt a number', r.junk, { features: { d: true }, safe: false, phase: 'auto', cfg: { c: { ok: 1 } }, updatedAt: null });
    h.eq('"__proto__" keys are skipped and nothing leaks into Object.prototype', r.proto, [{ features: { ok: true }, safe: false, phase: 'auto', cfg: { a: { b: 1 } }, updatedAt: null }, true]);
    h.eq('the result is deeply frozen (also the defaults) and cfg is a copy of the document', [r.frozen, r.copy], [Array(7).fill(true), 1]);
    h.eq('normalizeLive: defaults', r.live.defaults, '{"cue":null,"cueSeq":0,"cueAt":null,"quiet":false,"poll":null,"msg":null,"updatedAt":null}');
    h.eq('normalizeLive: a good document passes', r.live.good, { cue: 'cue1', cueSeq: 4, cueAt: 99, quiet: true, poll: 'p1', msg: { ko: '안내', en: 'Notice' }, updatedAt: 7 });
    h.eq('normalizeLive: cue > 24 chars, negative seq, string time, quiet ≠ true, poll not a string, msg not a map → defaults', r.live.junk, { cue: null, cueSeq: 0, cueAt: null, quiet: false, poll: null, msg: null, updatedAt: null });
    h.eq('normalizeLive: cueSeq must be a non-negative integer', r.live.cueSeq, [0, 7, 0]);
    h.eq('normalizeLive: msg is cut to 80 chars per language, empty or foreign-language-only messages are null', r.live.msg, [80, null, { ko: '', en: 'only' }, null]);
  });

  await h.step('settings: startSettings → sticky settings/live events; the admin helpers write through docdb and come back as events', async () => {
    const sp = await unitPage('units-settings');
    const r = await inPage(sp, async () => {
      const T = window.__T, out = {};
      const bus = await import('/js/core/bus.js'), st = await import('/js/core/settings.js');
      await T.reset(['gA']); T.actor('admin');
      const db = await T.db(), ev = [];
      bus.on('settings', () => ev.push('S')); bus.on('live', () => ev.push('L'));
      const t0 = performance.now(), p1 = st.startSettings(), p2 = st.startSettings(); await p1;
      out.start = { fast: performance.now() - t0 < 1500, same: p1 === p2, ev: ev.slice().sort(),
        arrived: await Promise.race([st.settingsArrived().then(() => 'arrived'), T.sleep(200).then(() => 'pending')]),
        s: JSON.stringify(st.getSettings()), l: JSON.stringify(st.getLive()), sticky: bus.last('settings') === st.getSettings() && bus.last('live') === st.getLive() };
      const S = () => st.getSettings(), L = () => st.getLive(), snap = () => ({ features: S().features, safe: S().safe, phase: S().phase, cfg: S().cfg }), log = {};
      await st.setFeature('poll', true); log.f1 = snap();
      await st.setFeature('bingo', false); log.f2 = snap();
      await st.setFeature('poll', null); log.f3 = snap();
      await st.setSafe(true); log.safe = S().safe; await st.setSafe(false); log.safe2 = S().safe;
      await st.setPhaseOverride('after'); log.ph = S().phase; await st.setPhaseOverride('auto'); log.ph2 = S().phase;
      await st.saveCfg('poll', { a: 1 }); await st.saveCfg('poll', { b: 2 }); await st.saveCfg('bingo', { x: 1 }); log.cfg = S().cfg;
      log.stamp = [typeof S().updatedAt, Math.abs(S().updatedAt - Date.now()) < 15000];
      await st.setLive({ cue: 'cue1', cueSeq: db.inc(1), cueAt: db.ts() }); log.l1 = { cue: L().cue, seq: L().cueSeq, at: typeof L().cueAt };
      await st.setLive({ cue: 'cue2', cueSeq: db.inc(1), cueAt: db.ts() }); log.l2 = { cue: L().cue, seq: L().cueSeq };
      await st.setLive({ quiet: true }); log.l3 = { quiet: L().quiet, cue: L().cue };
      await st.setLive({ msg: { ko: '안내', en: 'Notice' } }); log.l4 = L().msg;
      await st.setLive({ msg: null, poll: 'p1' }); log.l5 = { msg: L().msg, poll: L().poll };
      out.log = log;
      out.refused = [await T.code(st.setFeature('Bad Id!', true)), await T.code(st.setFeature(5, true)), await T.code(st.setPhaseOverride('party')), await T.code(st.saveCfg('poll', 'x')), await T.code(st.saveCfg('bad id', {})), await T.code(st.setLive('x'))];
      T.actor('guest');
      out.nonAdmin = [await T.code(st.setFeature('poll', true)), await T.code(st.setSafe(true)), await T.code(st.setLive({ quiet: false }))];
      T.actor('admin');
      for (let i = 0; i < 39; i++) await st.setFeature('f' + i, true);                       // bingo + 39 = 40: the rules’ limit
      out.forty = Object.keys(S().features).length;
      out.forty1 = await T.code(st.setFeature('f39', true)); out.fortyAfter = Object.keys(S().features).length;
      return out;
    });
    h.eq('startSettings(): resolves at the real first values (not the 2 s timeout), once per page, two sticky events, defaults when nothing is stored', r.start,
      { fast: true, same: true, ev: ['L', 'S'], arrived: 'arrived', s: '{"features":{},"safe":false,"phase":"auto","cfg":{},"updatedAt":null}', l: '{"cue":null,"cueSeq":0,"cueAt":null,"quiet":false,"poll":null,"msg":null,"updatedAt":null}', sticky: true });
    const D = { safe: false, phase: 'auto', cfg: {} };
    h.eq('setFeature: true / false / null (= manifest default again) — each save is an event before the promise resolves', [r.log.f1, r.log.f2, r.log.f3],
      [{ features: { poll: true }, ...D }, { features: { poll: true, bingo: false }, ...D }, { features: { bingo: false }, ...D }]);
    h.eq('setSafe / setPhaseOverride round trip', [r.log.safe, r.log.safe2, r.log.ph, r.log.ph2], [true, false, 'after', 'auto']);
    h.eq('saveCfg merges per feature and leaves the other features alone', r.log.cfg, { poll: { a: 1, b: 2 }, bingo: { x: 1 } });
    h.eq('updatedAt is the server time (ms number)', r.log.stamp, ['number', true]);
    h.eq('setLive: a cue with inc()/ts(), the next cue, quiet, a notice, clearing the notice + a poll id (merge keeps the rest)', [r.log.l1, r.log.l2, r.log.l3, r.log.l4, r.log.l5],
      [{ cue: 'cue1', seq: 1, at: 'number' }, { cue: 'cue2', seq: 2 }, { quiet: true, cue: 'cue2' }, { ko: '안내', en: 'Notice' }, { msg: null, poll: 'p1' }]);
    h.eq('bad ids / phases / patches are invalid-argument', r.refused, Array(6).fill('invalid-argument'));
    h.eq('a non-admin cannot change settings or live (permission-denied)', r.nonAdmin, Array(3).fill('permission-denied'));
    h.eq('40 features is the limit of the rules — the 41st is refused and nothing changes', [r.forty, r.forty1, r.fortyAfter], [40, 'invalid-argument', 40]);
  });

  await h.step('settings: a slow network (2 s timeout) and a refusing server (rules not published yet) leave the defaults in place', async () => {
    // 1) the backend never answers: startSettings() gives up waiting after 2 s, the real value is still awaited by settingsArrived()
    const slow = await unitPage('units-slow');
    const a = await inPage(slow, async () => {
      const m = await import('/js/core/docdb.js'), bus = await import('/js/core/bus.js');
      m.registerBackend('demo', () => new Promise(() => {}));
      const st = await import('/js/core/settings.js'), t0 = performance.now(), ev = [];
      bus.on('settings', () => ev.push('S')); bus.on('live', () => ev.push('L'));
      await st.startSettings();
      const ms = performance.now() - t0;
      return { ms, ev: ev.sort(), s: JSON.stringify(st.getSettings()), arrived: await Promise.race([st.settingsArrived().then(() => 'arrived'), new Promise(r => setTimeout(() => r('pending'), 300))]) };
    });
    h.check('startSettings() resolves after ≈ 2 s when nothing arrives', a.ms >= 1900 && a.ms < 4500, a.ms.toFixed(0) + ' ms');
    h.eq('…with the defaults for both documents, announced on the bus', [a.ev, a.s], [['L', 'S'], '{"features":{},"safe":false,"phase":"auto","cfg":{},"updatedAt":null}']);
    h.eq('…while settingsArrived() (the prereg gate waits on it) stays pending: a timeout is not "the real value"', a.arrived, 'pending');

    // 2) the server refuses the read (permission-denied): defaults at once, and the gate is released
    const deny = await unitPage('units-denied');
    const b = await inPage(deny, async () => {
      const m = await import('/js/core/docdb.js'), bus = await import('/js/core/bus.js');
      m.registerBackend('demo', () => ({
        kind: 'demo', admin: () => false, read: async () => null, list: async () => [], write: async () => {},
        watchDoc: (path, fn, onError) => { onError(Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' })); return () => {}; },
        watchList: () => () => {},
      }));
      const st = await import('/js/core/settings.js'), t0 = performance.now();
      await st.startSettings();
      return { ms: performance.now() - t0, arrived: await Promise.race([st.settingsArrived().then(() => 'arrived'), new Promise(r => setTimeout(() => r('pending'), 300))]),
        s: JSON.stringify(st.getSettings()), sticky: bus.last('settings') === st.getSettings(), backend: m.docdb().backend };
    });
    h.check('permission-denied on both documents: startSettings() resolves at once (no 2 s wait)', b.ms < 1500, b.ms.toFixed(0) + ' ms');
    h.eq('…with the defaults, a released gate, and a registered backend replaces the built-in one (WP-14 hook)', [b.arrived, b.s, b.sticky, b.backend], ['arrived', '{"features":{},"safe":false,"phase":"auto","cfg":{},"updatedAt":null}', true, 'demo']);
  });

  // ---------------------------------------------------------------- store.deleteMany (v4 extension)
  await h.step('deleteMany: a deleted guest takes their v4 documents with them (checkins, bingo, translations, anniv, votes, thanks cards); the others stay', async () => {
    const r = await inPage(world, async () => {
      const T = window.__T, out = {};
      await T.reset([]); T.actor('admin');
      const db = await T.db(), store = await (await import('/js/store.js')).getStore();
      const add = async name => (await store.addGuest({ name, side: 'bride', message: 'hi', avatar: { skin: 1 }, activity: 'walk' })).id;
      const a = await add('A'), b = await add('B'), c = await add('C'), names = new Map([[a, 'A'], [b, 'B'], [c, 'C']]);
      const tok = { A: 'a'.repeat(20), B: 'b'.repeat(20), C: 'c'.repeat(20), X: 'x'.repeat(20) };
      await db.doc('polls/p1').set({ q: { ko: '가', en: 'a' }, kind: 'choice', options: ['x', 'y'], open: true, order: 1, createdAt: db.ts(), updatedAt: db.ts() });
      for (const id of [a, b, c]) {
        T.actor('anon');
        await db.doc('checkins/' + id).create({ via: 'phone', createdAt: db.ts() });
        await db.doc('bingo/' + id).create({ done: ['m0'], lines: 0, updatedAt: db.ts() });
        await db.doc('votes/p1_' + id).create({ pid: 'p1', gid: id, choice: 1, updatedAt: db.ts() });
        T.actor('admin');
        await db.doc('translations/' + id).create({ src: 'ko', ko: '가', en: 'a', engine: 'builtin', updatedAt: db.ts() });
        await T.put([['doc:anniv/' + id, { text: 'hi', createdAt: { $ts: 1 } }]]);              // the anniversary window is shut today — written past the rules
      }
      const card = gid => ({ gid, name: 'N', note: { ko: 'a', en: 'b' }, photo: null, theme: 'classic', createdAt: db.ts(), updatedAt: db.ts() });
      await db.doc('thanks/' + tok.A).create(card(a)); await db.doc('thanks/' + tok.B).create(card(b)); await db.doc('thanks/' + tok.C).create(card(c)); await db.doc('thanks/' + tok.X).create(card('someone-else'));
      const label = k => { let s = k; for (const [id, n] of names) s = s.split(id).join(n); return s; };
      const keys = async () => (await T.keys('doc:')).map(label).sort();
      out.before = (await keys()).length;
      const seen = [], off = db.col('checkins').watch((docs, ch) => ch.forEach(x => seen.push(x.type + ':' + label(x.id))));
      await T.until(() => seen.length >= 3);
      await store.deleteMany([a, b]);
      out.after = await keys();
      out.guests = store.backend.guests().map(g => label(g.id));
      await T.until(() => seen.length >= 5);
      off(); out.removed = seen.slice(3).sort();
      await store.deleteMany([]); await store.deleteMany(['nobody']);
      out.afterNoop = (await keys()).length;
      await store.deleteMany([c]); out.last = await keys();
      out.deleteGuest = await (async () => { const d = await add('D'); await db.doc('checkins/' + d).create({ via: 'kiosk', createdAt: db.ts() }); await store.deleteGuest(d); return await db.doc('checkins/' + d).get(); })();
      return out;
    });
    h.eq('seeded: 6 documents per guest (checkin, bingo, vote, translation, anniv, card) × 3 + the poll + a stranger’s card', r.before, 20);
    h.eq('deleteMany([A, B]) removes exactly their documents (the poll, C’s documents and the stranger’s card stay)', r.after,
      ['doc:anniv/C', 'doc:bingo/C', 'doc:checkins/C', 'doc:polls/p1', 'doc:thanks/' + 'c'.repeat(20), 'doc:thanks/' + 'x'.repeat(20), 'doc:translations/C', 'doc:votes/p1_C']);
    h.eq('the v3.2 part is unchanged: the guests are gone from the list, C is still there', r.guests, ['C']);
    h.eq('docdb watchers hear the removals (store → BroadcastChannel → docdb)', r.removed, ['removed:A', 'removed:B']);
    h.eq('deleteMany([]) and deleteMany(["nobody"]) are harmless', r.afterNoop, 8);
    h.eq('the last guest takes the rest of their documents; the poll and the stranger’s card remain', r.last, ['doc:polls/p1', 'doc:thanks/' + 'x'.repeat(20)]);
    h.eq('deleteGuest(id) goes through deleteMany (v4 documents too)', r.deleteGuest, null);
  });
};

// ============================================================
//  WP-10 poll — docs/v4/wp/WP-10-poll.md · 04-testing §4.1 (S1–S9) + A1–A11
//  Admin opens a poll → phones vote (hub card · village sheet) → the TV bars grow → close & reveal → result banner → hide.
//  One demo world = one browser context (admin · TV · guest pages share it). The TV is `?tv=1` so a guest page can sit next to it.
// ============================================================
import fs from 'node:fs';
import { signGuest, addGuests } from '../lib/flows.mjs';
import { zipRead } from '../lib/files.mjs';
import { on, off, adminPage, setFlag, expectClean, footprint, dbGet, dbSet, dbCol } from '../lib/v4.mjs';

const ID = 'poll';
export const meta = { title: 'poll: admin opens → phones vote → TV bars → close & reveal → banner → hide · guest polls · rules mirror · layout · backup', timeout: 600000, tags: ['slow'] };

const HANGUL = /[ㄱ-힝]/;
const MIN_FPS = +(process.env.PERF_MIN_FPS || 24);
/** poll a page predicate (sync or async) */
const until = async (page, fn, arg, ms = 8000) => { const t0 = Date.now(); do { if (await page.evaluate(fn, arg).catch(() => false)) return true; await page.waitForTimeout(100); } while (Date.now() - t0 < ms); return false; };
const RECORD = `(() => { window.__pr = []; window.__vc = []; import('/js/core/bus.js').then(b => { b.on('poll:result', p => window.__pr.push(p)); b.on('vote:cast', p => window.__vc.push(p)); }); })();`;

/** TV panel rows → { key: count } and the total */
const tvBars = tv => tv.evaluate(() => {
  const p = document.querySelector('.hud .hz-rm .f-poll-panel'); if (!p) return null;
  return { pid: p.dataset.pid, total: +p.dataset.total, result: p.classList.contains('f-poll-isresult'), rows: Object.fromEntries([...p.querySelectorAll('.f-poll-row')].map(r => [r.dataset.k, +r.querySelector('.f-poll-bn').textContent])), top: [...p.querySelectorAll('.f-poll-row.f-poll-top')].map(r => r.dataset.k) };
});
const card = p => p.$('#s-done section.hub-card[data-hub="f-poll"]');
const adminTab = async a => { await a.click('#atabs [data-tab="f-poll"]'); await a.waitForSelector('.f-poll-alist'); };
const adminRows = a => a.$$eval('.f-poll-arow', ns => ns.map(n => ({ pid: n.dataset.pid, st: n.dataset.st, q: n.querySelector('.f-poll-aq').textContent })));
const vote = (h, page, pid, gid, choice) => dbSet(h, page, `votes/${pid}_${gid}`, { pid, gid, choice, updatedAt: { $sv: 'ts' } });
/** a poll straight into the demo world (as the admin) */
const makePoll = (h, a, pid, data) => dbSet(h, a, 'polls/' + pid, { open: false, order: 1, result: null, options: [], createdAt: { $sv: 'ts' }, updatedAt: { $sv: 'ts' }, ...data });

/** admin + TV (+ a guest page signed in) in one world */
async function world(h, { preset = 'tv', seed = 0, guest = true, name = '투표하객', params = {} } = {}) {
  const ctx = await h.context(preset);
  const a = await adminPage(h, ctx, { params: { ff: on(ID), ...params } });
  if (seed) await addGuests(h, a, seed, '하객');
  await adminTab(a);
  const tv = await h.page(ctx, { tag: 'tv' });
  await tv.addInitScript(RECORD);
  await tv.goto(h.url('village.html', { ff: on(ID), time: 'day', tv: 1, ...params }));
  await until(tv, () => /^\d+$/.test(document.querySelector('#count-n')?.textContent || ''));
  await tv.mouse.click(300, 1000).catch(() => {});
  let g = null, gid = null;
  if (guest) {
    g = await h.page(ctx, { tag: 'guest' });
    await g.addInitScript(RECORD);
    gid = (await signGuest(h, g, { name, msg: '축하해요', params: { ff: on(ID), ...params } })).gid;
  }
  return { ctx, a, tv, g, gid };
}

export default async (h) => {
  h.allowErrors(/permission-denied|invalid-argument|too fast|poll is closed/i);    // the rules-mirror checks reject on purpose

  // ---------------------------------------------------------------- S1 off
  await h.step('S1 off: no trace on the done screen, the TV and admin; the core still works', async () => {
    const ctx = await h.context('tv');
    const p = await h.page(ctx, { tag: 'off' });
    await signGuest(h, p, { name: '끄기', msg: '끄기', params: { ff: off(ID) } });
    await expectClean(h, p, ID, 'S1 done screen');
    await p.goto(h.url('village.html', { ff: off(ID), seed: 6, time: 'day' })); await p.waitForTimeout(1500);
    await expectClean(h, p, ID, 'S1 TV');
    h.check('S1 the TV still counts guests', /^\d+$/.test(await p.textContent('#count-n')));
    const a = await adminPage(h, ctx, { params: { ff: off(ID) } });
    await expectClean(h, a, ID, 'S1 admin');
    h.check('S1 no poll tab', !(await a.$('#atabs [data-tab="f-poll"]')));
    await ctx.close();
  });

  // ---------------------------------------------------------------- A11 pre: drafts in admin · nothing for guests
  await h.step('A11 ?phase=pre: the admin tab works (new · edit · samples) and the guest page has no card', async () => {
    const ctx = await h.context('desktop');
    const a = await adminPage(h, ctx, { params: { ff: on(ID), phase: 'pre' } });
    await adminTab(a);
    h.check('A11 empty list says how to start', /예시 질문/.test(await a.textContent('.f-poll-alist')));
    // new poll: refuses half-filled forms, then saves
    await a.click('.f-poll-new');
    await a.fill('.f-poll-fqko', '케이크 맛은?');
    await a.click('.f-poll-fsave');
    h.check('A11 a half-filled form is refused with a hint', /보기 2개 이상/.test(await a.textContent('.f-poll-fmsg')));
    await a.fill('.f-poll-fqen', 'Which cake flavour?');
    const rows = await a.$$('.f-poll-orow');
    await rows[0].$('.f-poll-oko').then(e => e.fill('초코')); await rows[0].$('.f-poll-oen').then(e => e.fill('Chocolate'));
    await rows[1].$('.f-poll-oko').then(e => e.fill('딸기')); await rows[1].$('.f-poll-oen').then(e => e.fill('Strawberry'));
    await a.click('.f-poll-fsave');
    h.check('A11 saved as a draft', await until(a, () => [...document.querySelectorAll('.f-poll-arow')].some(r => r.dataset.st === 'draft' && r.textContent.includes('케이크 맛은?'))));
    // edit: add a third option
    await a.click('.f-poll-arow[data-st="draft"] .f-poll-edit');
    await a.click('.f-poll-faddopt');
    const r3 = (await a.$$('.f-poll-orow'))[2];
    await r3.$('.f-poll-oko').then(e => e.fill('바닐라')); await r3.$('.f-poll-oen').then(e => e.fill('Vanilla'));
    await a.click('.f-poll-fsave');
    h.check('A11 edit saved (3 options)', await until(a, () => /3\. 바닐라/.test(document.querySelector('.f-poll-arow')?.textContent || '')));
    await a.click('.f-poll-samples');
    h.check('A11 "예시 질문 3개 넣기" adds 3 drafts', await until(a, () => document.querySelectorAll('.f-poll-arow[data-st="draft"]').length === 4));
    h.eq('A11 the samples keep their order after mine', (await adminRows(a)).map(r => r.q), ['케이크 맛은?', '두 사람이 처음 만난 곳은?', '오늘의 베스트 드레서는?', '신혼여행지는 어디일까요?']);
    const stored = await dbCol(h, a, 'polls');
    h.check('A11 the samples are stored in both languages', stored.some(p => p.q.en === 'Best dressed today?' && p.kind === 'guest') && stored.some(p => p.q.en === 'Guess the honeymoon spot!' && p.options.length === 4));
    await h.shot(a, 'poll-1-admin-drafts');
    // open one while it is still pre: the guest page (pre) still has nothing — the phase gate
    const pid = (await adminRows(a))[0].pid;
    await a.click(`.f-poll-open[data-pid="${pid}"]`);
    await until(a, () => !!document.querySelector('.f-poll-arow[data-st="live"]'));
    const g = await h.page(ctx, { tag: 'pre-guest' });
    await signGuest(h, g, { name: '미리', msg: '미리', params: { ff: on(ID), phase: 'pre' } });
    await g.waitForTimeout(800);
    await expectClean(h, g, ID, 'A11 guest page in pre (poll is live-only)');
    await ctx.close();
  });

  // ---------------------------------------------------------------- A2 · A3 · A4 · A7 the whole round (choice)
  let W = null, PID = null;
  await h.step('A2 the live slot opens the next draft → the phone card shows up (≈1 s) → a vote → the TV bar +1', async () => {
    W = await world(h, { seed: 4 });
    const { a, tv, g, gid } = W;
    await a.click('.f-poll-samples');
    await until(a, () => document.querySelectorAll('.f-poll-arow').length === 3);
    PID = (await adminRows(a))[0].pid;
    h.check('A2 the live slot offers "▶ 다음 투표 열기"', /다음 투표 열기/.test(await a.textContent('.f-poll-lmain')));
    await h.shot(a, 'poll-2-admin-live-slot');
    const t0 = Date.now();
    await a.click('.f-poll-lmain');
    const shown = await until(g, () => !!document.querySelector('#s-done section.hub-card[data-hub="f-poll"] .f-poll-opt'), null, 6000);
    const ms = Date.now() - t0;
    h.check(`A2 the card shows up on the phone (${ms} ms; target ≤ 1 s, allowed 3 s on a busy test machine)`, shown && ms <= 3000);
    h.eq('A2 app/live.poll = the opened poll', (await dbGet(h, a, 'app/live'))?.poll, PID);
    h.eq('A2 card: order 50 · question · 4 option buttons', await g.evaluate(() => { const c = document.querySelector('#s-done section.hub-card[data-hub="f-poll"]'); return [c.style.order, c.querySelector('.f-poll-q').textContent, c.querySelectorAll('.f-poll-opt').length]; }), ['50', '두 사람이 처음 만난 곳은?', 4]);
    h.check('A2 the TV shows the panel in the rm zone with 0 votes', await until(tv, () => document.querySelector('.hud .hz-rm .f-poll-panel')?.dataset.total === '0'));
    await (await card(g)).scrollIntoViewIfNeeded();
    await h.shot(g, 'poll-3-phone-card');
    await g.click('#s-done .f-poll-opt[data-i="1"]');
    h.check('A2 "투표 완료!" on the phone', await until(g, () => /투표 완료!/.test(document.querySelector('#s-done .f-poll-view')?.textContent || '')));
    h.eq('A2 vote:cast emitted', await g.evaluate(() => window.__vc.map(v => [v.choice])), [[1]]);
    h.eq('A2 the stored vote', (await dbGet(h, a, `votes/${PID}_${gid}`))?.choice, 1);
    h.check('A2 the TV bar for option 2 grew to 1', await until(tv, () => { const r = document.querySelector('.hud .f-poll-row[data-k="i1"] .f-poll-bn'); return r?.textContent === '1'; }));
    await h.shot(tv, 'poll-4-tv-bars');
  });

  await h.step('A3 change: locked for 2 s, then another option → TV: old −1 · new +1', async () => {
    const { a, tv, g, gid } = W;
    h.check('A3 "다른 걸로 바꾸기" is locked right after voting', await g.evaluate(() => document.querySelector('#s-done .f-poll-change')?.disabled === true));
    const fast = await vote(h, g, PID, gid, 2);
    h.check('A3 a write within 2 s is refused by the rules mirror', fast.ok === false, JSON.stringify(fast));
    h.check('A3 the button unlocks after 2 s', await until(g, () => document.querySelector('#s-done .f-poll-change')?.disabled === false, null, 4000));
    await g.click('#s-done .f-poll-change');
    await g.click('#s-done .f-poll-opt[data-i="2"]');
    h.check('A3 voted again', await until(g, () => /투표 완료!/.test(document.querySelector('#s-done .f-poll-view')?.textContent || '')));
    h.check('A3 TV: option 2 back to 0, option 3 now 1, total still 1', await until(tv, () => { const n = k => document.querySelector(`.hud .f-poll-row[data-k="${k}"] .f-poll-bn`)?.textContent; return n('i1') === '0' && n('i2') === '1' && document.querySelector('.hud .f-poll-panel').dataset.total === '1'; }));
    // three more voters (the seeded guests) for the reveal
    const others = (await dbCol(h, a, 'guests')).map(x => x.id).filter(x => x !== gid).slice(0, 3);
    for (const o of others) h.check(`A3 another guest votes (${o.slice(-4)})`, (await vote(h, a, PID, o, 2)).ok);
    h.check('A3 TV: 4 votes, option 3 leads with 4', await until(tv, () => document.querySelector('.hud .f-poll-panel')?.dataset.total === '4' && document.querySelector('.hud .f-poll-row[data-k="i2"] .f-poll-bn')?.textContent === '4'));
  });

  await h.step('A4 close & reveal → result stored · TV banner + result panel · phone result card · poll:result', async () => {
    const { a, tv, g } = W;
    h.check('A4 the live slot button now says "■ 닫고 결과 발표"', /닫고 결과 발표/.test(await a.textContent('.f-poll-lmain')));
    const banner = h.waitBanner(tv, /🗳 결과: 회사!/, 15000);
    await a.click('.f-poll-lmain');
    h.check('A4 the TV banner "🗳 결과: 회사!"', !!(await banner));
    const doc = await dbGet(h, a, 'polls/' + PID);
    h.check('A4 polls/{pid}: open false · result { total 4, counts, top [2] }', doc?.open === false && doc.result?.total === 4 && JSON.stringify(doc.result.counts) === '[0,0,4,0]' && JSON.stringify(doc.result.top) === '[2]', JSON.stringify(doc?.result));
    h.check('A4 TV panel in result mode with the 🏆 row', await until(tv, () => { const p = document.querySelector('.hud .f-poll-panel'); return p?.classList.contains('f-poll-isresult') && p.querySelector('.f-poll-row.f-poll-top')?.dataset.k === 'i2'; }));
    h.eq('A4 poll:result on the TV', await tv.evaluate(() => window.__pr), [{ pid: PID, top: [2] }]);
    await h.shot(tv, 'poll-5-tv-result');
    h.check('A4 the phone card turns into the result', await until(g, () => !!document.querySelector('#s-done section.hub-card[data-hub="f-poll"] .f-poll-row.f-poll-top')));
    h.check('A4 …and still says what I picked', /내 선택: 회사/.test(await g.textContent('#s-done .f-poll-view')));
    await (await card(g)).scrollIntoViewIfNeeded();
    await h.shot(g, 'poll-6-phone-result');
    const late = await vote(h, a, PID, W.gid, 0);
    h.check('A6 a vote on a closed poll is refused', late.ok === false, JSON.stringify(late));
  });

  await h.step('A7 hide the result → TV panel and phone card go away', async () => {
    const { a, tv, g } = W;
    await a.click('.f-poll-lhide');
    h.check('A7 TV: the panel is gone', await until(tv, () => !document.querySelector('.f-poll-panel')));
    h.check('A7 phone: the card is gone', await until(g, () => !document.querySelector('#s-done section.hub-card[data-hub="f-poll"]')));
    h.eq('A7 app/live.poll = null', (await dbGet(h, a, 'app/live'))?.poll, null);
  });

  // ---------------------------------------------------------------- A5 guest poll · ties
  await h.step('A5 pick a guest: search · not me · a tie → both on the banner and the TV', async () => {
    const { a, tv, g, gid } = W;
    const pid = (await adminRows(a)).find(r => r.q === '오늘의 베스트 드레서는?').pid;
    await a.click(`.f-poll-open[data-pid="${pid}"]`);
    h.check('A5 the card lists guests to pick', await until(g, () => document.querySelectorAll('#s-done .f-poll-gbtn').length >= 4, null, 10000));
    h.check('A5 I am not on the list', !(await g.$(`#s-done .f-poll-gbtn[data-gid="${gid}"]`)));
    await g.fill('#s-done .f-poll-search', '하객2');
    h.eq('A5 search narrows the list', await g.$$eval('#s-done .f-poll-gbtn span', ns => ns.map(n => n.textContent)), ['하객2']);
    await (await card(g)).scrollIntoViewIfNeeded();
    await h.shot(g, 'poll-7-phone-guestpick');
    const target = await g.getAttribute('#s-done .f-poll-gbtn', 'data-gid');
    await g.click('#s-done .f-poll-gbtn');
    h.check('A5 voted for a guest', await until(g, () => /내 선택: 하객2/.test(document.querySelector('#s-done .f-poll-view')?.textContent || '')));
    const all = (await dbCol(h, a, 'guests')).filter(x => x.name.startsWith('하객'));
    const g1 = all.find(x => x.name === '하객1').id, g3 = all.find(x => x.name === '하객3').id;
    await vote(h, a, pid, g1, g3);                       // 하객1 → 하객3 : 하객2 1 · 하객3 1 = a tie
    h.check('A5 TV: two candidates with 1 vote each (avatars)', await until(tv, () => document.querySelectorAll('.hud .f-poll-row .f-poll-face').length === 2 && document.querySelector('.hud .f-poll-panel').dataset.total === '2'));
    const banner = h.waitBanner(tv, /🗳 결과: 하객2, 하객3!|🗳 결과: 하객3, 하객2!/, 15000);
    await a.click('.f-poll-lmain');
    h.check('A5 tie → both names on the banner', !!(await banner));
    const doc = await dbGet(h, a, 'polls/' + pid);
    h.eq('A5 result.top holds both (sorted ids)', doc?.result?.top, [target, g3].sort());
    h.check('A5 TV: both rows marked 🏆', await until(tv, () => document.querySelectorAll('.hud .f-poll-row.f-poll-top').length === 2));
    h.check('A6 a vote for a guest who does not exist is refused', (await vote(h, a, pid, g1, 'gnobody')).ok === false);
    await h.shot(tv, 'poll-8-tv-guest-result');
    await a.click('.f-poll-lhide');
  });

  // ---------------------------------------------------------------- A6 / S7 rules mirror
  await h.step('A6 / S7 the rules mirror: closed poll · out of range · unknown guest · id ≠ data · guests cannot write polls', async () => {
    const { a, g, gid } = W;
    const pid = (await adminRows(a)).find(r => r.q === '신혼여행지는 어디일까요?').pid;
    await a.click(`.f-poll-open[data-pid="${pid}"]`);
    await until(a, () => !!document.querySelector(`.f-poll-arow[data-pid="${pid}"][data-st="live"]`));
    const others = (await dbCol(h, a, 'guests')).map(x => x.id).filter(x => x !== gid);
    h.check('S7 a valid vote passes', (await vote(h, g, pid, gid, 3)).ok);
    h.check('A6 choice 4 of 4 options → refused', (await vote(h, g, pid, others[0], 4)).ok === false);
    h.check('A6 choice "2" (a string in a choice poll) → refused', (await vote(h, g, pid, others[0], '2')).ok === false);
    h.check('A6 a vote document whose id names another guest → refused', (await dbSet(h, g, `votes/${pid}_${others[0]}`, { pid, gid, choice: 1, updatedAt: { $sv: 'ts' } })).ok === false);
    h.check('A6 a vote from a guest id that does not exist → refused', (await vote(h, g, pid, 'gnobody', 1)).ok === false);
    h.check('A6 a guest page cannot create or open a poll', (await dbSet(h, g, 'polls/phack', { q: { ko: 'x', en: 'x' }, kind: 'choice', options: [], open: true, order: 1, createdAt: { $sv: 'ts' }, updatedAt: { $sv: 'ts' } })).ok === false);
    await a.click('.f-poll-lmain');                                                 // close (keeps the world tidy)
    await until(a, () => !document.querySelector('.f-poll-arow[data-st="live"]'));
    await a.click('.f-poll-lhide');
  });

  // ---------------------------------------------------------------- A10 backup · delete
  await h.step('A10 backup ZIP: f-poll/polls.json and f-poll/votes.json match the demo data · delete removes a poll and its votes', async () => {
    const { a } = W;
    const polls = await dbCol(h, a, 'polls'), votes = await dbCol(h, a, 'votes');
    const zip = await h.download(a, () => a.click('#btn-zip'), 'poll-backup.zip');
    const buf = zip ? fs.readFileSync(zip) : Buffer.alloc(0);
    const pj = zip ? zipRead(buf, 'f-poll/polls.json') : null, vj = zip ? zipRead(buf, 'f-poll/votes.json') : null;
    h.check(`A10 polls.json has the ${polls.length} polls`, !!pj && JSON.parse(pj.toString()).length === polls.length);
    h.check(`A10 votes.json has the ${votes.length} votes`, !!vj && JSON.parse(vj.toString()).length === votes.length);
    const pid = (await adminRows(a))[0].pid;
    const before = votes.filter(v => v.pid === pid).length;
    await a.click(`.f-poll-delete[data-pid="${pid}"]`);
    h.check('A10 delete asks once more', /지울까요/.test(await a.textContent(`.f-poll-delete[data-pid="${pid}"]`)));
    await a.click(`.f-poll-delete[data-pid="${pid}"]`);
    h.check('A10 the poll is gone from the list', await until(a, p => !document.querySelector(`.f-poll-arow[data-pid="${p}"]`), pid));
    h.check(`A10 …and its ${before} votes are gone`, before > 0 && (await dbCol(h, a, 'votes')).every(v => v.pid !== pid));
    await W.ctx.close();
  });

  // ---------------------------------------------------------------- A6 (S5) phone village: 🗳 action → sheet
  await h.step('S5 / A2 phone village: the 🗳 button appears while a poll is open → sheet → vote', async () => {
    const ctx = await h.context('phone');
    const g = await h.page(ctx, { tag: 'phone' });
    const { gid } = await signGuest(h, g, { name: '마을투표', msg: '축하', params: { ff: on(ID) } });
    await addGuests(h, g, 2, '이웃');
    await g.goto(h.url('village.html', { me: gid, ff: on(ID) })); await g.waitForTimeout(1500);
    h.check('S5 no 🗳 button while no poll is open', !(await g.$('#mremote [data-fa="f-poll"]')));
    const a = await adminPage(h, ctx, { params: { ff: on(ID) } });
    await makePoll(h, a, 'pvill', { q: { ko: '첫 곡은?', en: 'First song?' }, kind: 'choice', options: [{ ko: '발라드', en: 'Ballad' }, { ko: '댄스', en: 'Dance' }] });
    await adminTab(a); await a.click('.f-poll-open[data-pid="pvill"]');
    h.check('S5 the 🗳 button appears', await until(g, () => !!document.querySelector('#mremote [data-fa="f-poll"]'), null, 8000));
    await g.click('#mremote [data-fa="f-poll"]');
    h.check('S5 the sheet has the options', await until(g, () => document.querySelectorAll('#fsheet .f-poll-opt').length === 2));
    await h.shot(g, 'poll-9-village-sheet');
    await g.click('#fsheet .f-poll-opt[data-i="1"]');
    h.check('S5 voted from the village', await until(g, () => /투표 완료!/.test(document.querySelector('#fsheet .f-poll-view')?.textContent || '')));
    h.eq('S5 stored', (await dbGet(h, a, `votes/pvill_${gid}`))?.choice, 1);
    await a.click('.f-poll-lmain');                                                 // close → the button goes away
    h.check('S5 closing the poll removes the 🗳 button', await until(g, () => !document.querySelector('#mremote [data-fa="f-poll"]'), null, 8000));
    await ctx.close();
  });

  // ---------------------------------------------------------------- A8 / A9 layout · simple mode
  await h.step('A8 / A9 layout: 8 options on phoneSE (simple mode too, buttons ≥ 56 px) and 8 bars on the TV', async () => {
    const opts = Array.from({ length: 8 }, (_, i) => ({ ko: `아주 긴 보기 이름 ${i + 1}번 — 줄이 넘어가도 괜찮아요`, en: `A rather long option number ${i + 1}` }));
    const ctx = await h.context('phoneSE');
    const a = await adminPage(h, ctx, { params: { ff: on(ID) } });
    await makePoll(h, a, 'peight', { q: { ko: '여덟 개 중에 고르세요 — 질문도 조금 길게 써 봤어요', en: 'Pick one of eight' }, kind: 'choice', options: opts });
    await adminTab(a); await a.click('.f-poll-open[data-pid="peight"]');
    const g = await h.page(ctx, { tag: 'se' });
    await signGuest(h, g, { name: '배치', msg: '배치', params: { ff: on(ID) } });
    await until(g, () => document.querySelectorAll('#s-done .f-poll-opt').length === 8);
    let r = await h.layoutReport(g);
    h.check('A8 phoneSE card with 8 options: no overlaps · no sideways scroll · tap targets', !r.overlaps.length && !r.hscroll && !r.small.length, JSON.stringify(r).slice(0, 300));
    h.check('A9 every option button is ≥ 56 px tall', await g.$$eval('#s-done .f-poll-opt', ns => ns.every(n => n.getBoundingClientRect().height >= 56)));
    await (await card(g)).scrollIntoViewIfNeeded();
    await h.shot(g, 'poll-10-phoneSE-8');
    const s = await h.page(ctx, { tag: 'simple' });
    await signGuest(h, s, { name: '어르신', msg: '축하합니다', simple: true, params: { ff: on(ID) } });
    h.check('A9 simple mode: the card is there with 8 options', await until(s, () => document.querySelectorAll('#s-done .f-poll-opt').length === 8));
    h.check('A9 simple mode: buttons ≥ 56 px', await s.$$eval('#s-done .f-poll-opt', ns => ns.every(n => n.getBoundingClientRect().height >= 56)));
    r = await h.layoutReport(s);
    h.check('A9 simple mode: no overlaps', !r.overlaps.length && !r.hscroll, JSON.stringify(r).slice(0, 300));
    // a few votes so the TV has bars to draw
    const ids = (await dbCol(h, a, 'guests')).map(x => x.id);
    for (const [i, id] of ids.entries()) await vote(h, a, 'peight', id, i % 8);
    await ctx.close();

    const tvc = await h.context('tv');
    const ta = await adminPage(h, tvc, { params: { ff: on(ID) } });
    const gids = await addGuests(h, ta, 30, '손님');
    await makePoll(h, ta, 'peight', { q: { ko: '여덟 개 중에 고르세요 — 질문도 조금 길게 써 봤어요', en: 'Pick one of eight' }, kind: 'choice', options: opts });
    await adminTab(ta); await ta.click('.f-poll-open[data-pid="peight"]');
    for (const [i, id] of gids.entries()) await vote(h, ta, 'peight', id, i % 8);
    const tv = await h.page(tvc, { tag: 'tv8' });
    await tv.goto(h.url('village.html', { ff: on(ID), time: 'day' }));
    h.check('A8 TV: 8 bars, 30 votes', await until(tv, () => document.querySelectorAll('.hud .f-poll-row').length === 8 && document.querySelector('.hud .f-poll-panel')?.dataset.total === '30', null, 10000));
    await tv.mouse.click(300, 1000); await tv.waitForTimeout(600);
    r = await h.layoutReport(tv);
    h.check('A8 TV with 8 bars: no overlaps', !r.overlaps.length, r.overlaps.join(' | '));
    const fits = await tv.evaluate(() => { const z = document.querySelector('.hud .hz-rm').getBoundingClientRect(), p = document.querySelector('.f-poll-panel').getBoundingClientRect(); return p.bottom <= z.bottom + 1 && p.right <= z.right + 1; });
    h.check('A8 TV: the panel fits the rm zone (nothing cut off)', fits);
    await h.shot(tv, 'poll-11-tv-8bars');
    await tvc.close();
  });

  // ---------------------------------------------------------------- S3 hot toggle · S4 gates · S6 English · perf
  await h.step('S3 hot toggle: the TV panel and the phone card go when the flag goes off, come back when on', async () => {
    const ctx = await h.context('tv');
    const a = await adminPage(h, ctx);                                               // no ?ff: the admin flag decides (beta = off by default)
    await addGuests(h, a, 3, '토글');
    await setFlag(h, a, ID, true);
    await a.reload(); await a.waitForSelector('#main:not([hidden])');
    await makePoll(h, a, 'phot', { q: { ko: '토글?', en: 'Toggle?' }, kind: 'choice', options: [{ ko: '예', en: 'Yes' }, { ko: '아니요', en: 'No' }] });
    await adminTab(a); await a.click('.f-poll-open[data-pid="phot"]');
    const tv = await h.page(ctx, { tag: 'hot-tv' });
    await tv.goto(h.url('village.html', { time: 'day', tv: 1 }));
    h.check('S3 on: the TV panel is there', await until(tv, () => !!document.querySelector('.f-poll-panel'), null, 10000));
    await setFlag(h, a, ID, false);
    await until(tv, () => !document.querySelector('[data-f="poll"]:not(link)'));
    await tv.waitForTimeout(300);
    await expectClean(h, tv, ID, 'S3 TV after off');
    await setFlag(h, a, ID, true);
    h.check('S3 on again: one panel', await until(tv, () => document.querySelectorAll('.f-poll-panel').length === 1, null, 10000));
    await setFlag(h, a, ID, null);
    await ctx.close();
  });

  await h.step('S4 gates: kiosk never · ?phase=after no card · admin loads in any phase', async () => {
    const ctx = await h.context('tablet');
    const a = await adminPage(h, ctx, { params: { ff: on(ID), phase: 'after' } });
    h.check('S4 admin (after): the tab is there', await until(a, () => !!document.querySelector('#atabs [data-tab="f-poll"]')));
    await makePoll(h, a, 'pgate', { q: { ko: '게이트', en: 'Gate' }, kind: 'choice', options: [{ ko: 'a', en: 'a' }, { ko: 'b', en: 'b' }], open: true });
    await dbSet(h, a, 'app/live', { poll: 'pgate', updatedAt: { $sv: 'ts' } }, { merge: true });
    const k = await h.page(ctx, { tag: 'kiosk' });
    await k.goto(h.url('kiosk.html', { ff: on(ID) })); await k.waitForTimeout(1000);
    await expectClean(h, k, ID, 'S4 kiosk');
    const g = await h.page(ctx, { tag: 'after' });
    await signGuest(h, g, { name: '나중', msg: '나중', params: { ff: on(ID), phase: 'after' } });
    await g.waitForTimeout(800);
    await expectClean(h, g, ID, 'S4 guest page (after)');
    await ctx.close();
  });

  await h.step('S6 English: the card on an English phone — question and options in English, no Hangul', async () => {
    const ctx = await h.context('phone');
    const a = await adminPage(h, ctx, { params: { ff: on(ID) } });
    await makePoll(h, a, 'pen', { q: { ko: '첫 춤 노래는?', en: 'Which song for the first dance?' }, kind: 'choice', options: [{ ko: '발라드', en: 'Ballad' }, { ko: '재즈', en: 'Jazz' }] });
    await adminTab(a); await a.click('.f-poll-open[data-pid="pen"]');
    const g = await h.page(ctx, { tag: 'en' });
    await signGuest(h, g, { name: 'Noah', msg: 'Congrats!', lang: 'en', params: { ff: on(ID) } });
    await until(g, () => document.querySelectorAll('#s-done .f-poll-opt').length === 2);
    const txt = await g.textContent('#s-done section.hub-card[data-hub="f-poll"]');
    h.check('S6 card in English', !HANGUL.test(txt) && txt.includes('Which song for the first dance?') && txt.includes('Live poll'), txt);
    await g.click('#s-done .f-poll-opt[data-i="1"]');
    h.check('S6 voted text in English', await until(g, () => /Voted! Watch the big screen/.test(document.querySelector('#s-done .f-poll-view')?.textContent || '')));
    await ctx.close();
  });

  await h.step(`perf: TV with 50 villagers at night and an open poll's panel → ≥ ${MIN_FPS} fps`, async () => {
    const ctx = await h.context('tv');
    const a = await adminPage(h, ctx, { params: { ff: on(ID) } });
    const gids = await addGuests(h, a, 50, '성능');
    await makePoll(h, a, 'pfps', { q: { ko: '성능?', en: 'Perf?' }, kind: 'choice', options: [{ ko: 'a', en: 'a' }, { ko: 'b', en: 'b' }, { ko: 'c', en: 'c' }] });
    await adminTab(a); await a.click('.f-poll-open[data-pid="pfps"]');
    const tv = await h.page(ctx, { tag: 'fps', fps: true });
    await tv.goto(h.url('village.html', { ff: on(ID), time: 'night' }));
    await until(tv, () => !!document.querySelector('.f-poll-panel'), null, 10000);
    for (const [i, id] of gids.slice(0, 20).entries()) await vote(h, a, 'pfps', id, i % 3);   // votes arriving while we measure
    await tv.waitForTimeout(1500);
    await tv.evaluate(() => window.__fps.reset()); await tv.waitForTimeout(4000);
    const fps = await tv.evaluate(() => window.__fps.frames / ((performance.now() - window.__fps.since) / 1000));
    h.check(`perf ≥ ${MIN_FPS} fps`, fps >= MIN_FPS, `${fps.toFixed(1)} fps`);
    await ctx.close();
  });
};

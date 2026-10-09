// ============================================================
//  WP-10 — 관리자: 탭 "🗳 투표"(order 55) · 라이브 슬롯(order 20) · 백업 f-poll/polls.json · f-poll/votes.json
//  열기 = 다른 열린 투표 닫기 → polls/{pid}.open = true → app/live.poll = pid
//  닫고 발표 = votes 집계 → polls/{pid} { open: false, result } (live.poll 은 그대로 → TV 가 결과를 보여 줌)
//  결과 내리기 = app/live.poll = null · 삭제 = 그 투표의 표를 배치로 지우고 투표 삭제
// ============================================================
import D from './i18n.js';
import { MAX_OPTS, cleanPoll, qText, optText, tally, topText } from './shared.js';

const SAMPLES = [
  { kind: 'choice', q: 'poll_s1_q', options: ['poll_s1_o1', 'poll_s1_o2', 'poll_s1_o3', 'poll_s1_o4'] },
  { kind: 'guest', q: 'poll_s2_q', options: [] },
  { kind: 'choice', q: 'poll_s3_q', options: ['poll_s3_o1', 'poll_s3_o2', 'poll_s3_o3', 'poll_s3_o4'] },
];
const both = k => ({ ko: D.ko[k], en: D.en[k] });       // stored polls are bilingual whatever the admin's language

let pidSeq = 0;
const newPid = () => 'p' + (Date.now() + pidSeq++).toString(36);   // p + 8 base-36 digits (rules: p[a-z0-9]{1,12})

export function setupAdmin(ctx) {
  const A = ctx.admin;
  if (!A?.tabs) return;
  let polls = [], live = null, votes = [], votesFor = null, offVotes = null, editing = null, armed = new Map();
  const names = () => new Map(A.guests().map(g => [g.id, g.name]));
  const fail = e => { msg.textContent = ctx.t('poll_fail_admin', { e: e?.code || e?.message || '?' }); };
  const ok = t => { msg.textContent = t || ''; };

  // ---------------------------------------------------------------- data (subscribed at the end, once the UI exists)
  // the open poll's votes (one listener, only while a poll is open — 03 §7)
  function followVotes() {
    const want = polls.find(p => p.open)?.id || null;
    if (want === votesFor) return;
    if (offVotes) { offVotes(); offVotes = null; }
    votesFor = want; votes = [];
    if (want) offVotes = ctx.db.col('votes').where('pid', '==', want).watch(d => { if (votesFor === want) { votes = d; paint(); } }, e => fail(e));
  }

  // ---------------------------------------------------------------- actions
  async function openPoll(p) {
    ok(ctx.t('poll_wait'));
    try {
      for (const o of polls) if (o.open && o.id !== p.id) await ctx.db.doc('polls/' + o.id).update({ open: false, updatedAt: ctx.db.ts() });
      await ctx.db.doc('polls/' + p.id).update({ open: true, result: null, updatedAt: ctx.db.ts() });
      await A.setLive({ poll: p.id });
      ok('');
    } catch (e) { fail(e); }
  }
  async function closePoll(p) {
    ok(ctx.t('poll_wait'));
    try {
      const all = await ctx.db.col('votes').where('pid', '==', p.id).get();
      const result = tally(p, all);
      await ctx.db.doc('polls/' + p.id).update({ open: false, result, updatedAt: ctx.db.ts() });
      if (live !== p.id) await A.setLive({ poll: p.id });                 // reveal = on the TV even if it had been hidden
      ok(ctx.t('poll_top', { top: topText(p, result, 'ko', id => names().get(id) || id) || '—' }));
    } catch (e) { fail(e); }
  }
  async function hide() { try { await A.setLive({ poll: null }); ok(''); } catch (e) { fail(e); } }
  async function remove(p) {
    if (!armed.has(p.id)) { armed.set(p.id, ctx.after(5000, () => { armed.delete(p.id); paint(); })); paint(); return; }
    armed.get(p.id)(); armed.delete(p.id);
    try {
      const vs = await ctx.db.col('votes').where('pid', '==', p.id).get();
      for (let i = 0; i < vs.length; i += 400) { const b = ctx.db.batch(); vs.slice(i, i + 400).forEach(v => b.delete('votes/' + v.id)); await b.commit(); }
      await ctx.db.doc('polls/' + p.id).delete();
      if (live === p.id) await A.setLive({ poll: null });
      ok('');
    } catch (e) { fail(e); }
  }
  const nextOrder = () => polls.reduce((m, p) => Math.max(m, p.order), 0) + 1;
  async function addSamples() {
    try {
      let order = nextOrder();
      for (const s of SAMPLES) {
        await ctx.db.doc('polls/' + newPid()).set({ q: both(s.q), kind: s.kind, options: s.options.map(both), open: false, order: order++, result: null, createdAt: ctx.db.ts(), updatedAt: ctx.db.ts() });
      }
      ok(ctx.t('poll_saved'));
    } catch (e) { fail(e); }
  }

  // ---------------------------------------------------------------- form (new / edit)
  const form = ctx.el('div', { cls: 'px-box f-poll-form', attrs: { hidden: '' } });
  const fq = { ko: ctx.el('input', { cls: 'input f-poll-fqko', attrs: { maxlength: '120' } }), en: ctx.el('input', { cls: 'input f-poll-fqen', attrs: { maxlength: '120' } }) };
  const kindSel = ctx.el('select', { cls: 'input f-poll-fkind' });
  const optBox = ctx.el('div', { cls: 'f-poll-fopts' });
  const addOpt = ctx.el('button', { cls: 'px-btn small secondary f-poll-faddopt', attrs: { type: 'button' }, on: { click: () => { if (optRows().length < MAX_OPTS) optBox.append(optRow({ ko: '', en: '' })); paintForm(); } } });
  const save = ctx.el('button', { cls: 'px-btn small f-poll-fsave', attrs: { type: 'button' }, on: { click: () => saveForm() } });
  const cancel = ctx.el('button', { cls: 'px-btn small secondary f-poll-fcancel', attrs: { type: 'button' }, on: { click: () => closeForm() } });
  const fmsg = ctx.el('p', { cls: 'tip f-poll-fmsg', attrs: { role: 'status' } });
  const labels = { qko: ctx.el('span'), qen: ctx.el('span'), kind: ctx.el('span') };
  form.append(
    ctx.el('label', { cls: 'f-poll-field', kids: [labels.qko, fq.ko] }),
    ctx.el('label', { cls: 'f-poll-field', kids: [labels.qen, fq.en] }),
    ctx.el('label', { cls: 'f-poll-field', kids: [labels.kind, kindSel] }),
    optBox, addOpt, ctx.el('div', { cls: 'f-poll-frow', kids: [save, cancel] }), fmsg,
  );
  ctx.listen(kindSel, 'change', () => paintForm());
  const optRows = () => [...optBox.querySelectorAll('.f-poll-orow')];
  function optRow(o) {
    const ko = ctx.el('input', { cls: 'input f-poll-oko', attrs: { maxlength: '60' } }), en = ctx.el('input', { cls: 'input f-poll-oen', attrs: { maxlength: '60' } });
    ko.value = o.ko; en.value = o.en;
    const del = ctx.el('button', { cls: 'px-btn small secondary f-poll-odel', text: '−', attrs: { type: 'button' }, on: { click: () => { r.remove(); paintForm(); } } });
    const r = ctx.el('div', { cls: 'f-poll-orow', kids: [ko, en, del] });
    return r;
  }
  function paintForm() {
    labels.qko.textContent = ctx.t('poll_q_ko'); labels.qen.textContent = ctx.t('poll_q_en'); labels.kind.textContent = ctx.t('poll_kind');
    if (!kindSel.options.length) kindSel.append(ctx.el('option', { attrs: { value: 'choice' } }), ctx.el('option', { attrs: { value: 'guest' } }));
    kindSel.options[0].textContent = ctx.t('poll_kind_choice'); kindSel.options[1].textContent = ctx.t('poll_kind_guest');
    const choice = kindSel.value === 'choice';
    optBox.hidden = !choice; addOpt.hidden = !choice;
    optRows().forEach((r, i) => {
      const [ko, en, del] = r.children;
      ko.placeholder = ctx.t('poll_opt', { n: i + 1 }); ko.setAttribute('aria-label', ko.placeholder);
      en.placeholder = ctx.t('poll_opt_en', { n: i + 1 }); en.setAttribute('aria-label', en.placeholder);
      del.setAttribute('aria-label', ctx.t('poll_del_opt'));
    });
    addOpt.textContent = ctx.t('poll_add_opt'); addOpt.disabled = optRows().length >= MAX_OPTS;
    save.textContent = ctx.t('poll_save'); cancel.textContent = ctx.t('poll_cancel');
  }
  function openForm(p) {
    editing = p || null; fmsg.textContent = '';
    fq.ko.value = p?.q.ko || ''; fq.en.value = p?.q.en || '';
    paintForm(); kindSel.value = p?.kind || 'choice';
    optBox.replaceChildren(...(p?.kind === 'choice' && p.options.length ? p.options : [{ ko: '', en: '' }, { ko: '', en: '' }]).map(optRow));
    paintForm();
    form.hidden = false; fq.ko.focus();
  }
  function closeForm() { form.hidden = true; editing = null; }
  async function saveForm() {
    const q = { ko: fq.ko.value.trim(), en: fq.en.value.trim() }, kind = kindSel.value === 'guest' ? 'guest' : 'choice';
    const options = kind === 'choice' ? optRows().map(r => ({ ko: r.children[0].value.trim(), en: r.children[1].value.trim() })).filter(o => o.ko || o.en) : [];
    if (!q.ko || !q.en || (kind === 'choice' && (options.length < 2 || options.some(o => !o.ko || !o.en)))) { fmsg.textContent = ctx.t('poll_need'); return; }
    save.disabled = true;
    try {
      if (editing) {
        await ctx.db.doc('polls/' + editing.id).update({ q, kind, options, updatedAt: ctx.db.ts() });
      } else {
        await ctx.db.doc('polls/' + newPid()).set({ q, kind, options, open: false, order: nextOrder(), result: null, createdAt: ctx.db.ts(), updatedAt: ctx.db.ts() });
      }
      closeForm(); ok(ctx.t('poll_saved'));
    } catch (e) { fmsg.textContent = ctx.t('poll_fail_admin', { e: e?.code || e?.message || '?' }); }
    finally { save.disabled = false; }
  }

  // ---------------------------------------------------------------- tab
  const listBox = ctx.el('div', { cls: 'f-poll-alist' });
  const msg = ctx.el('p', { cls: 'tip f-poll-amsg', attrs: { role: 'status' } });
  const newBtn = ctx.el('button', { cls: 'px-btn small f-poll-new', attrs: { type: 'button' }, on: { click: () => openForm(null) } });
  const sampleBtn = ctx.el('button', { cls: 'px-btn small secondary f-poll-samples', attrs: { type: 'button' }, on: { click: () => addSamples() } });
  A.tabs.add({
    key: 'f-poll', label: () => ctx.t('poll_tab'), order: 55,
    render: section => section.append(ctx.el('div', { cls: 'f-poll-atop', kids: [newBtn, sampleBtn] }), form, msg, listBox),
    onShow: () => paint(),
  });

  const statusOf = p => (p.open ? 'live' : p.result ? 'done' : 'draft');
  const ST_KEY = { live: 'poll_live', done: 'poll_done', draft: 'poll_draft' };
  function pollRow(p) {
    const st = statusOf(p), lang = 'ko';
    const btn = (key, cls, fn, extra = {}) => ctx.el('button', { cls: 'px-btn small f-poll-' + cls, text: ctx.t(key), attrs: { type: 'button', 'data-pid': p.id, ...extra }, on: { click: fn } });
    const acts = [];
    if (!p.open) acts.push(btn('poll_open', 'open', () => openPoll(p)));
    if (p.open) acts.push(btn('poll_close', 'close', () => closePoll(p)));
    if (live === p.id) acts.push(btn('poll_hide', 'hide secondary', () => hide()));
    if (!p.open) acts.push(btn('poll_edit', 'edit secondary', () => openForm(p)));
    acts.push(btn(armed.has(p.id) ? 'poll_delete_confirm' : 'poll_delete', 'delete secondary', () => remove(p)));
    const opts = p.kind === 'choice' ? p.options.map((o, i) => `${i + 1}. ${optText(o, lang)}${p.result ? ` · ${Number(p.result.counts?.[i]) || 0}` : ''}`).join('  ') : ctx.t('poll_kind_guest');
    const count = p.open ? tally(p, votes).total : Number(p.result?.total) || 0;
    const info = [ctx.el('span', { cls: 'f-poll-chip f-poll-st-' + st, text: ctx.t(ST_KEY[st]) })];
    if (live === p.id) info.push(ctx.el('span', { cls: 'f-poll-chip f-poll-st-tv', text: ctx.t('poll_showing') }));
    info.push(ctx.el('span', { cls: 'f-poll-count', text: ctx.t('poll_total', { n: count }) }));
    const kids = [
      ctx.el('div', { cls: 'f-poll-ainfo', kids: info }),
      ctx.el('b', { cls: 'f-poll-aq', text: qText(p, lang) }),
      ctx.el('p', { cls: 'f-poll-aopts', text: opts }),
    ];
    if (p.result) kids.push(ctx.el('p', { cls: 'f-poll-atop1', text: ctx.t('poll_top', { top: topText(p, p.result, lang, id => names().get(id) || id) || '—' }) }));
    kids.push(ctx.el('div', { cls: 'f-poll-aacts', kids: acts }));
    return ctx.el('div', { cls: 'px-box f-poll-arow' + (p.open ? ' f-poll-isopen' : ''), attrs: { 'data-pid': p.id, 'data-st': st }, kids });
  }

  // ---------------------------------------------------------------- live slot: what is on now + the one big button
  const liveText = ctx.el('span', { cls: 'f-poll-ltext' });
  const liveMain = ctx.el('button', { cls: 'px-btn f-poll-lmain', attrs: { type: 'button' }, on: { click: () => {
    const open = polls.find(p => p.open);
    if (open) closePoll(open);
    else { const next = polls.find(p => statusOf(p) === 'draft'); if (next) openPoll(next); }
  } } });
  const liveHide = ctx.el('button', { cls: 'px-btn small secondary f-poll-lhide', attrs: { type: 'button' }, on: { click: () => hide() } });
  A.live.add(ctx.el('div', { cls: 'f-poll-live', kids: [liveText, liveMain, liveHide] }), { order: 20 });

  function paint() {
    newBtn.textContent = ctx.t('poll_new'); sampleBtn.textContent = ctx.t('poll_samples');
    listBox.replaceChildren(...(polls.length ? polls.map(pollRow) : [ctx.el('p', { cls: 'tip', text: ctx.t('poll_empty') })]));
    const open = polls.find(p => p.open), shown = polls.find(p => p.id === live), drafts = polls.filter(p => statusOf(p) === 'draft');
    liveText.textContent = open ? ctx.t('poll_live_open', { q: qText(open, 'ko'), n: tally(open, votes).total })
      : shown?.result ? ctx.t('poll_live_shown', { q: qText(shown, 'ko') }) : ctx.t('poll_live_idle', { n: drafts.length });
    liveMain.textContent = open ? ctx.t('poll_close') : drafts.length ? ctx.t('poll_next') : ctx.t('poll_no_next');
    liveMain.disabled = !open && !drafts.length;
    liveMain.dataset.mode = open ? 'close' : 'open';
    liveHide.textContent = ctx.t('poll_hide'); liveHide.hidden = !live;
    if (!form.hidden) paintForm();
  }
  ctx.bus.on('lang', paint);
  ctx.bus.on('admin:guests', paint);
  paint();
  ctx.db.col('polls').watch(docs => {
    polls = docs.map(cleanPoll).filter(Boolean).sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
    followVotes(); paint();
  }, e => fail(e));
  ctx.onLive(l => { live = l?.poll || null; followVotes(); paint(); });

  // ---------------------------------------------------------------- backup (03 §8): both collections in full
  A.backup.add('f-poll/polls.json', async zip => { zip.file('f-poll/polls.json', JSON.stringify(await ctx.db.col('polls').get(), null, 2)); });
  A.backup.add('f-poll/votes.json', async zip => { zip.file('f-poll/votes.json', JSON.stringify(await ctx.db.col('votes').get(), null, 2)); });
}

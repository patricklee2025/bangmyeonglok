// ============================================================
//  WP-05 — 관리자
//  라이브 슬롯(order 10): 지금 큐 · [다음 ▶ {다음}] (2초 잠금) · [◀ 이전] · 전체 식순에서 바로 선택 · 📢 한 줄 공지(띄우기/내리기)
//  탭 "📋 식순"(order 52): 순서 ▲▼ · 사용 · 이름 KO/EN · 장면 · 조용 · 이벤트 · 배너 KO/EN → cfg.live.program · 기본 식순으로
// ============================================================
import { programOf, labelOf, SCENES, EVENTS, DEFAULT_PROGRAM } from './program.js';

const LOCK_MS = 2000;

export function setupAdmin(ctx) {
  const A = ctx.admin;
  if (!A?.tabs || !A.live) return;
  let live = { cue: null, msg: null }, locked = false, resetArmed = null;
  const program = () => programOf(ctx.cfg());
  const enabled = () => program().filter(c => c.on);
  const fail = e => A.alert(ctx.t('live_fail', { e: e?.code || e?.message || '?' }));

  // ---------------------------------------------------------------- the cue
  async function go(c, { back = false } = {}) {
    if (!c || locked) return;
    locked = true; paintSlot(); ctx.after(LOCK_MS, () => { locked = false; paintSlot(); });
    try {
      await A.setLive({ cue: c.id, cueSeq: ctx.db.inc(1), cueAt: back ? null : ctx.db.ts(), quiet: !!c.quiet, msg: null });
      if (!back && c.event) await (await ctx.store()).sendEvent(c.event);
    } catch (e) { fail(e); }
  }
  const idx = () => enabled().findIndex(c => c.id === live.cue);
  const next = () => { const l = enabled(), i = idx(); return l[i + 1] || (i < 0 ? l[0] : null); };
  const prev = () => { const l = enabled(), i = idx(); return i > 0 ? l[i - 1] : null; };

  // ---------------------------------------------------------------- live slot
  const now = ctx.el('b', { cls: 'f-live-now' });
  const nextBtn = ctx.el('button', { cls: 'px-btn f-live-next', attrs: { type: 'button' }, on: { click: () => go(next()) } });
  const prevBtn = ctx.el('button', { cls: 'px-btn small secondary f-live-prev', attrs: { type: 'button' }, on: { click: () => go(prev(), { back: true }) } });
  const allSum = ctx.el('summary');
  const allList = ctx.el('div', { cls: 'f-live-all' });
  const all = ctx.el('details', { cls: 'f-live-alld', kids: [allSum, allList] });
  const msgKo = ctx.el('input', { cls: 'input f-live-mko', attrs: { maxlength: '80' } });
  const msgEn = ctx.el('input', { cls: 'input f-live-men', attrs: { maxlength: '80' } });
  const msgShow = ctx.el('button', { cls: 'px-btn small f-live-mshow', attrs: { type: 'button' }, on: { click: () => {
    const m = { ko: msgKo.value.trim().slice(0, 80), en: msgEn.value.trim().slice(0, 80) };
    if (!m.ko && !m.en) return;
    A.setLive({ msg: { ko: m.ko || m.en, en: m.en || m.ko } }).catch(ctx.guard(fail));
  } } });
  const msgHide = ctx.el('button', { cls: 'px-btn small secondary f-live-mhide', attrs: { type: 'button' }, on: { click: () => A.setLive({ msg: null }).catch(ctx.guard(fail)) } });
  const msgTitle = ctx.el('b', { cls: 'f-live-mtitle' });
  const msgBox = ctx.el('div', { cls: 'f-live-msgbox', kids: [msgTitle, msgKo, msgEn, ctx.el('div', { cls: 'f-live-mrow', kids: [msgShow, msgHide] })] });
  A.live.add(ctx.el('div', { cls: 'f-live-slot', kids: [ctx.el('div', { cls: 'f-live-row', kids: [now, prevBtn, nextBtn] }), all, msgBox] }), { order: 10 });

  function paintSlot() {
    const lang = ctx.lang(), cur = program().find(c => c.id === live.cue), n = next(), p = prev();
    now.textContent = cur ? ctx.t('live_now', { label: labelOf(cur, lang) }) : ctx.t('live_none');
    nextBtn.textContent = n ? ctx.t('live_next', { label: labelOf(n, lang) }) : ctx.t('live_end');
    nextBtn.disabled = !n || locked; nextBtn.dataset.next = n?.id || '';
    prevBtn.textContent = ctx.t('live_prev'); prevBtn.disabled = !p || locked;
    allSum.textContent = ctx.t('live_all');
    allList.replaceChildren(...enabled().map(c => ctx.el('button', {
      cls: 'px-btn small secondary f-live-pick' + (c.id === live.cue ? ' f-live-cur' : ''), text: labelOf(c, lang), attrs: { type: 'button', 'data-cue': c.id },
      on: { click: () => go(c) },
    })));
    msgTitle.textContent = ctx.t('live_msg');
    msgKo.placeholder = ctx.t('live_msg_ph_ko'); msgEn.placeholder = ctx.t('live_msg_ph_en');
    msgKo.setAttribute('aria-label', msgKo.placeholder); msgEn.setAttribute('aria-label', msgEn.placeholder);
    msgShow.textContent = ctx.t('live_msg_show'); msgHide.textContent = ctx.t('live_msg_hide'); msgHide.disabled = !live.msg;
  }

  // ---------------------------------------------------------------- tab: the program editor
  let draft = null;                                        // the list being edited (saved with 💾)
  const rows = ctx.el('div', { cls: 'f-live-rows' });
  const save = ctx.el('button', { cls: 'px-btn small f-live-save', attrs: { type: 'button' }, on: { click: () => saveDraft() } });
  const reset = ctx.el('button', { cls: 'px-btn small secondary f-live-reset', attrs: { type: 'button' }, on: { click: () => resetDraft() } });
  const out = ctx.el('span', { cls: 'tip f-live-out', attrs: { role: 'status' } });
  A.tabs.add({
    key: 'f-live', label: () => ctx.t('live_tab'), order: 52,
    render: s => s.append(rows, ctx.el('div', { cls: 'f-live-actions', kids: [save, reset, out] })),
    onShow: () => { draft = program(); paintRows(); },
  });
  const SCENE_KEY = { none: 'live_scene_none', cheer: 'live_scene_cheer', aisle: 'live_scene_aisle', hush: 'live_scene_hush', rings: 'live_scene_rings', kiss: 'live_scene_kiss', sway: 'live_scene_sway', recessional: 'live_scene_recessional', feast: 'live_scene_feast', cheers: 'live_scene_cheers', firstdance: 'live_scene_firstdance', cake: 'live_scene_cake', bow: 'live_scene_bow' };
  const EVENT_KEY = { '': 'live_event_none', group: 'live_event_group', bouquet: 'live_event_bouquet', fireworks: 'live_event_fireworks' };

  function paintRows() {
    if (!draft) draft = program();
    rows.replaceChildren(...draft.map((c, i) => {
      const inp = (cls, val, max, label) => { const e = ctx.el('input', { cls: 'input ' + cls, attrs: { maxlength: String(max), 'aria-label': label } }); e.value = val || ''; return e; };
      const ko = inp('f-live-eko', c.ko, 30, ctx.t('live_name_ko')), en = inp('f-live-een', c.en, 30, ctx.t('live_name_en'));
      const bko = inp('f-live-ebko', c.banner?.ko, 60, ctx.t('live_edit_banner') + ' KO'), ben = inp('f-live-eben', c.banner?.en, 60, ctx.t('live_edit_banner') + ' EN');
      bko.placeholder = ctx.t('live_edit_banner') + ' (KO)'; ben.placeholder = ctx.t('live_edit_banner') + ' (EN)';
      const scene = ctx.el('select', { cls: 'input f-live-escene', attrs: { 'aria-label': ctx.t('live_edit_scene') } });
      SCENES.forEach(sc => { const o = ctx.el('option', { text: ctx.t(SCENE_KEY[sc]), attrs: { value: sc } }); scene.append(o); });
      scene.value = c.scene;
      const event = ctx.el('select', { cls: 'input f-live-eevent', attrs: { 'aria-label': ctx.t('live_edit_event') } });
      EVENTS.forEach(ev => event.append(ctx.el('option', { text: ctx.t(EVENT_KEY[ev]), attrs: { value: ev } })));
      event.value = c.event;
      const onBox = ctx.el('input', { attrs: { type: 'checkbox' } }); onBox.checked = c.on;
      const quiet = ctx.el('input', { attrs: { type: 'checkbox' } }); quiet.checked = c.quiet;
      const sync = () => { draft[i] = { ...c, ko: ko.value.trim() || c.id, en: en.value.trim(), scene: scene.value, event: event.value, on: onBox.checked, quiet: quiet.checked, banner: bko.value.trim() || ben.value.trim() ? { ko: bko.value.trim(), en: ben.value.trim() } : null }; };
      for (const e of [ko, en, bko, ben]) ctx.listen(e, 'input', sync);
      for (const e of [scene, event, onBox, quiet]) ctx.listen(e, 'change', sync);
      const move = d => { sync(); const j = i + d; if (j < 0 || j >= draft.length) return; [draft[i], draft[j]] = [draft[j], draft[i]]; paintRows(); };
      return ctx.el('div', { cls: 'px-box f-live-erow' + (c.on ? '' : ' f-live-off'), attrs: { 'data-cue': c.id }, kids: [
        ctx.el('div', { cls: 'f-live-ehead', kids: [
          ctx.el('button', { cls: 'px-btn small secondary f-live-up', text: '▲', attrs: { type: 'button', 'aria-label': '▲' }, on: { click: () => move(-1) } }),
          ctx.el('button', { cls: 'px-btn small secondary f-live-down', text: '▼', attrs: { type: 'button', 'aria-label': '▼' }, on: { click: () => move(1) } }),
          ctx.el('label', { cls: 'f-live-check', kids: [onBox, ctx.el('span', { text: ctx.t('live_edit_on') })] }),
          ctx.el('code', { cls: 'f-live-id', text: c.id }),
        ] }),
        ctx.el('div', { cls: 'f-live-egrid', kids: [ko, en, scene, event, bko, ben] }),
        ctx.el('label', { cls: 'f-live-check', kids: [quiet, ctx.el('span', { text: ctx.t('live_edit_quiet') })] }),
      ] });
    }));
    save.textContent = ctx.t('live_save'); reset.textContent = resetArmed ? ctx.t('live_reset_confirm') : ctx.t('live_reset');
  }
  function saveDraft() {
    out.textContent = '';
    A.saveCfg({ program: draft.map(c => ({ id: c.id, ko: c.ko, en: c.en, scene: c.scene, quiet: c.quiet, event: c.event, banner: c.banner, on: c.on })) })
      .then(ctx.guard(() => { out.textContent = ctx.t('live_saved'); }), ctx.guard(fail));
  }
  function resetDraft() {
    if (!resetArmed) { resetArmed = ctx.after(5000, () => { resetArmed = null; paintRows(); }); paintRows(); return; }
    resetArmed(); resetArmed = null;
    draft = DEFAULT_PROGRAM.map(c => ({ ...c }));
    A.saveCfg({ program: null }).then(ctx.guard(() => { out.textContent = ctx.t('live_saved'); paintRows(); }), ctx.guard(fail));
  }

  ctx.onLive(l => { live = { cue: l?.cue || null, msg: l?.msg || null }; paintSlot(); });
  ctx.onSettings(() => paintSlot());
  ctx.bus.on('lang', () => { paintSlot(); if (draft) paintRows(); });
  paintSlot();
}

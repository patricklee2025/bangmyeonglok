// ============================================================
//  WP-09 빙고 — 4×4 격자 + 미션 상세 (하객 화면 f-bingo · 폰 마을 시트가 같이 씀)
//  칸 탭 → 같은 자리에서 미션 상세로 바뀜 (honor: 완료 → 확인 · code: 4글자 확인 · auto: 설명 + 바로가기) → [이전]으로 격자
// ============================================================
import { guestCode } from '../../core/ui.js';
import { BY_ID, FULL, SHORT, RULE } from './missions.js';
import { checkCode } from './shared.js';

/**
 * opts: { gid, st (bingoState), book (guestBook), go: { snap?, remote?, poll? } — shortcuts for auto missions (omitted = hint only) }
 * Returns { node, paint(state), relabel() }.
 */
export function boardView(ctx, { gid, st, book, go = {} }) {
  let cur = null, open = null, armed = false, busy = false, msg = '', msgOk = false;
  const code = ctx.el('p', { cls: 'f-bingo-code' });
  const status = ctx.el('p', { cls: 'f-bingo-status', attrs: { role: 'status' } });
  const grid = ctx.el('div', { cls: 'f-bingo-grid', attrs: { role: 'grid' } });
  const detail = ctx.el('div', { cls: 'f-bingo-detail', attrs: { hidden: '' } });
  const saved = ctx.el('p', { cls: 'tip f-bingo-saved' });
  const node = ctx.el('div', { cls: 'f-bingo-board', kids: [code, status, grid, detail, saved] });

  function cells() {
    grid.replaceChildren(...cur.card.map((id, i) => {
      const m = BY_ID.get(id), done = cur.done.has(id);
      return ctx.el('button', {
        cls: 'f-bingo-cell' + (done ? ' f-bingo-on' : '') + ' f-bingo-k-' + m.kind,
        attrs: { type: 'button', role: 'gridcell', 'data-m': id, 'data-i': String(i), 'aria-pressed': String(done), 'aria-label': ctx.t(FULL[id]) + (done ? ' — ' + ctx.t('bingo_stamped') : '') },
        kids: [ctx.el('span', { cls: 'f-bingo-ico', text: m.icon }), ctx.el('span', { cls: 'f-bingo-txt', text: ctx.t(SHORT[id]) }), ...(done ? [ctx.el('span', { cls: 'f-bingo-stamp', text: '✓', attrs: { 'aria-hidden': 'true' } })] : [])],
        on: { click: () => { open = id; armed = false; msg = ''; paint(); } },
      });
    }));
  }

  function detailView() {
    const m = BY_ID.get(open), done = cur.done.has(open);
    const kids = [
      ctx.el('p', { cls: 'f-bingo-dico', text: m.icon, attrs: { 'aria-hidden': 'true' } }),
      ctx.el('b', { cls: 'f-bingo-dtitle', text: ctx.t(FULL[open]) }),
    ];
    if (done) kids.push(ctx.el('p', { cls: 'f-bingo-dok', text: ctx.t('bingo_stamped') }));
    else if (m.kind === 'honor') {
      kids.push(ctx.el('button', {
        cls: 'px-btn f-bingo-honor' + (armed ? ' f-bingo-armed' : ''), text: armed ? ctx.t('bingo_confirm') : ctx.t('bingo_done_btn'), attrs: { type: 'button' },
        on: { click: () => { if (!armed) { armed = true; paint(); return; } armed = false; st.mark(open); } },
      }));
    } else if (m.kind === 'code') {
      const input = ctx.el('input', { cls: 'input f-bingo-input', attrs: { type: 'text', inputmode: 'text', autocapitalize: 'characters', autocomplete: 'off', maxlength: '12', placeholder: ctx.t('bingo_code_ph'), 'aria-label': ctx.t('bingo_code_ph') } });
      const check = ctx.el('button', { cls: 'px-btn f-bingo-check', text: ctx.t('bingo_code_check'), attrs: { type: 'button' }, on: { click: () => tryCode(input.value) } });
      ctx.listen(input, 'keydown', e => { if (e.key === 'Enter') tryCode(input.value); });
      kids.push(ctx.el('div', { cls: 'f-bingo-coderow', kids: [input, check] }));
      if (m.rule && m.rule !== 'new') kids.push(ctx.el('p', { cls: 'tip', text: ctx.t('bingo_code_rule', { rule: ctx.t(RULE[m.rule]) }) }));
      if (busy) { input.disabled = true; check.disabled = true; }
    } else {
      kids.push(ctx.el('p', { cls: 'tip', text: ctx.t('bingo_auto_hint') }));
      const target = m.auto === 'vote' ? 'poll' : m.auto === 'remote' ? 'remote' : 'snap';
      const key = { snap: 'bingo_go_snap', remote: 'bingo_go_remote', poll: 'bingo_go_poll' }[target];
      if (typeof go[target] === 'function') kids.push(ctx.el('button', { cls: 'px-btn secondary f-bingo-go', text: ctx.t(key), attrs: { type: 'button', 'data-go': target }, on: { click: () => go[target]() } }));
    }
    if (msg) kids.push(ctx.el('p', { cls: 'f-bingo-msg' + (msgOk ? ' f-bingo-good' : ''), text: msg, attrs: { role: 'status' } }));
    kids.push(ctx.el('button', { cls: 'px-btn secondary small f-bingo-back', text: ctx.t('bingo_back'), attrs: { type: 'button' }, on: { click: () => { open = null; msg = ''; paint(); } } }));
    detail.replaceChildren(...kids);
    detail.querySelector('.f-bingo-input')?.focus({ preventScroll: true });
  }

  function tryCode(v) {
    if (busy || !open) return;
    const id = open, m = BY_ID.get(id);
    busy = true; msg = ctx.t('bingo_code_wait'); msgOk = false; paint();
    checkCode(book, m, gid, v).then(ctx.guard(r => {
      busy = false;
      if (r.ok) { msg = ctx.t('bingo_code_ok', { name: r.who.name }); msgOk = true; st.mark(id); }
      else { msgOk = false; msg = r.why === 'bad' ? ctx.t('bingo_code_bad') : r.why === 'self' ? ctx.t('bingo_code_self') : r.why === 'rule' ? ctx.t('bingo_code_rule', { rule: ctx.t(RULE[m.rule]) }) : ctx.t('bingo_code_none'); }
      paint();
    }), ctx.guard(e => { busy = false; msgOk = false; msg = ctx.t('bingo_code_none'); ctx.log('code check', e?.code || e); paint(); }));
  }

  function paint(s) {
    if (s) cur = s;
    if (!cur) return;
    code.textContent = ctx.t('bingo_my_code', { code: guestCode(gid) });
    status.textContent = ctx.t('bingo_status', { lines: cur.lines, done: cur.cells });
    saved.textContent = cur.offline ? ctx.t('bingo_saved_later') : '';
    grid.hidden = !!open; detail.hidden = !open;
    node.dataset.lines = String(cur.lines); node.dataset.cells = String(cur.cells);
    if (open) detailView(); else cells();
  }
  return { node, paint, relabel: () => paint(), reset: () => { open = null; msg = ''; armed = false; paint(); } };
}

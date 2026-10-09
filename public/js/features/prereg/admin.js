// ============================================================
//  WP-01 §2 S10 — 관리자: 탭 "🎟 체크인"(order 50) · ⚙️ 설정(본식 시각 · 폰 출석 필터) · 백업 f-prereg/checkins.json
//  + 초대 링크·QR (청첩장용, Patrick 2026-10-07) · 입구 포스터 QR (#checkin)
// ============================================================
import { spriteCanvas, fmtDate, qrCanvas, guestCode } from '../../core/ui.js';
import { normalizeAvatar } from '../../avatar.js';
import { isPre, sideOf, inviteUrl, checkinUrl, ceremonyTime, norm } from './shared.js';

export function setupAdmin(ctx) {
  const A = ctx.admin;
  if (!A?.tabs) return;                                  // a page without the admin API (the loader's test page)

  let guests = A.guests();
  const checks = new Map();                              // gid → { via, createdAt }
  let query = '';
  const armed = new Map();                               // gid → timer off (the second press on "undo" within 5 s)

  // ---------------------------------------------------------------- tab
  const stats = ctx.el('p', { cls: 'f-prereg-stats', attrs: { role: 'status' } });
  const search = ctx.el('input', { cls: 'input f-prereg-search', attrs: { type: 'search', placeholder: ctx.t('prereg_admin_search'), 'aria-label': ctx.t('prereg_admin_search') } });
  const list = ctx.el('div', { cls: 'f-prereg-alist' });
  const walkBox = ctx.el('details', { cls: 'f-prereg-walk' });
  const msg = ctx.el('p', { cls: 'tip f-prereg-amsg', attrs: { role: 'status' } });
  ctx.listen(search, 'input', () => { query = norm(search.value); paint(); });

  const qrBlock = (title, url, file, btnKey, withLink) => {
    const qr = qrCanvas(url, { ecc: 'M', scale: 4, pad: 2 }); qr.className = 'f-prereg-aqr'; qr.dataset.url = url;
    const big = () => qrCanvas(url, { ecc: 'M', scale: 12, pad: 4 }).toDataURL('image/png');   // print size
    const copied = ctx.el('span', { cls: 'tip f-prereg-copied' });
    const kids = [ctx.el('b', { text: title })];
    if (withLink) {
      kids.push(ctx.el('div', { cls: 'f-prereg-linkrow', kids: [
        ctx.el('code', { cls: 'f-prereg-url', text: url }),
        ctx.el('button', { cls: 'px-btn small secondary f-prereg-copy', text: ctx.t('prereg_copy'), attrs: { type: 'button' }, on: { click: () => {
          Promise.resolve(navigator.clipboard?.writeText(url)).then(ctx.guard(() => { copied.textContent = ctx.t('prereg_copied'); }), ctx.guard(() => {}));
        } } }), copied,
      ] }));
    }
    kids.push(ctx.el('div', { cls: 'f-prereg-qrrow', kids: [qr, ctx.el('button', { cls: 'px-btn small f-prereg-dl', text: ctx.t(btnKey), attrs: { type: 'button', 'data-file': file }, on: { click: () => A.download(file, big()) } })] }));
    return ctx.el('div', { cls: 'px-box f-prereg-qrbox', kids });
  };

  A.tabs.add({
    key: 'f-prereg', label: () => ctx.t('prereg_admin_tab'), order: 50,
    render: section => section.append(
      ctx.el('div', { cls: 'f-prereg-head', kids: [stats, search] }),
      list, walkBox, msg,
      ctx.el('div', { cls: 'f-prereg-invites', kids: [
        ctx.el('h3', { text: ctx.t('prereg_invite_title') }), ctx.el('p', { cls: 'tip', text: ctx.t('prereg_invite_sub') }),
        qrBlock(ctx.t('prereg_invite_link'), inviteUrl(ctx), 'invite-qr.png', 'prereg_invite_qr', true),
        qrBlock(ctx.t('prereg_poster_title'), checkinUrl(ctx), 'entrance-checkin-qr.png', 'prereg_poster_qr', false),
      ] }),
    ),
    onShow: () => paint(),
  });

  const via = k => ctx.t('prereg_admin_via_' + (['phone', 'kiosk', 'entrance', 'admin'].includes(k) ? k : 'phone'));
  function paint() {
    const visible = guests.filter(g => !g.hidden);
    const pre = visible.filter(isPre), walk = visible.filter(g => !isPre(g));
    stats.textContent = ctx.t('prereg_admin_stats', { pre: pre.length, in: pre.filter(g => checks.has(g.id)).length, walk: walk.length });
    const shown = pre.filter(g => !query || norm(g.name).includes(query) || guestCode(g.id).toLowerCase().includes(query)).sort((a, b) => String(a.name).localeCompare(String(b.name)));
    list.replaceChildren(...(shown.length ? shown.map(row) : [ctx.el('p', { cls: 'tip', text: ctx.t('prereg_admin_none') })]));
    walkBox.replaceChildren(ctx.el('summary', { text: `${ctx.t('prereg_admin_walkins')} · ${walk.length}` }),
      ctx.el('p', { cls: 'f-prereg-walknames', text: walk.map(g => g.name).join(' · ') }));
  }
  function row(g) {
    const c = checks.get(g.id), face = spriteCanvas(normalizeAvatar(g.avatar || {}), 'idle', 2);
    face.className = 'f-prereg-aface'; face.setAttribute('aria-hidden', 'true');
    const state = c ? ctx.t('prereg_admin_done', { time: fmtDate(c.createdAt, 'ko', 'time'), via: via(c.via) }) : ctx.t('prereg_admin_not_yet');
    const btn = c
      ? ctx.el('button', { cls: 'px-btn small secondary f-prereg-undo', text: armed.has(g.id) ? ctx.t('prereg_admin_undo_confirm') : ctx.t('prereg_admin_undo'), attrs: { type: 'button', 'data-gid': g.id }, on: { click: () => undo(g) } })
      : ctx.el('button', { cls: 'px-btn small f-prereg-manual', text: ctx.t('prereg_admin_manual'), attrs: { type: 'button', 'data-gid': g.id }, on: { click: () => manual(g) } });
    return ctx.el('div', { cls: 'f-prereg-arow' + (c ? ' f-prereg-isin' : ''), attrs: { 'data-gid': g.id }, kids: [
      face,
      ctx.el('div', { cls: 'f-prereg-ainfo', kids: [
        ctx.el('b', { text: g.name }),
        ctx.el('span', { cls: 'f-prereg-side f-prereg-' + sideOf(g), text: ctx.t('prereg_side_' + sideOf(g)) }),
        ctx.el('span', { cls: 'f-prereg-code', text: guestCode(g.id) }),
        ctx.el('span', { cls: 'f-prereg-state', text: state }),
      ] }),
      btn,
    ] });
  }
  function manual(g) {
    msg.textContent = '';
    ctx.db.doc('checkins/' + g.id).set({ via: 'admin', createdAt: ctx.db.ts() })
      .catch(ctx.guard(e => { msg.textContent = ctx.t('prereg_admin_fail', { e: e?.code || e?.message || '?' }); }));
  }
  function undo(g) {
    if (!armed.has(g.id)) { armed.set(g.id, ctx.after(5000, () => { armed.delete(g.id); paint(); })); paint(); return; }
    armed.get(g.id)(); armed.delete(g.id);
    ctx.db.doc('checkins/' + g.id).delete().catch(ctx.guard(e => { msg.textContent = ctx.t('prereg_admin_fail', { e: e?.code || e?.message || '?' }); }));
  }

  ctx.bus.on('admin:guests', ({ list: l }) => { guests = l; paint(); });
  ctx.db.col('checkins').watch(docs => {
    checks.clear(); for (const d of docs) checks.set(d.id, { via: d.via, createdAt: d.createdAt });
    paint();
  }, e => { msg.textContent = ctx.t('prereg_admin_fail', { e: e?.code || '?' }); });
  paint();

  // ---------------------------------------------------------------- ⚙️ settings: ceremony time · phone presence
  A.settings.add({ render(box) {
    const c = ctx.cfg();
    const time = ctx.el('input', { cls: 'input f-prereg-time', attrs: { type: 'time', 'aria-label': ctx.t('prereg_cfg_time'), value: ceremonyTime(ctx) } });
    const phone = ctx.el('input', { attrs: { type: 'checkbox' } }); phone.checked = c.phonePresence !== false;
    const out = ctx.el('span', { cls: 'tip f-prereg-cfgmsg', attrs: { role: 'status' } });
    const save = ctx.el('button', { cls: 'px-btn small f-prereg-cfgsave', text: ctx.t('prereg_cfg_save'), attrs: { type: 'button' }, on: { click: () => {
      save.disabled = true; out.textContent = '';
      const t = /^([01]\d|2[0-3]):[0-5]\d$/.test(time.value) ? time.value : '';
      A.saveCfg({ time: t, phonePresence: phone.checked })
        .then(ctx.guard(() => { out.textContent = ctx.t('prereg_cfg_saved'); }), ctx.guard(e => { out.textContent = ctx.t('prereg_admin_fail', { e: e?.code || '?' }); }))
        .finally(() => { save.disabled = false; });
    } } });
    box.append(
      ctx.el('label', { cls: 'f-prereg-field', kids: [ctx.el('b', { text: ctx.t('prereg_cfg_time') }), time] }),
      ctx.el('p', { cls: 'tip f-prereg-cfghint', text: ctx.t('prereg_cfg_time_hint') }),
      ctx.el('label', { cls: 'f-prereg-check', kids: [phone, ctx.el('span', { text: ctx.t('prereg_cfg_phone') })] }),
      ctx.el('div', { cls: 'f-prereg-cfgrow', kids: [save, out] }),
    );
  } });

  // ---------------------------------------------------------------- backup
  A.backup.add('f-prereg/checkins.json', async zip => {
    const docs = await ctx.db.col('checkins').get();
    const byId = new Map(guests.map(g => [g.id, g]));
    zip.file('f-prereg/checkins.json', JSON.stringify(docs.map(d => ({ gid: d.id, name: byId.get(d.id)?.name ?? null, via: d.via, at: d.createdAt })), null, 2));
  });
}

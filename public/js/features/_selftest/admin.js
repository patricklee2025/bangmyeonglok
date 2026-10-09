// ============================================================
//  _selftest — 관리자 부분 (WP-00c §6): ctx.admin 의 모든 API 를 한 번씩 씁니다. 데모 전용.
//  각 사용처에 data-st="<항목>" 표식을 남겨 tests/suites/core-extension.mjs 가 찾습니다. 모든 DOM 은 ctx.el 로만 만듭니다.
// ============================================================

export function adminPart(ctx, badge) {
  const a = ctx.admin;
  const btn = (st, text, fn) => ctx.el('button', { cls: 'px-btn small secondary f-_selftest-btn', text, attrs: { type: 'button', 'data-st': st }, on: { click: fn } });
  const ev = {};                                                       // 받은 버스 이벤트 횟수·마지막 값 (배지의 data-ev)
  const flush = () => { badge.dataset.ev = JSON.stringify(ev); };
  ctx.bus.on('admin:guests', p => { const e = ev['admin:guests'] || (ev['admin:guests'] = { n: 0 }); e.n++; e.last = p.list.length; flush(); }, { replay: true });
  ctx.bus.on('admin:tab', p => { const e = ev['admin:tab'] || (ev['admin:tab'] = { n: 0 }); e.n++; e.last = p.key; flush(); }, { replay: true });

  // ---- 탭 (order 50: 리포트(40)와 설정(90) 사이) ----
  let shown = 0, hidden = 0;
  const info = ctx.el('p', { cls: 'tip', attrs: { 'data-st': 'admin-info' } });
  const out = ctx.el('p', { cls: 'tip', attrs: { 'data-st': 'admin-out' } });
  const paint = () => { info.textContent = JSON.stringify({ guests: a.guests().length, user: a.user().email, shown, hidden }); };
  a.tabs.add({
    key: 'f-_selftest', label: () => ctx.t('_selftest_admin_tab'), order: 50,
    render: section => section.append(
      ctx.el('h2', { text: ctx.t('_selftest_admin_title'), attrs: { 'data-st': 'admin-tab-title' } }), info, out,
      ctx.el('div', { cls: 'row', kids: [
        btn('admin-cfg', ctx.t('_selftest_admin_cfg'), () => { a.saveCfg({ probe: (a.user().email || '').length + 1, at: Date.now() % 1000 }).then(ctx.guard(() => { out.textContent = 'cfg ok'; }), ctx.guard(e => { out.textContent = 'cfg error ' + (e.code || e.message); })); }),
        btn('admin-live', ctx.t('_selftest_admin_live'), () => { a.setLive({ msg: { ko: '점검 공지', en: 'self-test notice' } }).then(ctx.guard(() => { out.textContent = 'live ok'; }), ctx.guard(e => { out.textContent = 'live error ' + (e.code || e.message); })); }),
        btn('admin-alert', ctx.t('_selftest_admin_alert'), () => a.alert('selftest alert')),
        btn('admin-download', ctx.t('_selftest_admin_download'), () => { a.downloadBlob('selftest.txt', new Blob(['self-test'], { type: 'text/plain' })); out.textContent = 'download requested'; }),
        btn('admin-photo', ctx.t('_selftest_admin_photo'), () => { const g = a.guests().find(x => x.hasPhoto); (g ? a.photo(g.id) : Promise.resolve(null)).then(ctx.guard(d => { out.textContent = 'photo ' + (d ? 'yes' : 'none'); })); }),
      ] }),
    ),
    onShow: () => { shown++; badge.dataset.adminShow = String(shown); paint(); },
    onHide: () => { hidden++; badge.dataset.adminHide = String(hidden); },
  });

  // ---- 라이브 슬롯 (order 10) ----
  a.live.add(btn('admin-live-btn', ctx.t('_selftest_admin_live_btn'), () => { badge.dataset.liveClicks = String(Number(badge.dataset.liveClicks || 0) + 1); }), { order: 10 });

  // ---- ⚙️ 설정 섹션 ----
  a.settings.add({
    render: box => {
      const view = ctx.el('pre', { cls: 'tip', text: JSON.stringify(ctx.cfg()), attrs: { 'data-st': 'admin-cfg-view' } });
      box.append(ctx.el('p', { cls: 'tip', text: ctx.t('_selftest_admin_settings'), attrs: { 'data-st': 'admin-settings-box' } }), view);
      // render(box) 는 한 번만 불리므로, 설정이 바뀌면 기능이 직접 다시 그린다 (settings 는 스티키 버스 이벤트)
      ctx.bus.on('settings', ctx.guard(() => { view.textContent = JSON.stringify(ctx.cfg()); }));
    },
  });

  // ---- 백업 파트: 정상 1개 + 일부러 규칙을 어기는 1개 (그 파트만 MISSING.txt 에 적혀야 함) ----
  a.backup.add('f-_selftest/probe.json', async zip => { zip.file('f-_selftest/probe.json', JSON.stringify({ ok: true, guests: a.guests().length })); });
  a.backup.add('bad-path', async zip => { zip.file('f-_selftest/half.txt', 'half'); zip.file('outside.txt', 'not allowed'); });

  // ---- docdb 왕복 (관리자 권한): app/settings 를 읽어 본다 ----
  ctx.db.doc('app/settings').get().then(ctx.guard(d => { badge.dataset.adminDb = d ? 'doc' : 'none'; }));
}

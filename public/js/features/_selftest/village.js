// ============================================================
//  _selftest — 마을 부분 (WP-00c §6): ctx.v 의 모든 API 를 한 번씩 씁니다. 데모 전용.
//  눈에 보이는 것: HUD 4존 칩 · 폰 액션/시트 · 그리기 표식(왼쪽 위 모서리). 나머지는 테스트가 배지(data-st="badge")에
//  커스텀 이벤트 'st-cmd' { detail: { cmd, … } } 를 보내 시키고, 결과는 배지의 data-out / data-* 로 읽습니다.
//  한 기능 전용 API(출석·티커·커플 스프라이트)와 gate 는 ?st=<이름,…> 일 때만 (실제 기능과 owner-conflict 가 나지 않게).
// ============================================================
const slim = p => (p && typeof p === 'object' ? JSON.parse(JSON.stringify(p, (k, v) => (k === 'avatar' || k === 'allIds' ? undefined : v))) : p ?? null);
/** 점검용 출석 규칙: 아이디 글자 코드 합이 짝수인 하객만 (테스트도 같은 식으로 기대값을 계산) */
const even = id => [...String(id)].reduce((a, c) => a + c.charCodeAt(0), 0) % 2 === 0;

export function villagePart(ctx, badge) {
  const v = ctx.v, el = ctx.el;
  const st = new Set((new URLSearchParams(location.search).get('st') || '').split(',').filter(Boolean));
  const bump = key => { badge.dataset[key] = String(Number(badge.dataset[key] || 0) + 1); };
  const out = (cmd, val) => { badge.dataset.out = JSON.stringify({ cmd, val: val ?? null }); bump('outN'); };

  // ---- 버스: 받은 횟수 · 처음/마지막 시각 · 마지막 값 (A6 gate 순서 · 이벤트 모양) ----
  const log = {}, flush = () => { badge.dataset.ev = JSON.stringify(log); };
  const digest = (type, p) => (type === 'village:guests' ? { list: p.list.map(g => g.id).sort(), all: p.allIds.size } : slim(p));
  // 스티키 이벤트는 replay 로 받습니다 — 이미 첫 동기화가 끝난 뒤 켜졌다면 등록하는 순간 동기로 오고 (e.replay), gate 로 기다린 경우엔 실제 첫 값이 옵니다.
  const HIST = new Set(['village:arrived', 'village:event', 'village:emote', 'village:tap', 'remote:sent']);
  let registering = true;
  for (const type of ['lang', 'village:ready', 'village:guests', 'village:level', 'village:snaps', 'village:arrived', 'village:emote', 'village:event', 'village:tap', 'remote:sent', 'snap:uploaded']) {
    ctx.bus.on(type, p => {
      const e = log[type] || (log[type] = { n: 0 }), now = Math.round(performance.now());
      if (!e.n && registering) e.replay = true;
      e.n++; e.first ??= now; e.at = now; e.last = digest(type, p);
      if (HIST.has(type)) (e.hist ||= []).push(e.last);                                // 모양이 중요한 이벤트는 처음 12개를 전부 보관
      if (e.hist && e.hist.length > 12) e.hist.shift();
      flush();
    }, { replay: true });
  }
  registering = false;

  // ---- HUD 4존 (order 정렬 · 폰은 phone 으로 지정한 칩만) ----
  const chip = (name, text) => el('div', { cls: 'f-_selftest-chip', text, attrs: { 'data-st': name } });
  v.hud.add(chip('hud-tl-b', ctx.t('_selftest_v_hud') + ' TL-B'), { zone: 'tl', order: 20 });
  v.hud.add(chip('hud-tl', ctx.t('_selftest_v_hud') + ' TL'), { zone: 'tl', order: 10, phone: 'tl' });   // 나중에 넣었지만 order 가 작아 위
  v.hud.add(chip('hud-tr', ctx.t('_selftest_v_hud') + ' TR'), { zone: 'tr', order: 10 });
  v.hud.add(chip('hud-rm', ctx.t('_selftest_v_hud') + ' RM'), { zone: 'rm', order: 10 });
  v.hud.add(chip('hud-tc', ctx.t('_selftest_v_hud') + ' TC'), { zone: 'tc', order: 10, phone: 'tc' });

  // ---- 프레임 훅: onUpdate · 그리기 3층 · 소품 · decorate · 오버레이 3층 (표식은 월드 왼쪽 위 모서리에 겹쳐 순서를 픽셀로 확인) ----
  let frames = 0, bad = 0;
  const okInfo = i => typeof i.time === 'number' && typeof i.dt === 'number' && typeof i.night === 'boolean' && typeof i.level === 'number';
  v.onUpdate((dt, time) => { frames++; if (!Number.isFinite(dt) || !Number.isFinite(time)) bad++; });
  // 일부러 거꾸로 등록 (fx → overhead → ground): 겹침 순서는 등록 순서가 아니라 코어의 층 순서여야 함
  const drawn = { ground: 0, overhead: 0, fx: 0 }, order = [];
  const seen = (arr, name) => { if (arr.length < 6) arr.push(name); };
  v.onDraw((g, i) => { drawn.fx++; seen(order, 'fx'); if (!okInfo(i)) bad++; g.fillStyle = '#0000ff'; g.fillRect(5, 5, 1, 1); }, { layer: 'fx' });
  v.onDraw((g, i) => { drawn.overhead++; seen(order, 'overhead'); if (!okInfo(i)) bad++; g.fillStyle = '#00ff00'; g.fillRect(4, 4, 2, 2); }, { layer: 'overhead' });
  v.onDraw((g, i) => { drawn.ground++; seen(order, 'ground'); if (!okInfo(i)) bad++; g.fillStyle = '#ff0000'; g.fillRect(0, 0, 6, 6); }, { layer: 'ground' });
  let propDraws = 0;
  const prop = v.addProp({ x: 2, y: 2, base: 8, w: 4, h: 4, kind: 'f-_selftest-prop', draw: g => { propDraws++; g.fillStyle = '#8000ff'; g.fillRect(2, 2, 4, 4); } });
  const decorated = new Set();
  v.decorate((g, vil, i) => { decorated.add(vil.gid); g.fillStyle = '#ffd700'; g.fillRect(i.x - 1, i.y - 36, 3, 2); if (typeof vil.gid !== 'string' || !Number.isFinite(i.x) || !Number.isFinite(i.y) || typeof i.time !== 'number') bad++; });
  const ov = { 'under-tags': 0, 'over-tags': 0, top: 0 }, ovColor = { 'under-tags': '#ff0000', 'over-tags': '#00ff00', top: '#0000ff' }, ovX = { 'under-tags': 2, 'over-tags': 8, top: 14 }, ovOrder = [];
  let ovInfo = null;
  for (const layer of ['top', 'over-tags', 'under-tags']) {                          // 이것도 거꾸로 등록
    v.onOverlay((o, i) => {
      ov[layer]++; seen(ovOrder, layer);
      if (typeof i.X !== 'function' || typeof i.Y !== 'function' || !Number.isFinite(i.k + i.fs + i.dpr + i.time + i.w + i.h)) bad++;
      ovInfo ??= { x0: Math.round(i.X(0)), y0: Math.round(i.Y(0)), k: +i.k.toFixed(3), fsOk: i.fs > 0, w: i.w, h: i.h };
      o.fillStyle = ovColor[layer]; o.fillRect(ovX[layer], 2, 4, 4);
    }, { layer });
  }
  ctx.every(250, () => {
    badge.dataset.frames = JSON.stringify({ upd: frames, drawn, order, propDraws, ov, ovOrder, bad, ovInfo, deco: [...decorated].sort() });
  });

  // ---- 탭 · 제스처 · 키 ----
  v.onTap(p => { bump('taps'); badge.dataset.tap = JSON.stringify(p); });
  v.onGesture(() => bump('gest'));

  // ---- 장면 (키 t): 6명을 모아 3 · 2 · 1 → 끝. 같은 seed 면 TV 와 폰이 같은 6명 ----
  let crowd = [], waved = false;
  const runWave = () => v.runScene({
    key: 'f-_selftest-wave', seed: 'st-seed', maxSec: 12,
    start: s => { waved = false; crowd = s.crowd(6); s.formation(crowd, v.SP().group, 'down'); badge.dataset.scene = JSON.stringify({ crowd: crowd.map(h => h.gid), started: true }); },
    update: (s, dt) => {
      if (!(dt >= 0)) bad++;
      s.count = s.t < 1 ? 3 : s.t < 2 ? 2 : s.t < 3 ? 1 : null;
      if (s.t >= 1.5 && !waved) { waved = true; crowd.forEach(h => h.icon('👋', 1.2)); }
      if (s.t >= 3) s.done();
    },
    end: s => { badge.dataset.sceneEnd = JSON.stringify({ t: +s.t.toFixed(1), crowd: crowd.map(h => h.gid) }); },
  });
  v.keys.add('t', () => { bump('keyT'); runWave(); }, { ko: '점검 장면', en: 'Self-test scene' });

  // ---- 폰 액션 · 시트 ----
  let mode = 'one';                                                                    // 'none' | 'one' | 'two' — 테스트가 'actions-mode' 로 바꿈
  const openSheet = () => v.sheet.open({
    key: 'f-_selftest-sheet', title: ctx.t('_selftest_v_sheet'),
    render: body => { body.append(el('p', { cls: 'tip', text: ctx.t('_selftest_v_sheet_body'), attrs: { 'data-st': 'sheet-body' } })); bump('sheetOpened'); return () => bump('sheetCleaned'); },
    onClose: () => bump('sheetClosed'),
  });
  v.actions.add({ key: 'f-_selftest-a', icon: '🧪', label: ctx.t('_selftest_v_act_a'), order: 10, when: () => mode !== 'none', onClick: () => { bump('actA'); openSheet(); } });
  v.actions.add({ key: 'f-_selftest-b', icon: '🧫', label: ctx.t('_selftest_v_act_b'), order: 20, when: () => mode === 'two', onClick: () => bump('actB') });

  // ---- 한 기능 전용 (?st=): 출석 · 티커 둘째 줄 · 티커 앞머리 · 커플 스프라이트 ----
  if (st.has('presence')) { v.setPresence(g => even(g.id)); badge.dataset.stPresence = '1'; }
  if (st.has('tickerExtra')) { v.setTickerExtra(g => `EN · ${g.name}`); badge.dataset.stTickerExtra = '1'; }
  if (st.has('tickerPrefix')) { v.setTickerPrefix(() => '1y ago ·'); badge.dataset.stTickerPrefix = '1'; }
  if (st.has('coupleSprites')) {
    const mk = color => { const c = document.createElement('canvas'); c.width = 24; c.height = 36; const x = c.getContext('2d'); x.fillStyle = color; x.fillRect(4, 2, 16, 32); return { idle: c }; };
    v.setCoupleSprites(mk('#00aa66'), mk('#aa3300')); badge.dataset.stCouple = '1';
  }

  // ---- 명령: 테스트 → 배지의 'st-cmd' 이벤트 ----
  const misuse = [];
  const attempt = (name, fn) => { try { fn(); misuse.push([name, 'no error']); } catch (e) { misuse.push([name, e.code || e.message]); } };
  const cmds = {
    info: () => ({
      HOST: v.HOST, TOUCH: v.TOUCH, ME: v.ME, W: v.W, H: v.H, TILE: v.TILE, zFrozen: Object.isFrozen(v.Z) && Object.isFrozen(v.Z.altar), zKeys: Object.keys(v.Z).length,
      sp: Object.keys(v.SP()).sort(), guests: v.guests().length, allIds: v.allIds().size, villagers: v.villagers().length, couple: v.couple().length,
      audio: typeof v.audio(), sound: v.soundOn(), phase: v.state().phase,
    }),
    state: () => v.state(),
    banner: a => { v.banner(a.text || ctx.t('_selftest_v_banner'), { ms: a.ms, kind: a.kind, priority: a.priority }); },
    toast: a => { v.toast(a.text || ctx.t('_selftest_v_banner')); },
    chime: a => { v.chime(!!a.big); },
    fx: a => { v.fx[a.kind](...(a.args || [])); },
    camfocus: a => { v.camFocus(a.x, a.y, a.sec); },
    couple: a => { const c = v.couple()[a.i ?? 1]; c[a.op](...(a.args || [])); return { x: c.x, y: c.y }; },
    vil: a => { const h = v.villager(a.gid); if (!h) return { missing: true }; const r = h[a.op](...(a.args || [])); return { r: r ?? null, x: h.x, y: h.y, state: h.state, facing: h.facing }; },
    prop: a => { if (a.op === 'set') prop.set(a.patch); else prop.remove(); },
    spot: a => {
      v.spotlight.show({
        key: a.key || 'f-_selftest-spot', ms: a.ms || 2500, priority: a.priority,
        render: box => { box.append(el('div', { cls: 'f-_selftest-spotbox', text: `${ctx.t('_selftest_v_spot')} ${a.tag || ''}`, attrs: { 'data-st': 'spot-box', 'data-tag': a.tag || '' } })); badge.dataset.spotLast = a.tag || ''; bump('spotShown'); return () => bump('spotCleaned'); },
      }).then(ctx.guard(() => { bump('spotDone'); badge.dataset.spotDoneLast = a.tag || ''; }));
    },
    'sheet-open': () => { openSheet(); },
    'sheet-close': () => { v.sheet.close(); },
    'actions-mode': a => { mode = a.mode; v.actions.refresh(); },
    scene: () => { runWave(); },
    presence: a => {
      if (a.op === 'clear') v.clearPresence();
      else if (a.op === 'throw') v.setPresence(() => { throw new Error('presence boom'); });       // 규칙이 오류를 내면 하객을 숨기지 않고 모두 보여야 함 (열려 있는 채로 실패)
      else v.setPresence(g => even(g.id));
    },
    refresh: () => { v.refresh(); },
    arrive: a => { v.arrive(a.gid, a.via ? { via: a.via } : undefined); },
    misuse: () => {
      misuse.length = 0;
      attempt('reserved-key', () => v.keys.add('f', () => {}, { ko: 'x', en: 'x' }));
      attempt('reserved-escape', () => v.keys.add('Escape', () => {}, { ko: 'x', en: 'x' }));
      attempt('bad-key', () => v.keys.add('ab', () => {}, { ko: 'x', en: 'x' }));
      attempt('duplicate-key', () => v.keys.add('t', () => {}, { ko: 'x', en: 'x' }));
      attempt('bad-zone', () => v.hud.add(el('div'), { zone: 'zz' }));
      attempt('bad-layer', () => v.onDraw(() => {}, { layer: 'sky' }));
      attempt('bad-overlay', () => v.onOverlay(() => {}, { layer: 'sky' }));
      attempt('bad-action-name', () => v.actions.add({ key: 'f-other-x', icon: '?', label: 'x', order: 1, onClick() {} }));
      attempt('duplicate-action', () => v.actions.add({ key: 'f-_selftest-a', icon: '?', label: 'x', order: 1, onClick() {} }));
      attempt('bad-sheet-name', () => v.sheet.open({ key: 'oops', title: 'x', render() {} }));
      attempt('bad-scene-seed', () => v.runScene({ key: 'f-_selftest-x', seed: {}, start() {}, update() {} }));
      attempt('walk-outside-scene', () => v.villagers()[0]?.walkTo([3, 3], 'down'));
      attempt('bad-prop', () => v.addProp({ x: 1 }));
      attempt('bad-banner-kind', () => v.banner('x', { kind: 'huge' }));
      attempt('bad-emote', () => v.villagers()[0]?.emote('explode'));
      attempt('bad-couple-dir', () => v.couple()[0].face('sideways'));
      return misuse.slice();
    },
  };
  ctx.listen(badge, 'st-cmd', e => {
    const { cmd, ...a } = e.detail || {};
    let val; try { val = cmds[cmd]?.(a); } catch (er) { val = { error: er.code || er.message }; }
    out(cmd, val);
  });
}

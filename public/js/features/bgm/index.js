// ============================================================
//  WP-07 · 🎵 8비트 BGM + 효과음 (bgm) — docs/v4/wp/WP-07-bgm.md
//  TV(HOST)에서만 소리: 페이즈·밤·식순 큐(live:cue)에 따라 곡을 고르고, 조용 모드면 멈춤. 음원 파일 없이 WebAudio 합성(synth.js).
//  폰 마을: setup 즉시 return (노드 0). 관리자: ⚙️ 설정(음악·효과음·볼륨·곡 고정·미리 듣기).
//  데이터: cfg.bgm 만 { music, sfx, volume, pin, testSpeed(데모 전용) }.
// ============================================================
import D from './i18n.js';
import { SONGS, songById } from './songs.js';
import { makeSynth } from './synth.js';

export const i18n = D;
export const css = true;

const TITLE_KEY = { morning: 'bgm_t_morning', bridal: 'bgm_t_bridal', march: 'bgm_t_march', danube: 'bgm_t_danube', canon: 'bgm_t_canon', festival: 'bgm_t_festival', lanterns: 'bgm_t_lanterns' };
// §4: program cues that change the song. once = play it one time, then back to the default
const CUE_SONG = { bride: { track: 'bridal', once: true }, march: { track: 'march', once: true }, firstdance: { track: 'danube' }, dinner: { track: 'canon' } };
const ONCE_LATE_MS = 20000;               // a one-shot cue that could not start within 20 s (quiet mode, no click yet) is dropped — never played late
const volOf = c => { const n = Number(c?.volume); return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.35; };

export async function setup(ctx) {
  if (ctx.page === 'admin') return setupAdmin(ctx);
  if (ctx.page === 'village') return setupTv(ctx);
}

// ---------------------------------------------------------------- TV
function setupTv(ctx) {
  const v = ctx.v;
  if (!v?.HOST) return;                                   // phones: nothing — no node, no listener (A8)
  let synth = null, local = null, unlockShown = false, cue = null, quiet = v.state().quiet === true;
  let night = v.state().night === true, phase = ctx.phase(), sent = '';
  const cfg = () => ctx.cfg();
  const musicOn = () => (local ?? cfg().music === true);
  const speed = () => (ctx.demo && Number(cfg().testSpeed) > 0 ? Math.min(64, Number(cfg().testSpeed)) : 1);

  function want() {                                       // the song this TV should play now (null = silence)
    if (!musicOn() || quiet) return null;
    if (cue?.once && !cue.started && Date.now() - cue.at > ONCE_LATE_MS) cue = null;
    const pin = songById(cfg().pin);
    if (pin) return pin.id;
    if (cue) return cue.track;
    if (phase === 'live') return night ? 'lanterns' : 'festival';
    return 'morning';                                     // pre · after · anniversary
  }
  function ensure(ask) {                                  // the synth needs the core's AudioContext, which exists after the first click/key
    if (synth) return true;
    const ac = v.audio();
    if (!ac) { if (ask && !unlockShown) { unlockShown = true; v.banner(ctx.t('bgm_unlock'), { kind: 'small' }); } return false; }
    if (ac.state === 'suspended') ac.resume?.().catch?.(() => {});
    synth = makeSynth(ac, { volume: volOf(cfg()), every: ctx.every, later: ctx.after });
    return true;
  }
  function emitState() {
    const s = { track: synth?.playing() ? synth.track() : want(), playing: !!synth?.playing(), volume: volOf(cfg()) };
    const key = `${s.track}|${s.playing}|${s.volume}`;
    if (key !== sent) { sent = key; ctx.bus.emit('bgm:state', s); }
  }
  function update() {
    const id = want();
    if (!id) {
      if (synth?.playing()) { if (cue?.once && cue.started) cue = null; synth.stop(); }   // an interrupted one-shot is not resumed
      return emitState();
    }
    if (!ensure(true)) return emitState();
    if (synth.playing() && synth.track() === id) return emitState();
    const song = songById(id), pinned = songById(cfg().pin)?.id === id, once = !pinned && cue?.track === id && cue.once;
    if (once) cue.started = true;
    synth.play(song, {
      speed: speed(), loop: pinned ? true : once ? false : song.loop === true,
      onEnd: ctx.guard(() => { if (cue?.track === id) cue = null; update(); }),
    });
    emitState();
  }

  // effects (cfg.sfx): never in quiet mode, never before the first click
  const last = {};
  function fx(name, gapMs = 0) {
    if (cfg().sfx !== true || quiet || !ensure(false)) return;
    const now = performance.now();
    if (gapMs && last[name] && now - last[name] < gapMs) return;
    last[name] = now;
    synth.sfx(name);
  }

  ctx.bus.on('live:cue', p => {
    const m = CUE_SONG[p?.cue];
    cue = m && (!m.once || p.fresh === true) ? { track: m.track, once: !!m.once, at: Date.now(), started: false } : null;   // a one-shot is only for a cue pressed just now
    update();
  }, { replay: true });
  ctx.onLive(l => { const q = l?.quiet === true; if (q !== quiet) { quiet = q; update(); } });
  ctx.onSettings(() => { synth?.setVolume(volOf(cfg())); update(); });
  ctx.every(2000, () => {                                 // phase and night change slowly — a light poll is enough
    const n = v.state().night === true, p = ctx.phase();
    if (n !== night || p !== phase) { night = n; phase = p; update(); }
  });
  v.onGesture(() => { if (!synth && (musicOn() || cfg().sfx === true)) ctx.after(0, update); });
  v.keys.add('u', () => { local = !musicOn(); ctx.after(0, update); }, { ko: D.ko.bgm_key, en: D.en.bgm_key });

  ctx.bus.on('village:arrived', () => fx('jingle', 2000));
  ctx.bus.on('village:emote', () => fx('blip', 500));
  ctx.bus.on('bingo:line', () => fx('fanfare'));
  ctx.bus.on('poll:result', () => fx('drumchord'));
  ctx.bus.on('meter:milestone', () => fx('chord'));
  ctx.bus.on('village:event', e => { if (e?.stage === 'start' && (e.key === 'bouquet' || e.key === 'group')) fx('roll'); });
  // village:level — the core's own chime already plays on a level-up, so no fanfare on top (§5)

  ctx.onCleanup(() => { synth?.dispose(); synth = null; });
  update();
}

// ---------------------------------------------------------------- admin: ⚙️ settings
function setupAdmin(ctx) {
  const A = ctx.admin;
  if (!A?.settings) return;
  let ac = null, syn = null, cancel = null, previewBtn = null;
  const stopPreview = () => { cancel?.(); cancel = null; syn?.stop(0.2); if (previewBtn) { previewBtn.textContent = ctx.t('bgm_preview'); previewBtn.dataset.on = '0'; } };
  ctx.onCleanup(() => { cancel?.(); try { syn?.dispose(); } catch {} try { ac?.close(); } catch {} ac = syn = null; });

  A.settings.add({ render(box) {
    const c = ctx.cfg();
    const check = (cls, on, key) => { const cb = ctx.el('input', { cls, attrs: { type: 'checkbox' } }); cb.checked = on; return [cb, ctx.el('label', { cls: 'f-bgm-check', kids: [cb, ctx.el('span', { text: ctx.t(key) })] })]; };
    const [music, musicRow] = check('f-bgm-music', c.music === true, 'bgm_music');
    const [sfx, sfxRow] = check('f-bgm-sfx', c.sfx === true, 'bgm_sfx');
    const vol = ctx.el('input', { cls: 'f-bgm-vol', attrs: { type: 'range', min: '0', max: '1', step: '0.05', 'aria-label': ctx.t('bgm_volume') } });
    vol.value = String(volOf(c));
    const volOut = ctx.el('span', { cls: 'f-bgm-volout' });
    const pin = ctx.el('select', { cls: 'input f-bgm-pin', attrs: { 'aria-label': ctx.t('bgm_pin') } });
    pin.append(ctx.el('option', { text: ctx.t('bgm_auto'), attrs: { value: '' } }), ...SONGS.map(s => ctx.el('option', { text: ctx.t(TITLE_KEY[s.id]), attrs: { value: s.id } })));
    pin.value = songById(c.pin) ? c.pin : '';
    previewBtn = ctx.el('button', { cls: 'px-btn small f-bgm-preview', text: ctx.t('bgm_preview'), attrs: { type: 'button', 'data-on': '0' } });
    const out = ctx.el('span', { cls: 'tip f-bgm-msg', attrs: { role: 'status' } });
    const paintVol = () => { volOut.textContent = Math.round(Number(vol.value) * 100) + '%'; };
    const save = () => {
      out.textContent = '';
      A.saveCfg({ music: music.checked, sfx: sfx.checked, volume: Math.round(Number(vol.value) * 100) / 100, pin: pin.value || null })
        .then(ctx.guard(() => { out.textContent = ctx.t('bgm_saved'); }), ctx.guard(e => { out.textContent = ctx.t('bgm_fail', { e: e?.code || '?' }); }));
    };
    ctx.listen(music, 'change', save); ctx.listen(sfx, 'change', save); ctx.listen(pin, 'change', save);
    ctx.listen(vol, 'input', () => { paintVol(); syn?.setVolume(Number(vol.value)); });
    ctx.listen(vol, 'change', save);
    // ▶ preview: the chosen song (auto → the live-day song) for 10 s, on this computer — the click unlocks the audio
    ctx.listen(previewBtn, 'click', () => {
      if (previewBtn.dataset.on === '1') return stopPreview();
      try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }
      ac.resume?.().catch?.(() => {});
      syn = syn || makeSynth(ac, { volume: Number(vol.value), every: ctx.every, later: ctx.after });
      syn.setVolume(Number(vol.value));
      syn.play(songById(pin.value) || songById('festival'), { loop: true });
      previewBtn.textContent = ctx.t('bgm_stop'); previewBtn.dataset.on = '1';
      cancel = ctx.after(10000, stopPreview);
    });
    paintVol();
    box.append(
      ctx.el('div', { cls: 'f-bgm-row', kids: [musicRow, sfxRow] }),
      ctx.el('label', { cls: 'f-bgm-row f-bgm-volrow', kids: [ctx.el('span', { text: ctx.t('bgm_volume') }), vol, volOut] }),
      ctx.el('label', { cls: 'f-bgm-row', kids: [ctx.el('span', { text: ctx.t('bgm_pin') }), pin] }),
      ctx.el('div', { cls: 'f-bgm-row', kids: [previewBtn, out] }),
      ctx.el('p', { cls: 'tip f-bgm-note', text: ctx.t('bgm_note') }),
    );
    return () => stopPreview();
  } });
}

// ============================================================
//  WP-07 8비트 합성 엔진 — 채널 4개(p1·p2 펄스, tri 삼각, noise) · 25ms 타이머 + 앞 예약 · 이음매 없는 루프 · 효과음
//  곡 하나 = 채널마다 오래 사는 오실레이터 1개 + 게인 1개 (음표마다 노드를 만들지 않음 → TV 프레임에 부담 없음)
//  stats.nodes = 이 기능이 만든 AudioNode 수 (A2 "꺼짐이면 0" 시험용)
// ============================================================
import { parse, beats, hz } from './mml.js';

export const stats = { nodes: 0, sfx: {} };                 // sfx: how many times each effect played (A6)

const MUSIC_CAP = 0.08, SFX_CAP = 0.06, FADE = 0.4;
const LEVEL = { p1: 0.55, p2: 0.32, tri: 0.9, noise: 0.35 };
const DUTY = { p1: 0.25, p2: 0.125 };
const CH = ['p1', 'p2', 'tri', 'noise'];
const SFX = new Set(['jingle', 'blip', 'fanfare', 'drumchord', 'chord', 'roll']);

/** the channels of one song, parsed once: { ch: { events, beats } }, total = the longest channel (all should be equal — A7) */
export function compile(song) {
  const chans = {};
  let total = 0;
  for (const c of CH) { const ev = parse(song?.[c] || ''); const b = beats(ev); chans[c] = { events: ev, beats: b }; total = Math.max(total, b); }
  return { chans, total };
}

const pulseCache = new WeakMap();
function pulse(ac, duty) {                    // a PeriodicWave for a pulse wave of this duty (cached per context)
  let m = pulseCache.get(ac); if (!m) { m = new Map(); pulseCache.set(ac, m); }
  if (m.has(duty)) return m.get(duty);
  const N = 32, re = new Float32Array(N), im = new Float32Array(N);
  for (let n = 1; n < N; n++) { re[n] = Math.sin(2 * Math.PI * n * duty) / (Math.PI * n); im[n] = (1 - Math.cos(2 * Math.PI * n * duty)) / (Math.PI * n); }
  const w = ac.createPeriodicWave(re, im); m.set(duty, w); return w;
}
const noiseCache = new WeakMap();
function noiseBuf(ac) {
  let b = noiseCache.get(ac); if (b) return b;
  b = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.5), ac.sampleRate);
  const d = b.getChannelData(0); let x = 1;
  for (let i = 0; i < d.length; i++) { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; d[i] = ((x >>> 0) / 4294967296) * 2 - 1; }   // xorshift: the same hiss every time
  noiseCache.set(ac, b); return b;
}

/**
 * makeSynth(ac, { volume, every, later }) → { play(song, { speed, loop, onEnd }), stop(), sfx(name), setVolume(v), playing(), track(), dispose() }
 * every(ms, fn) → cancel · later(ms, fn): the caller's timers (ctx.every / ctx.after — cleaned up with the feature).
 * Every node goes through mk() (counted). Nothing is created until play() or sfx() is called.
 */
export function makeSynth(ac, opts = {}) {
  let vol = clampVol(opts.volume);
  const every = opts.every, later = opts.later || ((ms, fn) => fn());
  let master = null, music = null, fx = null;
  let cur = null;                              // { id, voices, comp, start, spb, loop, idx, cycle, onEnd, endAt, ended }
  let timer = null, lastTick = 0;
  const mk = n => { stats.nodes++; return n; };

  function bus() {
    if (master) return;
    master = mk(ac.createGain()); master.gain.value = vol; master.connect(ac.destination);
    music = mk(ac.createGain()); music.gain.value = MUSIC_CAP; music.connect(master);
    fx = mk(ac.createGain()); fx.gain.value = SFX_CAP; fx.connect(master);
  }
  function voices() {
    const v = {};
    for (const c of CH) {
      const g = mk(ac.createGain()); g.gain.value = 0; g.connect(music);
      let src;
      if (c === 'noise') { src = mk(ac.createBufferSource()); src.buffer = noiseBuf(ac); src.loop = true; const hp = mk(ac.createBiquadFilter()); hp.type = 'highpass'; hp.frequency.value = 1800; src.connect(hp).connect(g); }
      else { src = mk(ac.createOscillator()); if (c === 'tri') src.type = 'triangle'; else src.setPeriodicWave(pulse(ac, DUTY[c])); src.connect(g); }
      src.start();
      v[c] = { src, g };
    }
    return v;
  }
  function kill(vs, at) {
    for (const c of CH) { const x = vs[c]; if (!x) continue; try { x.src.stop(at); } catch {} const dis = () => { try { x.g.disconnect(); } catch {} }; x.src.onended = dis; }
  }

  function note(c, x, e, t, d) {
    const g = x.g.gain, L = LEVEL[c];
    if (e.hit) {                                                     // a short tick of noise
      g.setValueAtTime(L, t); g.exponentialRampToValueAtTime(0.001, t + Math.min(0.09, d * 0.8)); g.setValueAtTime(0, t + Math.min(0.1, d * 0.9));
      return;
    }
    if (e.midi == null) { g.setValueAtTime(0, t); return; }
    x.src.frequency.setValueAtTime(hz(e.midi), t);
    const a = Math.min(0.006, d * 0.1), off = t + d * (c === 'tri' ? 0.97 : 0.9);
    g.setValueAtTime(0, t); g.linearRampToValueAtTime(L, t + a);
    if (c !== 'tri') g.linearRampToValueAtTime(L * 0.65, t + d * 0.6);
    g.setValueAtTime(c === 'tri' ? L : L * 0.65, off - 0.004); g.linearRampToValueAtTime(0, off);
  }

  function tick() {
    if (!cur) return;
    const now = ac.currentTime;
    const gap = lastTick ? now - lastTick : 0; lastTick = now;
    const horizon = now + Math.min(2, Math.max(0.1, gap * 1.6));      // a throttled background tab (1 s timers) still gets its notes in time
    const { comp, spb } = cur;
    let live = 0;
    for (const c of CH) {
      const ch = comp.chans[c], x = cur.voices[c];
      if (!ch.events.length) continue;
      let k = cur.idx[c];
      for (;;) {
        if (k >= ch.events.length) {
          if (!cur.loop) break;
          k = 0; cur.cycle[c]++;
        }
        const e = ch.events[k], t = cur.start + (cur.cycle[c] * comp.total + e.t) * spb;
        if (t >= horizon) break;
        if (t >= now - 0.05) note(c, x, e, Math.max(t, now), e.dur * spb);
        k++;
      }
      cur.idx[c] = k;
      if (cur.loop || k < ch.events.length) live++;
    }
    if (!cur.loop && !live && now >= cur.endAt) {                    // a one-shot song played to its end
      const done = cur.onEnd; stopNow(0.05); if (done) done();
    }
  }

  function stopNow(fade = FADE) {
    if (!cur) return;
    const now = ac.currentTime, vs = cur.voices;
    for (const c of CH) {
      const g = vs[c].g.gain;
      if (g.cancelAndHoldAtTime) g.cancelAndHoldAtTime(now); else { g.cancelScheduledValues(now); g.setValueAtTime(g.value, now); }
      g.linearRampToValueAtTime(0, now + fade);
    }
    kill(vs, now + fade + 0.05);
    cur = null;
    if (timer) { timer(); timer = null; }
  }

  return {
    /** start a song from its beginning (replaces whatever is playing) */
    play(song, o = {}) {
      if (!song) return;
      if (cur) stopNow(0.15);
      bus();
      const comp = compile(song);
      if (!comp.total) return;
      const speed = Number(o.speed) > 0 ? Number(o.speed) : 1;
      const spb = 60 / (Math.max(20, Number(song.bpm) || 100) * speed);
      const loop = o.loop ?? song.loop === true;
      const start = ac.currentTime + 0.08;
      cur = { id: song.id, comp, spb, loop, start, voices: voices(), idx: { p1: 0, p2: 0, tri: 0, noise: 0 }, cycle: { p1: 0, p2: 0, tri: 0, noise: 0 }, onEnd: o.onEnd || null, endAt: start + comp.total * spb };
      lastTick = 0;
      tick();
      if (!timer) timer = every(25, tick);
    },
    stop(fade) { stopNow(fade ?? FADE); },
    playing: () => !!cur,
    track: () => cur?.id || null,
    setVolume(v) { vol = clampVol(v); if (master) master.gain.setTargetAtTime(vol, ac.currentTime, 0.05); },
    /** one-shot effects — each makes a few short-lived nodes */
    sfx(name) {
      if (!SFX.has(name)) return;
      bus();
      stats.sfx[name] = (stats.sfx[name] || 0) + 1;
      const t0 = ac.currentTime + 0.02;
      const tone = (f, t, d, type = 'square', L = 0.7) => {
        const o = mk(ac.createOscillator()), g = mk(ac.createGain());
        if (type === 'pulse') o.setPeriodicWave(pulse(ac, 0.25)); else o.type = type;
        o.frequency.value = f; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(L, t + 0.005); g.gain.exponentialRampToValueAtTime(0.001, t + d);
        o.connect(g).connect(fx); o.start(t); o.stop(t + d + 0.02); o.onended = () => { try { g.disconnect(); } catch {} };
      };
      const hit = (t, d, L = 0.8, f = 900) => {
        const s = mk(ac.createBufferSource()), b = mk(ac.createBiquadFilter()), g = mk(ac.createGain());
        s.buffer = noiseBuf(ac); b.type = 'lowpass'; b.frequency.value = f;
        g.gain.setValueAtTime(L, t); g.gain.exponentialRampToValueAtTime(0.001, t + d);
        s.connect(b).connect(g).connect(fx); s.start(t); s.stop(t + d + 0.02); s.onended = () => { try { g.disconnect(); } catch {} };
      };
      const N = m => hz(m);
      switch (name) {
        case 'jingle': [72, 76, 79].forEach((m, i) => tone(N(m), t0 + i * 0.09, 0.14, 'pulse')); break;                 // C E G
        case 'blip': tone(N(84), t0, 0.06, 'pulse', 0.5); break;
        case 'fanfare': [67, 72, 76, 79, 76, 79].forEach((m, i) => tone(N(m), t0 + i * 0.1, i === 5 ? 0.45 : 0.12, 'pulse')); break;
        case 'drumchord': hit(t0, 0.25, 1, 300); hit(t0 + 0.18, 0.25, 1, 300); [60, 64, 67, 72].forEach(m => tone(N(m), t0 + 0.36, 0.7, 'pulse', 0.35)); break;
        case 'chord': [64, 67, 72, 76].forEach((m, i) => tone(N(m), t0 + i * 0.03, 0.8, 'pulse', 0.3)); break;
        case 'roll': for (let i = 0; i < 16; i++) hit(t0 + i * 0.0625, 0.07, 0.25 + i * 0.04, 2500); hit(t0 + 1.0, 0.35, 1, 600); break;
        default: break;
      }
    },
    dispose() { stopNow(0.05); if (master) { const m = master; later(200, () => { try { m.disconnect(); } catch {} }); } master = music = fx = null; },
  };
}
function clampVol(v) { const n = Number(v); return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.35; }

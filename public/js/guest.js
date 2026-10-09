// ============================================================
//  Guest flow — index.html (phones via QR) and kiosk.html (tablet)
//  welcome → info → photo (on-device analysis) → customize → activity → done (+ phone remote)
// ============================================================
import { CONFIG, DEMO } from './config.js';
import { getStore, ACTIVITIES, EMOTES } from './store.js';
import { t, setLang, getLang, applyI18n } from './i18n.js';
import {
  SKIN, HAIR, COLORS, HAIR_STYLES, HAIR_PRESETS, BANGS, FACES, EYES, BROWS, MOUTHS, BEARDS, GLASSES, OUTFITS, ACCESSORIES,
  getSprite, drawPreview, extractColors, randomAvatar, defaultAvatar, normalizeAvatar, suggestLooks, SPRITE_W, SPRITE_H,
} from './avatar.js';
import { preloadFace, analyzePhoto, genderize } from './face.js';
import { mountSnapUploader, uploadSnapData, mySnaps, setSnapSink, handoffUrl } from './snaps.js';
import { qrcode } from './vendor/qrcode.mjs';
import { emit } from './core/bus.js';                       // v4: page events for features (02 §5) — no-ops when nobody listens
import { bootFeatures } from './core/features.js';          // v4: feature loader (WP-00b); everything feature-related is in "v4 extension points" at the bottom
setSnapSink(emit);                                          // snaps.js reports 'snap:uploaded' through the bus

const KIOSK = document.body.classList.contains('kiosk');
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

const state = { name: '', side: 'both', message: '', priv: false, avatar: defaultAvatar(), gender: null, photoHp: null, photo: null, keepPhoto: true, activity: 'walk', tab: 'pick', simple: false, voice: null, capsule: '', base: null, picks: null };

// ---------- screens ----------
let current = 'welcome';
let shown = 'welcome', prevScreen = 'welcome';     // v4: the screen really on display (resetAll() rewrites `current` before go()) and the one before it
const featureScreens = new Map();                  // v4: name → { section, onEnter, onLeave } (ctx.guest.screens.add)
function go(name) {
  const prev = current; current = name;
  const left = shown; shown = name; if (left !== name) prevScreen = left;
  $$('.screen').forEach(s => s.classList.toggle('active', s.id === 's-' + name));
  paintStep();
  if (prev === 'info' && name !== 'info') { stopRec(); audioEl?.pause(); }      // never keep the mic / playback running off-screen
  if (name === 'photo') startCamera(); else stopCamera();
  if (name === 'info') preloadFace().catch(() => {});        // warm up the model while they type
  if (name === 'custom') renderCustom();
  if (name === 'act') renderActs();
  if (name === 'done') doneT = 3;
  if (name === 'welcome') coupleStage();
  scrollTo(0, 0);
  featureScreens.get(left)?.onLeave?.(); featureScreens.get(name)?.onEnter?.();   // v4 (hooks are guard()ed by the feature)
  if (name === 'done') paintHubs('done'); else if (name === 'remote') paintHubs('solo');
  emit('guest:screen', { name, prev: left });
}
function paintStep() {
  const S = state.simple ? { info: t('step_info_s'), photo: t('step_photo_s') } : { info: t('step_info'), photo: t('step_photo'), custom: t('step_custom'), act: t('step_act') };
  const lbl = S[current] || '';
  $('#step-label').textContent = lbl; $('#step-label').style.display = lbl ? '' : 'none';
  const al = $('#admin-link'); if (al) al.hidden = KIOSK || current !== 'welcome';
  $('#btn-skip').textContent = t(state.simple ? 'skip_photo_simple' : 'skip_photo');
  $('#cam-fallback').textContent = t(state.simple ? 'camera_denied_simple' : 'camera_denied');
  $('#btn-random').setAttribute('aria-label', t('random_label'));
  photoBackLabel();
}
let toastT = 0;
function toast(msg, ms = 4000) { const el = $('#toast'); el.textContent = msg; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { el.hidden = true; }, ms); }

// ---------- language ----------
// v4: paintTexts() = the "paint the screen" half of renderLang() (feature ctx.texts calls only this — no 'lang' event, so no loops)
function paintTexts() {
  applyI18n(); renderHero(); setSimple(state.simple); paintStep(); syncInfo();
  if (current === 'custom') renderCustom();
  if (current === 'act') renderActs();
  if (current === 'done' && remoteGid) renderRemote($('#remote-done'), remoteGid);
  if (current === 'remote' && remoteGid) renderRemote($('#remote-solo'), remoteGid);
  if (state.voice) $('#v-time').textContent = `${t('voice_saved')} ${state.voice.dur.toFixed(1)}s`;
  relabelHubs();
}
function renderLang() {
  $$('.lang button').forEach(b => b.setAttribute('aria-pressed', b.dataset.lang === getLang()));
  paintTexts();
  emit('lang', { lang: getLang() });
}
$$('.lang button').forEach(b => b.addEventListener('click', () => { setLang(b.dataset.lang); renderLang(); }));

const mine = () => { try { return JSON.parse(localStorage.getItem('wgb_mine') || '[]'); } catch { return []; } };
function renderHero() {
  const l = getLang();
  $('#hero-names').innerHTML = '';
  const n = document.createElement('span'); n.textContent = CONFIG.couple.groom[l];
  const h = document.createElement('span'); h.className = 'heart'; h.textContent = ' ♥ ';
  const m = document.createElement('span'); m.textContent = CONFIG.couple.bride[l];
  $('#hero-names').append(n, h, m);
  $('#hero-date').textContent = [CONFIG.couple.date, CONFIG.couple.venue].filter(Boolean).join(' · ');
  const has = !KIOSK && mine().length > 0;
  $('#already').textContent = t(needGuestNotice && !has ? 'snap_need_guest' : 'already');
  $('#already').hidden = !(has || needGuestNotice); $('#mine-row').hidden = !has;
  if (has) { const m = mine(); $('#btn-village').href = villageUrl(m[m.length - 1].id); }   // returning guest → straight back to their character
}

// couple mini-stage on welcome (animates only while that screen is showing — the kiosk runs all day)
let needGuestNotice = false, coupleRunning = false, coupleT = 0;
let coupleG = null, coupleB = null;     // v4: replacement sprites from the couple feature (null = config default) — see setCoupleSprites
function coupleStage() {
  const c = $('#couple-canvas'); if (!c || coupleRunning) return;
  const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
  const gs0 = getSprite(CONFIG.groomAvatar), bs0 = getSprite(CONFIG.brideAvatar);
  coupleRunning = true;
  const tick = () => {
    if (current !== 'welcome') { coupleRunning = false; return; }
    const gs = coupleG || gs0, bs = coupleB || bs0;
    const tt = (coupleT += 1 / 60);
    g.clearRect(0, 0, c.width, c.height);
    const blinkG = (tt % 4) > 3.85, blinkB = ((tt + 1.7) % 4.6) > 4.45, hop = Math.abs(Math.sin(tt * 2.2)) * 3;
    g.fillStyle = 'rgba(43,32,51,.18)'; g.fillRect(28, 70, 22, 3); g.fillRect(60, 70, 22, 3);
    g.drawImage(gs[blinkG ? 'blink' : (tt % 7 > 6 ? 'wave' : 'idle')], 28, 40 - Math.round(tt % 6 < 0.6 ? hop : 0));
    g.save(); g.translate(82, 0); g.scale(-1, 1); g.drawImage(bs[blinkB ? 'blink' : 'idle'], 0, 40 - Math.round((tt + 0.3) % 6 < 0.6 ? hop : 0)); g.restore();
    const hy = 32 - (tt * 8 % 26);
    g.globalAlpha = Math.max(0, Math.min(1, (hy - 6) / 10)); g.fillStyle = '#ff6f9c';
    ['.x.x.', 'xxxxx', 'xxxxx', '.xxx.', '..x..'].forEach((row, y) => [...row].forEach((ch, x) => ch === 'x' && g.fillRect(53 + x, Math.round(hy) + y, 1, 1)));
    g.globalAlpha = 1;
    requestAnimationFrame(tick);
  };
  tick();
}

// ---------- info ----------
const nameEl = $('#in-name'), msgEl = $('#in-msg');
function validInfo() { return state.name.trim().length > 0 && (state.message.trim().length >= 1 || !!state.voice); }
function syncInfo() {
  state.name = nameEl.value.slice(0, 20); state.message = msgEl.value.slice(0, 200);
  state.capsule = ($('#in-capsule')?.value || '').slice(0, 1000);
  $('#msg-count').textContent = `${state.message.length} / 200`;
  const ok = validInfo(); $('#info-next').disabled = !ok;
  // say why "Next" is disabled once they've started typing
  const touched = nameEl.value || msgEl.value || state.voice;
  $('#info-hint').textContent = ok || !touched ? '' : t(!state.name.trim() ? 'need_msg_name' : 'need_msg');
}
nameEl.addEventListener('input', syncInfo);
nameEl.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); msgEl.focus(); } }); msgEl.addEventListener('input', syncInfo); $('#in-capsule')?.addEventListener('input', syncInfo);

// ---------- voice message (MediaRecorder, max CONFIG.voiceMaxSec) ----------
let rec = null, recBusy = false, audioEl = null;
const pickMime = () => ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus'].find(m => window.MediaRecorder?.isTypeSupported?.(m)) || '';
function voiceUI(mode) {
  $('#v-rec').hidden = mode === 'rec'; $('#v-stop').hidden = mode !== 'rec';
  $('#v-play').hidden = mode !== 'done'; $('#v-del').hidden = mode !== 'done'; $('#v-meter').hidden = mode !== 'rec';
  $('#voice').classList.toggle('has', mode === 'done');
  if (mode !== 'rec') $('#v-time').textContent = state.voice ? `${t('voice_saved')} ${state.voice.dur.toFixed(1)}s` : '';
}
async function startRec() {
  if (recBusy) return;                          // double-tap / tap while the permission prompt is open
  recBusy = true; $('#v-rec').disabled = true; $('#v-err').textContent = '';
  const fail = msg => { recBusy = false; $('#v-rec').disabled = false; $('#v-err').textContent = msg; };
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return fail(t('voice_denied'));
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
  catch { return fail(t('voice_denied')); }
  if (current !== 'info') { stream.getTracks().forEach(tr => tr.stop()); recBusy = false; $('#v-rec').disabled = false; return; }
  const mime = pickMime(), chunks = [];
  let r;
  try { r = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 32000 } : { audioBitsPerSecond: 32000 }); }
  catch { r = new MediaRecorder(stream); }
  const t0 = performance.now();
  const timer = setInterval(() => {
    const el = (performance.now() - t0) / 1000, max = CONFIG.voiceMaxSec;
    $('#v-time').textContent = `${el.toFixed(1)} / ${max}s`; $('#v-meter i').style.width = Math.min(100, el / max * 100) + '%';
    if (el >= max) stopRec();
  }, 100);
  r.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  r.onstop = async () => {
    stream.getTracks().forEach(tr => tr.stop()); clearInterval(timer);
    if (rec === r) rec = null;
    recBusy = false; $('#v-rec').disabled = false;
    if (r.discard) { voiceUI(state.voice ? 'done' : 'idle'); return; }
    const blob = new Blob(chunks, { type: r.mimeType || mime || 'audio/webm' });
    const dur = Math.round((performance.now() - t0) / 100) / 10;
    if (blob.size < 800 || dur < 0.8) { voiceUI(state.voice ? 'done' : 'idle'); return; }   // too short: keep the previous clip (if any)
    const data = await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => res(''); fr.readAsDataURL(blob); });
    if (!data || data.length > 880000) { $('#v-err').textContent = t('voice_too_long'); voiceUI(state.voice ? 'done' : 'idle'); return; }
    state.voice = { data, mime: (blob.type || 'audio/webm').slice(0, 50), dur };
    voiceUI('done'); syncInfo();
  };
  rec = r; r.start(250); voiceUI('rec');
}
function stopRec(discard = false) { if (rec && rec.state !== 'inactive') { rec.discard = discard; rec.stop(); } }
$('#v-rec').addEventListener('click', startRec);
$('#v-stop').addEventListener('click', () => stopRec());
$('#v-play').addEventListener('click', () => { if (!state.voice) return; audioEl?.pause(); audioEl = new Audio(state.voice.data); audioEl.play().catch(() => {}); });
$('#v-del').addEventListener('click', () => { audioEl?.pause(); state.voice = null; voiceUI('idle'); syncInfo(); });
$$('#side-seg button').forEach(b => b.addEventListener('click', () => { state.side = b.dataset.v; $$('#side-seg button').forEach(x => x.setAttribute('aria-pressed', x === b)); }));

// ---------- camera ----------
let stream = null, camSeq = 0;
const video = $('#video'), still = $('#still'), scan = $('#scan');
async function startCamera() {
  stopCamera();
  if (state.photo || state.analyzed) { showStill(true); if (scanAnim && !scanAnim.running) runScan(scanAnim); return; }
  showStill(false); $('#cam-fallback').hidden = true; $('#btn-capture').disabled = true;
  if (!navigator.mediaDevices?.getUserMedia) { camFail(); return; }
  const seq = ++camSeq;
  try {
    const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 1280 } }, audio: false });
    if (seq !== camSeq || current !== 'photo' || state.photo) { s.getTracks().forEach(tr => tr.stop()); return; }   // user moved on meanwhile
    stream = s; video.srcObject = s; await video.play().catch(() => {});
    $('#btn-capture').disabled = false;
  } catch (e) { if (seq === camSeq) { console.warn('camera', e); camFail(); } }
}
function camFail() { if (current === 'photo' && !state.photo) $('#cam-fallback').hidden = false; $('#btn-capture').disabled = true; }
function stopCamera() { camSeq++; stream?.getTracks().forEach(tr => tr.stop()); stream = null; if (video) video.srcObject = null; }
function showStill(on) {
  still.hidden = !on; scan.hidden = !on; video.hidden = on; $('.cam .guide').hidden = on;
  if (on) $('#cam-fallback').hidden = true;
  $('#alt-row').hidden = on; $('#photo-tip').hidden = on; $('#analysis').hidden = !on;
  $('#btn-capture').hidden = on;
  confirmUI(on && state.analyzed); photoBackLabel();
}
// after a photo the footer has 3 buttons, so "back" shrinks to an arrow
function photoBackLabel() { const b = $('#photo-back'), compact = !still.hidden; b.textContent = compact ? '←' : t('back'); b.setAttribute('aria-label', t('back')); }
function confirmUI(show) { $('#btn-retake').hidden = !show; $('#btn-use').hidden = !show; }
function squareCrop(src, sw, sh, size) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d', { willReadFrequently: true });
  const s = Math.min(sw, sh); g.drawImage(src, (sw - s) / 2, (sh - s) / 2, s, s, 0, 0, size, size);
  return c;
}

// ---- capture → scan animation → analysis → pixelate reveal ----
let scanAnim = null;
async function usePhotoSource(src, sw, sh, mirrored) {
  state.analyzed = false;
  const full = squareCrop(src, sw, sh, Math.min(CONFIG.photoMaxSide, Math.min(sw, sh)));
  state.photo = full.toDataURL('image/jpeg', CONFIG.photoQuality);
  if (state.photo.length > 850000) state.photo = squareCrop(src, sw, sh, 480).toDataURL('image/jpeg', 0.7);
  const work = squareCrop(src, sw, sh, 360);
  still.width = still.height = scan.width = scan.height = 480;
  const pg = still.getContext('2d');
  pg.save(); if (mirrored) { pg.translate(480, 0); pg.scale(-1, 1); } pg.drawImage(work, 0, 0, 480, 480); pg.restore();
  showStill(true);
  $('#chips').innerHTML = ''; $('#scan-status').textContent = t('analyzing'); $('#scan-status').className = 'scan-status dots';

  const anim = { t0: performance.now(), points: null, mirrored, done: false, reveal: 0, work, ok: false };
  scanAnim = anim; runScan(anim);
  let res = null;
  try { res = await analyzePhoto(work); } catch (e) { console.warn('analysis failed', e); }
  if (scanAnim !== anim) return;
  if (res?.ok) {
    anim.points = res.points;
    Object.assign(state.avatar, res.patch);
    genderize(state.avatar, res.gender);           // also clears an accessory left from an earlier look that contradicts it
    state.gender = res.gender; state.photoHp = res.patch.hp;
    state.tags = res.tags;
  } else {
    // no face found: only the clothes colour is trusted — the centre of an arbitrary photo is often a wall or a shirt,
    // which used to become the guest's skin colour (v3.3)
    const { color } = extractColors(squareCrop(src, sw, sh, 160));
    state.avatar.color = color; state.photoColor = color;
    state.gender = null; state.photoHp = null; state.tags = null;
  }
  state.base = res?.ok ? normalizeAvatar(state.avatar) : null; state.picks = null;
  if (res?.ok) state.photoColor = null;   // v4.1: the photo look → four suggestions on the next screen
  setTimeout(() => {
    if (scanAnim !== anim) return;
    anim.done = performance.now();
    $('#scan-status').className = 'scan-status';
    $('#scan-status').textContent = res?.ok ? t('analyzed') : t(res ? 'no_face' : 'no_model');
    const chips = $('#chips');
    (state.tags || []).forEach((tg, i) => { const c = document.createElement('span'); c.className = 'chip'; c.style.animationDelay = (i * 0.12) + 's'; c.textContent = getLang() === 'ko' ? tg.ko : tg.en; chips.append(c); });
    state.analyzed = true; confirmUI(true);
  }, res?.ok ? 900 : 200);
}
function runScan(anim) {
  const work = anim.work;
  const g = scan.getContext('2d'); g.imageSmoothingEnabled = false;
  const small = document.createElement('canvas');
  anim.running = true;
  const frame = () => {
    if (scanAnim !== anim) { anim.running = false; return; }
    if (current !== 'photo') { anim.running = false; return; }   // resumes from startCamera() when they come back
    const now = performance.now(), el = (now - anim.t0) / 1000;
    g.clearRect(0, 0, 480, 480);
    if (!anim.done) {
      // scanning line + landmark dots
      const y = (Math.sin(el * 2.2) * 0.5 + 0.5) * 480;
      const gr = g.createLinearGradient(0, y - 30, 0, y + 4); gr.addColorStop(0, 'rgba(143,211,255,0)'); gr.addColorStop(1, 'rgba(143,211,255,.55)');
      g.fillStyle = gr; g.fillRect(0, y - 30, 480, 34); g.fillStyle = '#8fd3ff'; g.fillRect(0, y, 480, 2);
      if (anim.points) {
        const n = Math.min(anim.points.length, Math.floor((el % 10) * 60));
        g.fillStyle = '#ffd75e';
        anim.points.slice(0, n).forEach(p => { const x = (anim.mirrored ? 1 - p.x : p.x) * 480; g.fillRect(x - 2, p.y * 480 - 2, 4, 4); });
      }
    } else {
      // pixelate the photo, then pop the avatar in
      const k = Math.min(1, (now - anim.done) / 900);
      if (k < 0.7) {
        const res = Math.max(8, Math.round(96 * (1 - k / 0.7) ** 2));
        small.width = small.height = res; const sg = small.getContext('2d');
        sg.save(); if (anim.mirrored) { sg.translate(res, 0); sg.scale(-1, 1); } sg.drawImage(work, 0, 0, res, res); sg.restore();
        g.drawImage(small, 0, 0, 480, 480);
      } else {
        g.fillStyle = `rgba(255,248,236,${Math.min(0.92, (k - 0.7) / 0.3)})`; g.fillRect(0, 0, 480, 480);
        const s = getSprite(state.avatar)[Math.floor(el * 3) % 7 === 0 ? 'blink' : 'idle'], sc = 11;
        const bounce = Math.round(Math.abs(Math.sin(el * 3)) * 6);
        g.globalAlpha = Math.min(1, (k - 0.7) / 0.3);
        g.drawImage(s, 240 - SPRITE_W * sc / 2, 240 - SPRITE_H * sc / 2 - bounce, SPRITE_W * sc, SPRITE_H * sc);
        g.globalAlpha = 1;
      }
    }
    requestAnimationFrame(frame);
  };
  frame();
}
$('#btn-capture').addEventListener('click', () => {
  if (!video.videoWidth) return;
  $('.cam .flash').classList.remove('go'); void $('.cam .flash').offsetWidth; $('.cam .flash').classList.add('go');
  usePhotoSource(video, video.videoWidth, video.videoHeight, true); stopCamera();
});
$('#btn-retake').addEventListener('click', () => { state.photo = null; state.analyzed = false; scanAnim = null; $('#chips').innerHTML = ''; startCamera(); });
$('#file').addEventListener('change', e => {
  const f = e.target.files?.[0]; if (!f) return;
  const img = new Image(), url = URL.createObjectURL(f);
  img.onload = () => { URL.revokeObjectURL(url); if (current !== 'photo') return; stopCamera(); usePhotoSource(img, img.naturalWidth, img.naturalHeight, false); };
  img.onerror = () => { URL.revokeObjectURL(url); toast(t('photo_unsupported')); };
  img.src = url; e.target.value = '';
});
$('#keep-photo').addEventListener('change', e => { state.keepPhoto = e.target.checked; });
// v4: a message only the couple can read (stored apart from the public guest document — store.addGuest)
$('#in-priv').addEventListener('change', e => { state.priv = e.target.checked; });
$('#btn-upload').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('#file').click(); } });
$('#btn-skip').addEventListener('click', () => {
  state.photo = null; stopCamera();
  if (state.simple) { state.avatar = randomAvatar(); quickSubmit(); return; }
  // v4.1: without a photo the guest starts from one of four varied looks — never the default look (navy suit + short black hair
  // read as the groom). The ✨ tab shows all four.
  state.base = null; state.gender = null; state.photoHp = null; state.photoColor = null;
  state.picks = makePicks(); state.avatar = state.picks[0]; state.tab = 'pick';
  go('custom');
});
function quickSubmit() { state.activity = ['walk', 'chat', 'eat', 'dance'][Math.floor(Math.random() * 4)]; $('#btn-submit').click(); }

// ---------- customize (tabs) ----------
const curHp = () => state.avatar.hairStyle === 'photo' ? { ...state.avatar.hp } : { ...(HAIR_PRESETS[state.avatar.hairStyle] || HAIR_PRESETS.short) };
const GROUPS = {
  face: [['skin', 'swatch', SKIN], ['face', 'thumb', FACES], ['eyes', 'thumb', EYES], ['mouth', 'thumb', MOUTHS], ['brows', 'thumb', BROWS], ['beard', 'thumb', BEARDS], ['glasses', 'thumb', GLASSES]],
  hair: [['hair', 'swatch', HAIR], ['hairStyle', 'thumb', null], ['bangs', 'thumb', BANGS], ['length', 'thumb', [0, 1, 2, 3, 4]]],
  outfit: [['outfit', 'thumb', OUTFITS], ['color', 'swatch', COLORS], ['color2', 'swatch', [null, ...COLORS]]],
  acc: [['acc', 'thumb', ACCESSORIES]],
};
function variant(key, v) {
  const a = { ...state.avatar };
  if (key === 'bangs' || key === 'length') { const hp = curHp(); if (key === 'bangs') hp.b = v; else { hp.l = v; if (hp.t < 0) hp.t = 1; } a.hairStyle = 'photo'; a.hp = hp; }
  else if (key === 'hairStyle') { if (v === 'photo') { a.hairStyle = 'photo'; a.hp = state.photoHp; } else { a.hairStyle = v; delete a.hp; } }
  else if (key === 'color2') { if (v == null) delete a.color2; else a.color2 = v; }
  else a[key] = v;
  return normalizeAvatar(a);
}
function selected(key, v) {
  const a = state.avatar;
  if (key === 'bangs') return curHp().b === v;
  if (key === 'length') return curHp().l === v;
  if (key === 'hairStyle') return v === 'photo' ? a.hairStyle === 'photo' : a.hairStyle === v;
  if (key === 'color2') return (a.color2 ?? null) === v;
  return a[key] === v;
}
function renderCustom() {
  const tabs = $('#tabs'); tabs.innerHTML = '';
  ['pick', 'face', 'hair', 'outfit', 'acc'].forEach(k => {
    const b = document.createElement('button'); b.type = 'button'; b.role = 'tab'; b.textContent = t('tab_' + k);
    b.setAttribute('aria-selected', state.tab === k); b.addEventListener('click', () => { state.tab = k; renderCustom(); }); tabs.append(b);
  });
  const box = $('#opts'); box.innerHTML = '';
  if (state.tab === 'pick') { renderPicks(box); const nm = $('#preview-name'); nm.textContent = state.name || '?'; nm.className = 'tag ' + state.side; return; }
  for (const [key, kind, listRaw] of GROUPS[state.tab]) {
    const list = key === 'hairStyle' ? [...(state.photoHp ? ['photo'] : []), ...HAIR_STYLES] : listRaw;
    const grp = document.createElement('div'); grp.className = 'opt-group';
    const h = document.createElement('h3'); h.textContent = t(key === 'hairStyle' ? 'hairStyle' : key); grp.append(h);
    const wrap = document.createElement('div'); wrap.className = kind === 'swatch' ? 'swatches' : 'thumbs';
    list.forEach((val, i) => {
      const vv = kind === 'swatch' ? (key === 'color2' ? val : i) : val;
      const b = document.createElement('button'); b.type = 'button';
      b.setAttribute('aria-pressed', selected(key, vv));
      b.setAttribute('aria-label', `${t(key)} ${typeof val === 'string' ? val : i + 1}`);
      if (kind === 'swatch') { b.style.background = val || 'repeating-linear-gradient(45deg,#fff 0 4px,#ddd 4px 8px)'; }
      else {
        const c = document.createElement('canvas'); c.width = SPRITE_W; c.height = SPRITE_H;
        c.getContext('2d').drawImage(getSprite(variant(key, vv)).idle, 0, 0); b.append(c);
        if (val === 'photo') { const s = document.createElement('small'); s.textContent = t('my_photo'); b.append(s); }
      }
      b.addEventListener('click', () => { state.avatar = variant(key, vv); renderCustom(); });
      wrap.append(b);
    });
    grp.append(wrap); box.append(grp);
  }
  const nm = $('#preview-name'); nm.textContent = state.name || '?'; nm.className = 'tag ' + state.side;
}
// ✨ picks (v4.1): four looks — from the photo (same face, skin, hair colour, glasses) or four varied ones without a photo
// (a photo without a face still gives the clothes colour to all four)
function makePicks() {
  if (state.base) return suggestLooks(state.base, state.gender);
  const list = suggestLooks(null);
  // a photo without a face: its clothes colour is trusted, the skin is not (it would be the wall or the sky) → the default step
  return state.photo && state.photoColor ? list.map(a => normalizeAvatar({ ...a, color: state.photoColor, skin: 2 })) : list;
}
const PICK_KEYS = ['pick_as_is', 'pick_hanbok', 'pick_formal', 'pick_casual'];
const sameLook = (a, b) => JSON.stringify(normalizeAvatar(a)) === JSON.stringify(normalizeAvatar(b));
function renderPicks(box) {
  if (!state.picks) state.picks = makePicks();
  const head = document.createElement('p'); head.className = 'pick-note'; head.textContent = t(state.base ? 'pick_photo' : 'pick_title'); box.append(head);
  const grid = document.createElement('div'); grid.className = 'picks';
  state.picks.forEach((av, i) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'pick'; b.dataset.i = String(i);
    b.setAttribute('aria-pressed', sameLook(av, state.avatar));
    const c = document.createElement('canvas'); c.width = SPRITE_W * 3; c.height = SPRITE_H * 3;
    const g = c.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(getSprite(av).idle, 0, 0, c.width, c.height);
    const cap = document.createElement('span'); cap.textContent = state.base ? t(PICK_KEYS[i]) : t('pick_n', { n: i + 1 });
    b.setAttribute('aria-label', cap.textContent);
    b.append(c, cap);
    b.addEventListener('click', () => { state.avatar = normalizeAvatar(av); renderCustom(); });
    grid.append(b);
  });
  box.append(grid);
  const more = document.createElement('button'); more.type = 'button'; more.className = 'px-btn secondary small pick-more'; more.textContent = t('pick_more');
  more.addEventListener('click', () => {
    const fresh = makePicks();
    state.picks = fresh; state.avatar = fresh[0]; renderCustom();
  });
  box.append(more);
}
let pvT = 0;
(function previewLoop() {
  pvT += 1 / 60;
  if (current === 'custom') {
    const cyc = pvT % 8;
    const f = cyc < 2 ? (cyc % 1.4 > 1.3 ? 'blink' : 'idle') : cyc < 4 ? (Math.floor(pvT / 0.16) % 2 ? 'walk1' : 'walk2') : cyc < 5 ? 'wave' : cyc < 6 ? (Math.floor(pvT / 0.16) % 2 ? 'back1' : 'back2') : 'idle';
    drawPreview($('#preview'), state.avatar, f);
  }
  if (current === 'done') drawDone();
  requestAnimationFrame(previewLoop);
})();
$('#btn-random').addEventListener('click', () => {
  const keep = state.photoHp ? { skin: state.avatar.skin, hair: state.avatar.hair } : {};
  state.avatar = randomAvatar(keep, state.gender); renderCustom();
});

// ---------- activity ----------
const ACT_ICON = { walk: '🚶', dance: '💃', fish: '🎣', chat: '💬', eat: '🍰', photo: '📷' };
function renderActs() {
  const box = $('#acts'); box.innerHTML = '';
  ACTIVITIES.forEach(a => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'act-card'; b.setAttribute('aria-pressed', state.activity === a);
    b.innerHTML = `<span class="ico">${ACT_ICON[a]}</span><b></b><small></small>`;
    b.querySelector('b').textContent = t('act_' + a); b.querySelector('small').textContent = t('act_' + a + '_d');
    b.addEventListener('click', () => { state.activity = a; renderActs(); });
    box.append(b);
  });
}

// ---------- submit ----------
let submitting = false, pendingWrites = 0, remoteGid = null;
addEventListener('beforeunload', e => { if (pendingWrites > 0) { e.preventDefault(); e.returnValue = ''; } });
$('#btn-submit').addEventListener('click', async () => {
  if (submitting) return;
  if (!validInfo()) { go('info'); return; }
  submitting = true; $('#sending').classList.add('on'); $('#submit-err').textContent = '';
  state.keepPhoto = $('#keep-photo').checked;
  try {
    const store = await getStore();
    const res = await store.addGuest(
      { name: state.name.trim(), side: state.side, message: state.message.trim(), priv: !!state.priv && !!state.message.trim(), avatar: normalizeAvatar(state.avatar), activity: state.activity },
      { photo: state.keepPhoto ? state.photo : null, voice: state.voice ? { data: state.voice.data, mime: state.voice.mime } : null, capsule: state.capsule.trim() || null },
    );
    if (!KIOSK) { try { localStorage.setItem('wgb_mine', JSON.stringify([...mine().filter(m => m.id !== res.id), { id: res.id, name: state.name.trim(), avatar: normalizeAvatar(state.avatar) }].slice(-5))); } catch {} }
    $('#done-queued').hidden = !res.queued;
    if (res.queued && res.done) {   // keep the page alive until the slow write really lands
      pendingWrites++;
      res.done.then(() => { $('#done-queued').hidden = true; toast(t('done_sent')); }, () => { $('#done-queued').textContent = t('error'); }).finally(() => { pendingWrites--; });
    }
    $('#done-msg').textContent = state.message.trim() || t('voice_msg');
    { // v4: tell features (before the done screen paints its hub)
      const nm = state.name.trim(); justSubmitted = { gid: res.id, name: nm };
      if (KIOSK) kioskMine = { id: res.id, name: nm };
      emit('guest:submitted', { gid: res.id, name: nm, side: state.side, avatar: normalizeAvatar(state.avatar), simple: state.simple, kiosk: KIOSK, queued: !!res.queued });
      emit('guest:mine', { id: res.id, name: nm });
    }
    go('done');
    if (KIOSK) { drawHandoff(res.id, state.name.trim()); startResetCountdown(25); } else { remoteGid = res.id; renderRemote($('#remote-done'), res.id); mountSnapUploader($('#snap-done'), { gid: res.id, name: state.name.trim(), where: 'done' }); $('#link-village').href = villageUrl(res.id); }
  } catch (e) {
    console.error(e); $('#submit-err').textContent = t('error'); toast(t('error'));   // simple mode submits from the photo screen
  } finally { submitting = false; $('#sending').classList.remove('on'); }
});

// ---------- phone remote ----------
const EM_ICON = { heart: '❤️', clap: '👏', dance: '💃', jump: '⬆️', greet: '👋' };
function renderRemote(box, gid) {
  box.innerHTML = '';
  const h = document.createElement('h3'); h.textContent = t('remote_title');
  const p = document.createElement('p'); p.className = 'tip'; p.textContent = t('remote_sub');
  const grid = document.createElement('div'); grid.className = 'remote-grid';
  let cooldown = 0;
  EMOTES.forEach(type => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'remote-btn' + (type === 'greet' ? ' wide' : '');
    b.innerHTML = `<span>${EM_ICON[type]}</span><small></small>`; b.querySelector('small').textContent = t('em_' + type);
    b.addEventListener('click', async () => {
      if (Date.now() < cooldown) return;
      cooldown = Date.now() + 3000;
      grid.classList.add('cool'); setTimeout(() => grid.classList.remove('cool'), 3000);
      b.classList.add('sent'); setTimeout(() => b.classList.remove('sent'), 900);
      try { navigator.vibrate?.(30); } catch {}
      try { await (await getStore()).sendEmote(gid, type); emit('remote:sent', { gid, type, where: box.id === 'remote-solo' ? 'solo' : 'done' }); } catch (e) { console.warn(e); if (e.code !== 'permission-denied') toast(t('error'), 2500); }
    });
    grid.append(b);
  });
  box.append(h, p, grid);
}
const villageUrl = id => 'village.html?me=' + encodeURIComponent(id) + (DEMO && new URLSearchParams(location.search).get('demo') === '1' ? '&demo=1' : '');
function openMine() {
  const m = mine(); if (!m.length) return false; const me = m[m.length - 1];
  remoteGid = me.id; soloWho = { gid: me.id, name: me.name }; renderRemote($('#remote-solo'), me.id); mountSnapUploader($('#snap-solo'), { gid: me.id, name: me.name, where: 'solo' }); $('#link-village2').href = villageUrl(me.id);
  go('remote');
  return true;
}
$('#btn-mysnap')?.addEventListener('click', () => openMine());
$('#remote-home')?.addEventListener('click', () => go('welcome'));

// ---------- done ----------
let doneT = 0;
function drawDone() {
  doneT += 1 / 60;
  const c = $('#done-canvas'); const stageW = c.parentElement.clientWidth;
  c.style.left = (((doneT * 40) % (stageW + 120)) - 110) + 'px';
  drawPreview(c, state.avatar, Math.floor(doneT / 0.16) % 2 ? 'walk1' : 'walk2');
}

// ---------- kiosk → phone hand-off: QR with this guest's id, so they can share photos / use the remote on their own phone ----------
function drawHandoff(gid, name) {
  const q = qrcode(0, 'L'); q.addData(handoffUrl(gid, name)); q.make();
  const n = q.getModuleCount(), pad = 2, c = $('#handoff-qr'); c.width = c.height = n + pad * 2;
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.fillStyle = '#2b2033';
  for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (q.isDark(r, k)) g.fillRect(k + pad, r + pad, 1, 1);
}

// ---------- kiosk: reset ----------
let resetTimer = null, idleTimer = null;
function startResetCountdown(sec = 12) {
  let n = sec; const el = $('#reset-count'); clearInterval(resetTimer);
  const tick = () => { el.textContent = `${n}${t('reset_in')}`; if (n-- <= 0) resetAll(); };
  tick(); resetTimer = setInterval(tick, 1000);
}
function resetAll() {
  emit('guest:reset', {}); justSubmitted = null; soloWho = null;      // v4 (features clear their own state)
  if (KIOSK) { kioskMine = null; emit('guest:mine', null); }
  clearInterval(resetTimer); clearTimeout(idleTimer); stopCamera(); scanAnim = null;
  stopRec(true); audioEl?.pause(); audioEl = null;
  Object.assign(state, { name: '', side: 'both', message: '', priv: false, photo: null, gender: null, photoHp: null, tags: null, analyzed: false, keepPhoto: true, activity: 'walk', tab: 'pick', avatar: defaultAvatar(), voice: null, capsule: '', base: null, picks: null, photoColor: null });
  if ($('#in-capsule')) { $('#in-capsule').value = ''; $('#capsule-box').open = false; }
  voiceUI('idle'); setSimple(false);
  nameEl.value = ''; msgEl.value = ''; $('#keep-photo').checked = true; $('#in-priv').checked = false;
  ['#submit-err', '#v-err', '#chips', '#scan-status', '#reset-count'].forEach(sel => { $(sel).textContent = ''; });
  $('#done-queued').hidden = true; $('#file').value = '';
  const hq = $('#handoff-qr'); hq?.getContext('2d').clearRect(0, 0, hq.width, hq.height);
  $$('#side-seg button').forEach(x => x.setAttribute('aria-pressed', x.dataset.v === 'both'));
  current = 'welcome';
  if (KIOSK) setLang(CONFIG.defaultLang);
  renderLang(); syncInfo();
  go('welcome');
}
if (KIOSK) {
  const bump = () => { clearTimeout(idleTimer); if (current !== 'welcome' && current !== 'done' && !submitting) idleTimer = setTimeout(() => { if (!submitting) resetAll(); }, 120000); };
  ['pointerdown', 'keydown', 'input'].forEach(ev => addEventListener(ev, bump, true));
}

// ---------- nav ----------
$('#btn-start').addEventListener('click', () => { setSimple(false); go('info'); });
$('#btn-simple').addEventListener('click', () => { setSimple(true); go('info'); });
let simpleSent = null;
function setSimple(on) {
  state.simple = on; document.body.classList.toggle('simple', on);
  $('#btn-use').textContent = t(on ? 'simple_enter' : 'to_custom');
  msgEl.placeholder = on ? t('voice_only_ok') : t('message_ph');
  paintStep();
  if (simpleSent !== on) { simpleSent = on; emit('guest:simple', { on }); }   // v4: only on a real change — paintTexts() re-applies the same value
}
// kiosk: backing out to the start wipes the entry, so the next guest never sees it
$('#info-back').addEventListener('click', () => { if (KIOSK) resetAll(); else go('welcome'); });
$('#info-next').addEventListener('click', () => { if (validInfo()) go('photo'); });
$('#photo-back').addEventListener('click', () => go('info'));
$('#btn-use').addEventListener('click', () => {
  if (state.simple) { quickSubmit(); return; }
  if (!state.picks) {                                         // v4.1: four looks from the photo (① as analysed ② hanbok ③ dressed up ④ casual)
    state.picks = makePicks();
    state.avatar = state.picks[0]; state.tab = 'pick';
  }
  go('custom');
});
$('#custom-back').addEventListener('click', () => go('photo'));
$('#btn-to-act').addEventListener('click', () => go('act'));
$('#act-back').addEventListener('click', () => go('custom'));
$('#btn-again')?.addEventListener('click', resetAll);

// ============================================================
//  v4 extension points (WP-00c §3) — the only way features touch this page. docs/v4/02-contracts.md §6
//  With every feature off none of this runs: no hubs, no feature screens, an empty #slot-welcome.
// ============================================================
let justSubmitted = null, soloWho = null;      // who the done / remote hub cards belong to ({ gid, name })
let kioskMine = null;                          // kiosk: the guest who just submitted (memory only — the kiosk never stores anyone)
let coupleOwner = null;                        // feature id that swapped the welcome stage sprites
const hubs = new Set();                        // ctx.guest.hub.add items: { spec, scope, nodes: { done, solo } }
const noop = () => {};
const coded = (code, msg) => Object.assign(new Error(msg), { code });
const lastMine = () => { const m = mine(); const l = m[m.length - 1]; return l ? { id: l.id, name: l.name || '' } : null; };
const NAME_OK = id => new RegExp('^f-' + id + '(-[a-z0-9-]{1,24})?$');

// ---- hub (done + my-space screens) ----
function paintHubs(where) {
  if (KIOSK) return;                                                                   // the kiosk's done screen belongs to the hand-off QR
  const host = $(where === 'done' ? '#s-done' : '#s-remote'); if (!host) return;
  const w = where === 'done' ? justSubmitted : soloWho, who = w ? { gid: w.gid, name: w.name, where } : null;
  for (const h of [...hubs]) paintHub(h, where, host, who);
}
function paintHub(h, where, host, who) {
  let show = !!who && h.scope.alive();
  if (show && typeof h.spec.when === 'function') { try { show = h.spec.when(who) !== false; } catch (e) { h.scope.report(e); show = false; } }
  const old = h.nodes[where];
  if (!show) { if (old) { old.remove(); delete h.nodes[where]; } return; }
  if (old && old.dataset.gid === who.gid) {                                            // same guest: keep it (a card's content belongs to the feature)
    if (typeof h.spec.title === 'function') { const t = old.querySelector('.hub-title'); if (t) t.textContent = hubTitle(h.spec); }   // a row's function title is read again (counts)
    return;
  }
  old?.remove();
  const node = hubNode(h, who); h.nodes[where] = node;
  host.insertBefore(node, host.querySelector('.sticky-foot'));                         // visual order = CSS order (style.css "v4 slots")
}
function hubNode(h, who) {
  const { spec, scope } = h, card = spec.size === 'card', g = scope.guard;
  const n = document.createElement('section');
  n.className = (card ? 'hub-card' : 'hub-row') + ' px-box' + (scope.entry.simple === false ? ' f-nosimple' : '');
  n.dataset.f = scope.id; n.dataset.hub = spec.key; n.dataset.gid = who.gid; n.style.order = String(spec.order);
  if (card) { if (typeof spec.render === 'function') g(spec.render)(n, who); return n; }
  n.setAttribute('role', 'button'); n.tabIndex = 0;
  const ico = document.createElement('span'); ico.className = 'hub-ico'; ico.textContent = spec.icon || '';
  const ttl = document.createElement('b'); ttl.className = 'hub-title'; ttl.textContent = hubTitle(spec);
  const go2 = document.createElement('span'); go2.className = 'hub-go'; go2.textContent = '›'; go2.setAttribute('aria-hidden', 'true');
  n.append(ico, ttl, go2);
  if (typeof spec.onClick === 'function') {
    const click = g(spec.onClick);
    n.addEventListener('click', () => click({ gid: who.gid, name: who.name, where: n.parentElement?.id === 's-done' ? 'done' : 'solo' }));
    n.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); n.click(); } });
  }
  return n;
}
const hubTitle = spec => { try { return String(typeof spec.title === 'function' ? spec.title() : spec.title ?? ''); } catch { return ''; } };
// titles given as a function follow the language (and ctx.texts overrides); plain strings stay as the feature set them
function relabelHubs() {
  for (const h of hubs) if (typeof h.spec.title === 'function') for (const n of Object.values(h.nodes)) { const el = n.querySelector('.hub-title'); if (el) el.textContent = hubTitle(h.spec); }
}
const hubsRefresh = () => { if (shown === 'done') paintHubs('done'); else if (shown === 'remote') paintHubs('solo'); };

// ---- the ctx.guest object handed to each feature (all registrations are undone by scope.add on dispose) ----
function makeGuestApi(scope) {
  const alive = scope.alive, own = NAME_OK(scope.id);
  const checkName = (name, what) => { if (typeof name !== 'string' || !own.test(name)) throw coded('bad-name', `${what}: "${name}" must be "f-${scope.id}" or "f-${scope.id}-<x>"`); };
  const myself = () => (KIOSK ? kioskMine : lastMine());
  const demoQ = () => (DEMO && new URLSearchParams(location.search).get('demo') === '1' ? '?demo=1' : '');
  const exists = name => typeof name === 'string' && !!document.getElementById('s-' + name)?.classList.contains('screen');
  let hasSprites = false;

  const screens = Object.freeze({
    add(name, spec = {}) {
      checkName(name, 'ctx.guest.screens.add');
      if (!alive()) return null;
      if (featureScreens.has(name) || document.getElementById('s-' + name)) throw coded('duplicate', `screen "${name}" already exists`);
      const section = document.createElement('section'); section.className = 'screen'; section.id = 's-' + name; section.dataset.f = scope.id;
      const opt = fn => (typeof fn === 'function' ? scope.guard(fn) : null);
      featureScreens.set(name, { section, onEnter: opt(spec.onEnter), onLeave: opt(spec.onLeave) });
      document.querySelector('main.app').append(section);
      scope.add(() => {                                                                // feature turned off: its screen goes away; never leave a blank page behind
        featureScreens.delete(name);
        const here = shown === name; section.remove();
        if (here) { if (KIOSK) resetAll(); else go(document.getElementById('s-' + prevScreen) ? prevScreen : 'welcome'); }
      });
      opt(spec.render)?.(section);
      return section;
    },
  });

  const hub = Object.freeze({
    add(spec = {}) {
      checkName(spec.key, 'ctx.guest.hub.add key');
      if (!Number.isFinite(spec.order)) throw coded('bad-arg', 'ctx.guest.hub.add: order must be a number');
      if (spec.size !== 'row' && spec.size !== 'card') throw coded('bad-arg', "ctx.guest.hub.add: size must be 'row' or 'card'");
      if (!alive()) return noop;
      for (const h of hubs) if (h.spec.key === spec.key) throw coded('duplicate', `hub item "${spec.key}" already exists`);
      const h = { spec: { ...spec }, scope, nodes: {} };
      hubs.add(h);
      const remove = () => { hubs.delete(h); for (const n of Object.values(h.nodes)) n.remove(); h.nodes = {}; };
      scope.add(remove);
      hubsRefresh();                                                                   // switched on while the guest is already looking at the done / my-space screen
      return remove;
    },
    refresh: () => { if (alive()) hubsRefresh(); },
  });

  const welcome = Object.freeze({
    add(el, { order = 50 } = {}) {
      if (!(el instanceof HTMLElement)) throw coded('bad-arg', 'ctx.guest.welcome.add: el must be an HTMLElement');
      if (!Number.isFinite(order)) throw coded('bad-arg', 'ctx.guest.welcome.add: order must be a number');
      if (!alive()) return noop;
      const slot = $('#slot-welcome');
      el.dataset.f = scope.id; el.dataset.order = String(order);
      if (scope.entry.simple === false) el.classList.add('f-nosimple');
      slot.insertBefore(el, [...slot.children].find(c => Number(c.dataset.order) > order) || null);
      const remove = () => el.remove();
      scope.add(remove);
      return remove;
    },
  });

  const setCoupleSprites = (groom, bride) => {
    if (!alive()) return;
    const norm = f => {
      if (f == null) return null;
      if (typeof f !== 'object' || !f.idle) throw coded('bad-arg', 'ctx.guest.setCoupleSprites: frames must look like getSprite() output (needs .idle)');
      return { ...f, blink: f.blink || f.idle, wave: f.wave || f.idle };
    };
    const gs = norm(groom), bs = norm(bride);
    if (gs || bs) {
      const release = scope.claim('coupleSprites');                                    // second feature → owner-conflict (counted against the caller)
      if (!hasSprites) { hasSprites = true; scope.add(() => { if (coupleOwner === scope.id) { coupleG = coupleB = null; coupleOwner = null; } release(); }); }
      coupleOwner = scope.id; coupleG = gs; coupleB = bs;
    } else if (coupleOwner === scope.id) { coupleG = coupleB = null; coupleOwner = null; }
  };

  const api = {
    kiosk: KIOSK,
    simple: () => state.simple,
    me: () => { const m = myself(); return m ? { id: m.id, name: m.name } : null; },
    screen: () => shown,
    go: name => {
      if (!alive()) return;
      if (!exists(name)) throw coded('bad-name', `ctx.guest.go: unknown screen "${name}"`);
      go(name);
    },
    back: () => { if (alive()) go(document.getElementById('s-' + prevScreen) ? prevScreen : 'welcome'); },
    toast: (msg, ms) => { if (alive()) toast(String(msg ?? ''), ms); },
    villageUrl: gid => {
      const id = gid || myself()?.id;
      return id ? villageUrl(String(id)) : 'village.html' + demoQ();
    },
    remember: m => {
      if (!alive() || KIOSK) return;                                                   // the kiosk never remembers anyone
      if (!m || typeof m.id !== 'string' || !m.id || m.id.length > 64) throw coded('bad-arg', 'ctx.guest.remember: { id, name } needs a string id (≤ 64)');
      const id = m.id, name = String(m.name ?? '').slice(0, 30), old = mine().find(x => x.id === id);
      try { localStorage.setItem('wgb_mine', JSON.stringify([...mine().filter(x => x.id !== id), { ...(old || {}), id, name }].slice(-5))); } catch {}
      renderHero(); emit('guest:mine', { id, name });
    },
    openMine: () => (alive() ? openMine() : false),
    reset: () => { if (alive()) resetAll(); },
    setCoupleSprites,
    screens, hub, welcome,
    mountSnapUploader: (box, o = {}) => {
      if (!alive()) return;
      if (!(box instanceof HTMLElement)) throw coded('bad-arg', 'ctx.guest.mountSnapUploader: box must be an HTMLElement');
      if (typeof o.gid !== 'string' || !o.gid) throw coded('bad-arg', 'ctx.guest.mountSnapUploader: gid is required');
      mountSnapUploader(box, { gid: o.gid, name: String(o.name ?? '').slice(0, 30), onUploaded: typeof o.onUploaded === 'function' ? scope.guard(o.onUploaded) : undefined, where: 'feature' });
    },
    uploadSnap: async ({ gid, name, dataURL, caption } = {}) => {
      if (!alive()) return null;
      if (typeof gid !== 'string' || !gid) throw coded('bad-arg', 'ctx.guest.uploadSnap: gid is required');
      return uploadSnapData(gid, String(name ?? '').slice(0, 30), dataURL, caption, 'feature');
    },
    snapsLeft: gid => Math.max(0, CONFIG.snapLimitPerGuest - mySnaps(String(gid ?? '')).n),
  };
  return { guest: Object.freeze(api) };
}

if (DEMO) { const d = document.createElement('div'); d.className = 'demo-ribbon'; d.textContent = 'DEMO MODE · 이 브라우저에만 저장됨'; document.body.append(d); document.body.classList.add('demo'); }
// devices where the couple has signed in to admin before get a labelled button instead of the faint key
try { if (!KIOSK && localStorage.getItem('wgb_admin') === '1') { const al = $('#admin-link'); al.classList.add('known'); al.textContent = '🔑 관리자'; } } catch {}
renderLang(); syncInfo(); go('welcome');
emit('guest:mine', KIOSK ? null : lastMine());                                           // v4: sticky start value
if (!DEMO) getStore().catch(() => {});   // fetch the Firebase SDK while the guest types (retried at submit if it failed)
// table-card QR → index.html#snap : returning guests jump straight to the photo uploader
// kiosk hand-off QR → index.html#me=<id>&n=<name> : remember this guest on the phone and open photos/remote
{
  const hp = new URLSearchParams(location.hash.slice(1));
  if (!KIOSK && hp.get('me')) {
    const id = hp.get('me').slice(0, 64), name = (hp.get('n') || '').slice(0, 30);
    try { localStorage.setItem('wgb_mine', JSON.stringify([...mine().filter(m => m.id !== id), { id, name }].slice(-5))); } catch {}
    emit('guest:mine', lastMine());
    history.replaceState(null, '', location.pathname + location.search); renderHero(); openMine();
  }
}
if (!KIOSK && location.hash === '#snap' && !openMine()) { needGuestNotice = true; renderHero(); }

// ---------- v4: boot the feature loader (WP-00b) — never throws, never blocks the guest ----------
// html.f-boot hides the welcome content (not the start buttons) for at most 0.6 s so late feature cards don't make the page jump
document.documentElement.classList.add('f-boot');
const unboot = () => document.documentElement.classList.remove('f-boot');
setTimeout(unboot, 600);
try { bootFeatures(KIOSK ? 'kiosk' : 'guest', { forFeature: makeGuestApi, refreshTexts: paintTexts }).then(unboot, unboot); }
catch (e) { console.error('[features] boot failed', e); unboot(); }

// ============================================================
//  WP-12 · 📸 픽셀 네컷 (fourcut) — docs/v4/wp/WP-12-fourcut.md
//  폰 앞카메라로 4장 연속 촬영(또는 앨범에서 4장) → 픽셀 액자 세로 네컷 저장·공유 · 원하면 TV 포토월(스냅 1칸)
//  허브 행 order 70 → 화면 f-fourcut(촬영) → f-fourcut-result(결과). 화면을 나가면 카메라를 바로 끔.
// ============================================================
import D from './i18n.js';
import { CONFIG } from '../../config.js';
import { normalizeAvatar } from '../../avatar.js';
import { ensureFonts, shareImage, guestCode } from '../../core/ui.js';
import { FRAMES, cut, pixelate, strip, grid, jpegUnder } from './render.js';

export const i18n = D;
export const css = true;

const FRAME_KEY = { pink: 'fourcut_frame_pink', mint: 'fourcut_frame_mint', night: 'fourcut_frame_night' };
const GAP_MS = 2000, COUNT_FROM = 3;

export async function setup(ctx) {
  const g = ctx.guest;
  if (!g?.screens || !g?.hub) return;
  let from = 'done', who = null, stream = null, camSeq = 0, shooting = false, frame = 'pink', pixel = true, raw = [], picks = [], couple = {}, stopShoot = null;
  let made = null;                                          // { strip: canvas, grid: canvas, key } for the current cuts/frame/pixel
  const me = () => (who?.gid ? who : g.me() ? { gid: g.me().id, name: g.me().name } : null);

  // ---------------------------------------------------------------- the capture screen
  const video = ctx.el('video', { cls: 'f-fourcut-video', attrs: { playsinline: '', muted: '', autoplay: '' } });
  video.muted = true;
  const guide = ctx.el('div', { cls: 'f-fourcut-guide', attrs: { 'aria-hidden': 'true' } });
  const count = ctx.el('div', { cls: 'f-fourcut-count', attrs: { 'aria-live': 'assertive' } });
  const flash = ctx.el('div', { cls: 'f-fourcut-flash', attrs: { hidden: '' } });
  const cam = ctx.el('div', { cls: 'f-fourcut-cam', kids: [video, guide, count, flash] });
  const dots = ctx.el('div', { cls: 'f-fourcut-dots', attrs: { 'aria-hidden': 'true' } });
  const camMsg = ctx.el('p', { cls: 'tip f-fourcut-msg', attrs: { role: 'status' } });
  const tip = ctx.el('p', { cls: 'tip f-fourcut-tip' });
  const frameLabel = ctx.el('span', { cls: 'f-fourcut-label' });
  const frameBtns = Object.keys(FRAMES).map(k => ctx.el('button', {
    cls: 'f-fourcut-fbtn f-fourcut-f-' + k, attrs: { type: 'button', 'data-frame': k, 'aria-pressed': String(k === frame) },
    on: { click: () => { frame = k; made = null; paintFrames(); } },
  }));
  const frames = ctx.el('div', { cls: 'f-fourcut-frames', attrs: { role: 'group' }, kids: [frameLabel, ...frameBtns] });
  const startBtn = ctx.el('button', { cls: 'px-btn f-fourcut-start', attrs: { type: 'button' }, on: { click: () => shoot() } });
  const file = ctx.el('input', { cls: 'f-fourcut-file', attrs: { type: 'file', accept: 'image/*', multiple: '', hidden: '' } });
  const albumBtn = ctx.el('button', { cls: 'px-btn secondary f-fourcut-album', attrs: { type: 'button' }, on: { click: () => { file.value = ''; file.click(); } } });
  const back1 = ctx.el('button', { cls: 'px-btn secondary f-fourcut-back', attrs: { type: 'button' }, on: { click: () => g.go(from) } });
  ctx.listen(file, 'change', () => pickFiles([...(file.files || [])]));
  const title1 = ctx.el('h2');

  function paintFrames() {
    frameLabel.textContent = ctx.t('fourcut_frame');
    frameBtns.forEach(b => { b.textContent = ctx.t(FRAME_KEY[b.dataset.frame]); b.setAttribute('aria-pressed', String(b.dataset.frame === frame)); });
    resFrameBtns.forEach(b => { b.textContent = ctx.t(FRAME_KEY[b.dataset.frame]); b.setAttribute('aria-pressed', String(b.dataset.frame === frame)); });
  }
  function paintDots(n) { dots.replaceChildren(...[0, 1, 2, 3].map(i => ctx.el('i', { cls: 'f-fourcut-dot' + (i < n ? ' f-fourcut-dot-on' : '') }))); dots.dataset.n = String(n); }

  async function startCamera() {
    stopCamera();
    camMsg.textContent = '';
    if (!navigator.mediaDevices?.getUserMedia) { noCamera(); return; }
    const seq = ++camSeq;
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false });
      if (seq !== camSeq || g.screen() !== 'f-fourcut') { s.getTracks().forEach(t => t.stop()); return; }   // the guest moved on meanwhile
      stream = s; video.srcObject = s; await video.play().catch(() => {});
      cam.classList.remove('f-fourcut-nocam'); startBtn.disabled = false;
    } catch (e) { if (seq === camSeq) { ctx.log('camera', e?.name || e); noCamera(); } }
  }
  function noCamera() { cam.classList.add('f-fourcut-nocam'); startBtn.disabled = true; camMsg.textContent = ctx.t('fourcut_nocam'); }
  function stopCamera() {
    camSeq++;
    stream?.getTracks().forEach(t => t.stop()); stream = null;
    video.srcObject = null;
  }
  const wait = ms => new Promise(res => { const off = ctx.after(ms, res); stopShoot = () => { off(); res('stop'); }; });

  async function shoot() {
    if (shooting) return;
    if (!stream) { await startCamera(); if (!stream) return; }
    shooting = true; startBtn.disabled = true; albumBtn.disabled = true; raw = []; paintDots(0);
    try {
      for (let n = 0; n < 4; n++) {
        for (let k = n === 0 ? COUNT_FROM : GAP_MS / 1000; k > 0; k--) {        // 3·2·1 first, then 2·1 between shots
          count.textContent = String(k);
          if (await wait(1000) === 'stop' || !stream) throw new Error('stopped');
        }
        count.textContent = '';
        const vw = video.videoWidth || 640, vh = video.videoHeight || 480;
        let c;
        try { c = cut(video, vw, vh, { mirror: true }); } catch { c = cut(video, vw, vh, { w: 720, h: 540, mirror: true }); }   // old phones: less memory
        raw.push(c); paintDots(raw.length);
        flash.hidden = false; ctx.after(150, () => { flash.hidden = true; });
      }
      made = null;
      g.go('f-fourcut-result');
    } catch (e) {
      if (e?.message !== 'stopped') { ctx.log('shoot', e); camMsg.textContent = ctx.t('fourcut_fail'); }
      raw = []; paintDots(0);
    } finally {
      shooting = false; count.textContent = ''; startBtn.disabled = !stream; albumBtn.disabled = false;
    }
  }

  // album: 4 photos (more → the first 4 · fewer → keep them and ask for the rest)
  async function pickFiles(list) {
    camMsg.textContent = ctx.t('fourcut_making');
    for (const f of list) {
      if (picks.length >= 4) break;
      try { picks.push(await decode(f)); } catch (e) { ctx.log('decode', e?.message || e); camMsg.textContent = ctx.t('fourcut_decode'); paintDots(picks.length); return; }
    }
    paintDots(picks.length);
    if (picks.length < 4) { camMsg.textContent = ctx.t('fourcut_pick4', { n: picks.length }); return; }
    raw = picks.slice(0, 4); picks = []; made = null; camMsg.textContent = '';
    g.go('f-fourcut-result');
  }
  function decode(f) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(f), img = new Image();
      img.onload = () => { try { const c = cut(img, img.naturalWidth, img.naturalHeight); res(c); } catch (e) { rej(e); } finally { URL.revokeObjectURL(url); } };
      img.onerror = () => { URL.revokeObjectURL(url); rej(Object.assign(new Error('decode'), { code: 'decode' })); };
      img.src = url;
    });
  }

  g.screens.add('f-fourcut', {
    render: s => s.append(
      ctx.el('div', { cls: 'px-box f-fourcut-top', kids: [title1, tip] }),
      cam, dots, camMsg, frames,
      ctx.el('div', { cls: 'f-fourcut-actions', kids: [startBtn, albumBtn, file] }),
      ctx.el('div', { cls: 'sticky-foot', kids: [back1] }),
    ),
    onEnter: () => { picks = []; raw = []; paintDots(0); startCamera(); },
    onLeave: () => { stopShoot?.(); stopCamera(); },
  });

  // ---------------------------------------------------------------- the result screen
  const preview = ctx.el('img', { cls: 'f-fourcut-preview', attrs: { alt: '' } });
  const resMsg = ctx.el('p', { cls: 'tip f-fourcut-rmsg', attrs: { role: 'status' } });
  const pixelBtn = ctx.el('button', { cls: 'f-fourcut-pixel', attrs: { type: 'button', 'aria-pressed': 'true' }, on: { click: () => { pixel = !pixel; made = null; paintResult(); } } });
  const resFrameBtns = Object.keys(FRAMES).map(k => ctx.el('button', {
    cls: 'f-fourcut-fbtn f-fourcut-f-' + k, attrs: { type: 'button', 'data-frame': k, 'aria-pressed': String(k === frame) },
    on: { click: () => { frame = k; made = null; paintFrames(); paintResult(); } },
  }));
  const resFrames = ctx.el('div', { cls: 'f-fourcut-frames', attrs: { role: 'group' }, kids: resFrameBtns });
  const saveBtn = ctx.el('button', { cls: 'px-btn f-fourcut-save', attrs: { type: 'button' }, on: { click: () => save() } });
  const tvBtn = ctx.el('button', { cls: 'px-btn blue f-fourcut-tv', attrs: { type: 'button' }, on: { click: () => toTv() } });
  const againBtn = ctx.el('button', { cls: 'px-btn secondary f-fourcut-again', attrs: { type: 'button' }, on: { click: () => { raw = []; made = null; g.go('f-fourcut'); } } });
  const title2 = ctx.el('h2');

  function build() {
    if (made) return made;
    const cuts = raw.map(c => (pixel ? pixelate(c) : c));
    const C = CONFIG.couple || {}, L = ctx.lang(), m = me();
    const mine = m ? meAvatar(m.gid) : null;
    const o = {
      cuts, frame, title: `${C.groom?.[L] || C.groom?.ko || ''} ♥ ${C.bride?.[L] || C.bride?.ko || ''}`, date: C.date || CONFIG.schedule?.weddingDate || '',
      me: mine, groom: couple.groom || CONFIG.groomAvatar, bride: couple.bride || CONFIG.brideAvatar,
    };
    made = { strip: strip(o), grid: grid(o) };
    return made;
  }
  // my character for the sticker row: from the submission this page just made, or one read of guests/{gid} (a returning guest)
  const avatars = new Map();
  const meAvatar = gid => avatars.get(gid) || null;
  ctx.bus.on('guest:submitted', p => { if (p?.gid && p.avatar) avatars.set(p.gid, normalizeAvatar(p.avatar)); });
  const needAvatar = gid => (!gid || avatars.has(gid) ? Promise.resolve() : ctx.db.doc('guests/' + gid).get().then(d => { avatars.set(gid, d?.avatar ? normalizeAvatar(d.avatar) : null); }, () => { avatars.set(gid, null); }));

  function paintResult() { paintButtons(); if (!made) renderPreview(); }
  function paintButtons() {
    pixelBtn.textContent = `${ctx.t('fourcut_pixel')}: ${pixel ? ctx.t('fourcut_on') : ctx.t('fourcut_off')}`;
    pixelBtn.setAttribute('aria-pressed', String(pixel));
    saveBtn.textContent = ctx.t('fourcut_save'); againBtn.textContent = ctx.t('fourcut_again');
    const m = me();
    tvBtn.hidden = !m;
    if (m) {
      const left = g.snapsLeft(m.gid);
      tvBtn.textContent = left > 0 ? ctx.t('fourcut_tv', { n: left }) : ctx.t('fourcut_tv_full');
      tvBtn.disabled = left <= 0;
    }
  }
  function renderPreview() {
    if (raw.length !== 4) return;
    const m = me();
    saveBtn.disabled = true; resMsg.textContent = ctx.t('fourcut_making');
    Promise.all([ensureFonts(), needAvatar(m?.gid)]).then(ctx.guard(() => {
      const k = build();
      preview.src = k.strip.toDataURL('image/jpeg', 0.9);
      preview.dataset.w = String(k.strip.width); preview.dataset.h = String(k.strip.height);
      preview.dataset.gw = String(k.grid.width); preview.dataset.gh = String(k.grid.height);
      preview.dataset.pixel = String(pixel); preview.dataset.frame = frame;
      saveBtn.disabled = false; resMsg.textContent = '';
    }));
  }

  function save() {
    if (!made) return;
    const C = CONFIG.couple || {}, L = ctx.lang(), m = me();
    const code = m ? guestCode(m.gid) : 'guest';
    shareImage({ dataURL: made.strip.toDataURL('image/jpeg', 0.9), filename: `pixel-fourcut-${code}.jpg`, title: ctx.t('fourcut_title'), text: ctx.t('fourcut_share_text', { groom: C.groom?.[L] || '', bride: C.bride?.[L] || '' }) })
      .then(ctx.guard(r => { resMsg.textContent = r === 'shared' ? ctx.t('fourcut_shared') : r === 'downloaded' ? ctx.t('fourcut_saved') : ''; }), ctx.guard(() => { resMsg.textContent = ctx.t('fourcut_fail'); }));
  }

  function toTv() {
    const m = me();
    if (!made || !m || g.snapsLeft(m.gid) <= 0) return;
    tvBtn.disabled = true; resMsg.textContent = ctx.t('fourcut_sending');
    g.uploadSnap({ gid: m.gid, name: m.name, dataURL: jpegUnder(made.grid), caption: ctx.t('fourcut_caption') })
      .then(ctx.guard(r => { resMsg.textContent = r?.queued ? ctx.t('fourcut_queued') : ctx.t('fourcut_tv_done'); paintButtons(); }),
        ctx.guard(e => { ctx.log('upload', e?.code || e); resMsg.textContent = e?.code === 'snap-limit' ? ctx.t('fourcut_tv_full') : ctx.t('fourcut_fail'); paintButtons(); }));
  }

  g.screens.add('f-fourcut-result', {
    render: s => s.append(
      ctx.el('div', { cls: 'px-box f-fourcut-top', kids: [title2] }),
      ctx.el('div', { cls: 'f-fourcut-pframe', kids: [preview] }),
      ctx.el('div', { cls: 'f-fourcut-opts', kids: [pixelBtn, resFrames] }),
      resMsg,
      ctx.el('div', { cls: 'sticky-foot f-fourcut-rfoot', kids: [saveBtn, tvBtn, againBtn] }),
    ),
    onEnter: () => { if (raw.length !== 4) { g.go('f-fourcut'); return; } resMsg.textContent = ''; paintFrames(); paintResult(); },
  });

  // ---------------------------------------------------------------- texts · hub row
  const relabel = () => {
    title1.textContent = ctx.t('fourcut_title'); title2.textContent = ctx.t('fourcut_title');
    tip.textContent = ctx.t('fourcut_tip'); startBtn.textContent = ctx.t('fourcut_start'); albumBtn.textContent = ctx.t('fourcut_album');
    back1.textContent = ctx.t('fourcut_back');
    paintFrames(); if (g.screen() === 'f-fourcut-result') paintResult();
  };
  relabel();
  ctx.bus.on('lang', relabel);
  ctx.bus.on('couple:sprites', p => { couple = { groom: p?.groom || null, bride: p?.bride || null }; made = null; }, { replay: true });
  ctx.onCleanup(() => stopCamera());

  g.hub.add({
    key: 'f-fourcut', order: 70, size: 'row', icon: '📸', title: () => ctx.t('fourcut_row'),
    onClick: w => { who = w || null; from = w?.where === 'solo' ? 'remote' : 'done'; g.go('f-fourcut'); },
  });
}

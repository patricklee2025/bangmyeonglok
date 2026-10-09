// ============================================================
//  Guest snap uploader — shared by the guest page (done / my-space screens)
//  and the village page on phones (📷 button → bottom sheet).
//  · 📸 Take now (opens the camera directly) or 🖼 Album (pick several at once)
//  · Uploads start right away; each thumbnail shows its own status (waiting / uploading / ✓ / tap to retry)
//  · Remembers how many you've shared + tiny thumbnails on this phone (no extra Firestore reads)
// ============================================================
import { CONFIG, DEMO } from './config.js';
import { getStore } from './store.js';
import { t, getLang } from './i18n.js';

// 'snap:uploaded' (02 §5) leaves through a sink the page installs (guest.js → core/bus). A base module never imports core/ (layering test in core-units).
let sink = null;
export function setSnapSink(fn) { sink = typeof fn === 'function' ? fn : null; }
const emit = (type, payload) => { try { sink?.(type, payload); } catch (e) { console.warn('snap sink', e); } };

const KEY = gid => 'wgb_snaps_' + gid;
export function mySnaps(gid) {
  try {
    const raw = localStorage.getItem(KEY(gid));
    if (!raw) return { n: 0, th: [] };
    if (/^\d+$/.test(raw)) return { n: +raw, th: [] };        // older format (count only)
    const v = JSON.parse(raw); return { n: +v.n || 0, th: Array.isArray(v.th) ? v.th : [] };
  } catch { return { n: 0, th: [] }; }
}
function markFull(gid) { const v = mySnaps(gid); try { localStorage.setItem(KEY(gid), JSON.stringify({ n: CONFIG.snapLimitPerGuest, th: v.th })); } catch {} }
// read-modify-write so two uploaders for the same guest (done screen + village sheet) never overwrite each other
function recordUpload(gid, slot, thumb) {
  const v = mySnaps(gid); v.n = Math.min(CONFIG.snapLimitPerGuest, Math.max(v.n + 1, slot + 1)); if (thumb) v.th.push(thumb);
  try { localStorage.setItem(KEY(gid), JSON.stringify({ n: v.n, th: v.th.slice(-CONFIG.snapLimitPerGuest) })); }
  catch { try { localStorage.setItem(KEY(gid), JSON.stringify({ n: v.n, th: [] })); } catch {} }   // storage full: keep the count at least
  return v;
}

function loadImage(file) {
  return new Promise((res, rej) => {
    const img = new Image(); img.onload = () => res(img);
    img.onerror = () => { URL.revokeObjectURL(img.src); rej(Object.assign(new Error('cannot decode image'), { code: 'decode' })); };
    img.src = URL.createObjectURL(file);
  });
}
// resize + JPEG; steps quality down until it is small enough to upload quickly on venue Wi-Fi / LTE
// (≤ ~600 KB of base64; the hard Firestore document cap is 850 KB). Every canvas is released right after use:
// iOS Safari counts canvas memory per page until GC, and a page that already ran the face analysis could hit the
// limit on the 2nd or 3rd photo — getContext('2d') then returns null and the upload failed.
const SNAP_TARGET = 600000, SNAP_MAX = 850000;
const ctx2d = c => { const g = c.getContext('2d'); if (!g) throw Object.assign(new Error('canvas unavailable (memory)'), { code: 'canvas' }); return g; };
const release = (...cs) => cs.forEach(c => { if (c) { c.width = 0; c.height = 0; } });
export async function compressImage(file, maxSide, q = 0.82) {
  const img = await loadImage(file);
  let c = null, tc = null;
  try {
    let w = img.naturalWidth, h = img.naturalHeight; const k = Math.min(1, maxSide / Math.max(w, h)); w = Math.round(w * k); h = Math.round(h * k);
    c = document.createElement('canvas'); c.width = w; c.height = h; ctx2d(c).drawImage(img, 0, 0, w, h);
    let quality = q, url = c.toDataURL('image/jpeg', quality);
    while (url.length > SNAP_TARGET && quality > 0.5) { quality -= 0.08; url = c.toDataURL('image/jpeg', quality); }
    for (let scale = 0.8; url.length > SNAP_TARGET && scale > 0.2; scale -= 0.15) {   // still too big (very detailed photo): shrink until it fits
      c.width = Math.round(w * scale); c.height = Math.round(h * scale); ctx2d(c).drawImage(img, 0, 0, c.width, c.height); url = c.toDataURL('image/jpeg', 0.6);
    }
    if (!url.startsWith('data:image/jpeg') || url.length > SNAP_MAX) throw Object.assign(new Error('jpeg encode failed'), { code: 'decode' });
    tc = document.createElement('canvas'); const ts = 120 / Math.max(c.width, c.height); tc.width = Math.max(1, Math.round(c.width * ts)); tc.height = Math.max(1, Math.round(c.height * ts));
    ctx2d(tc).drawImage(c, 0, 0, tc.width, tc.height);
    return { data: url, thumb: tc.toDataURL('image/jpeg', 0.6) };
  } finally { URL.revokeObjectURL(img.src); img.removeAttribute('src'); release(c, tc); }
}

let busy = 0;
addEventListener('beforeunload', e => { if (busy > 0) { e.preventDefault(); e.returnValue = ''; } });

/** Shrink an already-encoded image (data URL) to a 120 px JPEG thumbnail; '' if it can't be decoded. */
function thumbOf(dataURL) {
  return new Promise(res => {
    const img = new Image();
    img.onload = () => {
      try {
        const k = 120 / Math.max(img.naturalWidth, img.naturalHeight, 1), c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); res(c.toDataURL('image/jpeg', 0.6));
      } catch { res(''); }
    };
    img.onerror = () => res('');
    img.src = dataURL;
  });
}

// Firestore errors that a short wait can fix (network blip, server busy) — retried twice before the photo shows "↻ retry"
const TRANSIENT = new Set(['unavailable', 'deadline-exceeded', 'aborted', 'internal', 'unknown', 'resource-exhausted', 'cancelled']);
export async function retrying(fn, waits = [1500, 4000]) {
  for (let i = 0; ; i++) {
    try { return await fn(); }
    catch (e) { if (i >= waits.length || !TRANSIENT.has(e?.code)) throw e; await new Promise(r => setTimeout(r, waits[i])); }
  }
}

/** Link that opens this guest's photos/remote on another browser or phone (kiosk hand-off QR, in-app → real browser) */
export function handoffUrl(gid, name) {
  const base = CONFIG.guestUrl || new URL('./', location.href).href;
  return base + (DEMO && new URLSearchParams(location.search).get('demo') === '1' ? '?demo=1' : '') + '#me=' + encodeURIComponent(gid) + '&n=' + encodeURIComponent(name || '');
}

/** KakaoTalk / Instagram / Facebook / LINE / NAVER in-app browsers: photo pickers there are unreliable */
export function inAppBrowser(ua = navigator.userAgent) {
  return /KAKAOTALK/i.test(ua) ? 'kakao' : /Instagram|FBAN|FBAV|FB_IAB|Line\/|NAVER\(inapp|DaumApps/i.test(ua) ? 'other' : null;
}

/**
 * uploadSnapData(gid, name, data, caption, where) — put one ready-made JPEG (data URL, ≤ 850 KB) into the next free snap slot.
 * Same bookkeeping as the uploader (this phone's count + thumbnail) and emits 'snap:uploaded'.
 * Rejects with e.code 'snap-limit' when all slots are used, or 'decode' when `data` is not a usable JPEG.
 * v4 features reach this through ctx.guest.uploadSnap (WP-00c).
 */
export async function uploadSnapData(gid, name, data, caption = '', where = 'feature') {
  if (typeof data !== 'string' || !data.startsWith('data:image/jpeg') || data.length > 850000) throw Object.assign(new Error('not a jpeg data URL (≤ 850 KB)'), { code: 'decode' });
  const n = mySnaps(gid).n;
  if (n >= CONFIG.snapLimitPerGuest) throw Object.assign(new Error('snap limit reached'), { code: 'snap-limit' });
  busy++;
  try {
    const store = await getStore();
    const cap = String(caption || '').slice(0, 60);
    const res = await retrying(() => store.addSnap(gid, name, data, cap, n));
    const slot = res?.slot ?? n;
    recordUpload(gid, slot, await thumbOf(data));
    if (res?.queued && res.done) { busy++; res.done.catch(() => {}).finally(() => { busy--; }); }   // keep the page alive until the slow write lands
    emit('snap:uploaded', { gid, slot, caption: cap, queued: !!res?.queued, where });
    return { slot, queued: !!res?.queued };
  } catch (e) {
    if (e?.code === 'snap-limit') markFull(gid);
    throw e;
  } finally { busy--; }
}

/**
 * mountSnapUploader(box, { gid, name, onUploaded, where })
 * onUploaded({ data, caption }) fires after each successful upload (the village page shows it right away).
 * where: 'done' | 'solo' | 'village' | 'feature' — reported in the 'snap:uploaded' event (default 'village': its only caller that omits it).
 */
export function mountSnapUploader(box, { gid, name, onUploaded, where = 'village' } = {}) {
  if (!box) return;
  box.innerHTML = '';
  const max = CONFIG.snapLimitPerGuest;
  const shown = mySnaps(gid);
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };

  const h = el('h3', null, t('snap_title'));
  const p = el('p', 'tip', t('snap_sub'));
  const acts = el('div', 'snap-actions');
  // A brand-new <input> after every pick: some phone browsers and in-app WebViews (KakaoTalk …) never fire "change"
  // again on an input that has already delivered a file, even after value = '' — the 2nd photo silently went nowhere.
  const mkPick = (cls, label, opts) => {
    const lbl = el('label', 'px-btn ' + cls); lbl.tabIndex = 0;
    const fresh = () => {
      const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.hidden = true;
      if (opts.multiple) inp.multiple = true;
      if (opts.capture) inp.setAttribute('capture', opts.capture);
      inp.addEventListener('change', () => {
        const files = [...(inp.files || [])];
        inp.replaceWith(fresh());
        if (files.length) add(files);
      }, { once: true });
      return inp;
    };
    lbl.append(label, fresh());
    lbl.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); lbl.querySelector('input')?.click(); } });
    return lbl;
  };
  const shoot = mkPick('', t('snap_shoot'), { capture: 'environment' });
  const album = mkPick('blue', t('snap_album'), { multiple: true });
  acts.append(shoot, album);
  const cap = el('input', 'input snap-cap'); cap.maxLength = 60; cap.placeholder = t('snap_caption_ph'); cap.enterKeyHint = 'done';
  const status = el('p', 'snap-status');
  const grid = el('div', 'snap-thumbs');
  box.append(h, p, acts, cap, status, grid);
  // in-app browsers: say so up front, and on KakaoTalk offer its "open in the phone's browser" link (keeps who you are via #me=)
  const iab = inAppBrowser();
  if (iab) {
    const w = el('p', 'tip snap-inapp', t(iab === 'kakao' ? 'snap_inapp' : 'snap_inapp_other'));
    if (iab === 'kakao') {
      const a = el('a', 'px-btn small secondary', t('snap_inapp_open'));
      a.href = 'kakaotalk://web/openExternal?url=' + encodeURIComponent(handoffUrl(gid, name));
      w.append(a);
    }
    p.after(w);
  }

  // previously shared from this phone
  shown.th.forEach(src => grid.append(item(src, 'ok').node));

  const queue = []; let running = false, inflight = 0;
  const done = () => mySnaps(gid).n;
  const left = () => max - done() - inflight;
  function refresh(note) {
    const l = left(), n = done();
    status.textContent = note || (l > 0 ? (n ? t('snap_count').replace('{n}', n).replace('{max}', max) + ' · ' : '') + `${l}${getLang() === 'ko' ? '' : ' '}${t('snap_left')}` : t('snap_full'));
    acts.hidden = l <= 0; cap.hidden = l <= 0;
  }
  function item(src, state) {
    const node = el('div', 'snap-item'); const img = el('img'); img.alt = ''; img.src = src; const st = el('b', 'st');
    node.append(img, st);
    const set = (s, label) => { node.dataset.s = s; st.textContent = label ?? { wait: '⏳', up: '', ok: '✓', err: '↻ ' + t('snap_retry'), queued: '☁', bad: t('snap_bad') }[s]; };
    set(state);
    return { node, set };
  }
  function add(files) {
    const all = files.length;
    files = files.filter(f => /^image\//.test(f.type) || /\.(jpe?g|png|heic|heif|webp|gif)$/i.test(f.name) || (!f.type && !/\.[a-z0-9]{2,5}$/i.test(f.name)));
    if (!files.length) { if (all) refresh(t('snap_skipped')); return; }
    const room = left(); const take = files.slice(0, Math.max(0, room));
    take.forEach(f => {
      const it = item(URL.createObjectURL(f), 'wait'); grid.prepend(it.node);
      const job = { f, it, caption: cap.value.trim().slice(0, 60) };
      it.node.addEventListener('click', () => { if (it.node.dataset.s === 'err' && left() > 0) { inflight++; it.set('wait'); queue.push(job); refresh(); run(); } });
      inflight++; queue.push(job);
    });
    cap.value = '';
    refresh(files.length > take.length ? t('snap_limit_note').replace('{max}', max) : null);
    run();
  }
  async function run() {
    if (running) return; running = true; busy++;
    try {
      let store = null;
      while (queue.length) {
        const job = queue.shift(); job.it.set('up');
        try {
          store = store || await getStore();
          const out = job.out || (job.out = await compressImage(job.f, CONFIG.snapMaxSide));
          const res = await retrying(() => store.addSnap(gid, name, out.data, job.caption, done()));
          const slot = res?.slot ?? done();
          recordUpload(gid, slot, out.thumb);
          const img = job.it.node.querySelector('img'); URL.revokeObjectURL(img.src); img.src = out.thumb;
          job.it.set(res?.queued ? 'queued' : 'ok');
          if (res?.queued && res.done) { busy++; res.done.then(() => job.it.set('ok'), () => job.it.set('err')).finally(() => { busy--; }); }
          emit('snap:uploaded', { gid, slot, caption: job.caption, queued: !!res?.queued, where });   // before onUploaded: a throwing callback must not hide a successful upload
          onUploaded?.({ data: out.data, caption: job.caption, name, gid });
        } catch (e) {
          console.warn('snap upload', e);
          job.it.node.dataset.err = String(e?.code || e?.name || 'error').slice(0, 40);   // visible in the DOM for field debugging
          if (e.code === 'decode') { job.it.set('bad'); URL.revokeObjectURL(job.it.node.querySelector('img').src); }   // retrying can't help
          else if (e.code === 'snap-limit') { job.it.set('bad', '—'); markFull(gid); }   // all slots already used (e.g. from another phone)
          else job.it.set('err');
        }
        inflight--; refresh();
      }
    } finally {
      running = false; busy--;
      for (const job of queue.splice(0)) { job.it.set('err'); inflight--; }
    }
    const errs = grid.querySelectorAll('.snap-item[data-s=err]').length;
    refresh(errs ? t('snap_failed') : (grid.querySelector('.snap-item[data-s=queued]') ? t('snap_queued') : (done() ? t('snap_done') : null)));
    if (!errs) setTimeout(() => { if (!running) refresh(); }, 5000);
  }
  refresh();
  return { focus: () => (left() > 0 ? album : null)?.focus() };
}

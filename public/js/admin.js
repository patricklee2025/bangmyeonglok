// ============================================================
//  Admin (couple only): view / edit / hide / delete, bulk delete,
//  TV events (bouquet, group photo, fireworks), CSV / ZIP / print
// ============================================================
import { CONFIG, DEMO } from './config.js';
import { getStore, capsuleOpenAt, safeData } from './store.js';
import { computeReport, renderReport, reportPNG } from './report.js';
import { getSprite, drawPreview, normalizeAvatar, SPRITE_W, SPRITE_H, SKIN, HAIR, COLORS, HAIR_STYLES, FACES, EYES, BROWS, MOUTHS, BEARDS, GLASSES, OUTFITS, ACCESSORIES } from './avatar.js';
// v4 (WP-00c §4): feature loader · settings · phase · manifest — everything feature-related lives in "v4 extension points" further down
import { emit, on as busOn, last as busLast } from './core/bus.js';
import { bootFeatures, featureStates, resolveEnabled } from './core/features.js';
import { getSettings, getLive, normalizeSettings, setFeature, setSafe, setPhaseOverride, saveCfg, setLive } from './core/settings.js';
import { docdb, ts } from './core/docdb.js';
import { currentPhase } from './core/phase.js';
import { FEATURES } from './features/index.js';
import { applyI18n, getLang } from './i18n.js';

const $ = s => document.querySelector(s);
const SIDE = { groom: '신랑측', bride: '신부측', both: '둘 다' };
const ACT = { walk: '🚶 산책', dance: '💃 댄스', fish: '🎣 낚시', chat: '💬 수다', eat: '🍰 먹방', photo: '📷 사진사' };
let store, guests = [], filter = 'all', query = '';
const photoCache = new Map(), selectedIds = new Set();
let snaps = [], tab = 'guests', pulseCounts = {};

const fmt = ms => new Date(ms).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
$('#print-title').textContent = `${CONFIG.couple.groom.ko} ♥ ${CONFIG.couple.bride.ko} 방명록 ${CONFIG.couple.date}`;

function avatarCanvas(av, scale = 1) {
  const c = document.createElement('canvas'); c.width = SPRITE_W * scale; c.height = SPRITE_H * scale;
  const g = c.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(getSprite(av).idle, 0, 0, c.width, c.height);
  return c;
}
const visible = () => {
  const q = query.trim().toLowerCase();
  return guests.filter(g => {
    if (filter === 'hidden' ? !g.hidden : filter !== 'all' && g.side !== filter) return false;
    return !q || g.name.toLowerCase().includes(q) || g.message.toLowerCase().includes(q) || (g.priv && (noteText.get(g.id) || '').toLowerCase().includes(q));
  }).slice().reverse();
};

// Live updates arrive every few seconds on the day. Don't rebuild the grid under the couple's fingers:
// wait while a voice message is playing or a delete button is armed, then catch up.
let renderPending = false;
const gridBusy = () => !!$('#grid [data-armed]') || [...document.querySelectorAll('#grid audio')].some(a => !a.paused && !a.ended);
function flushRender() { if (renderPending && !gridBusy()) { renderPending = false; render(); } }
setInterval(flushRender, 1500);
function render() {
  if (gridBusy()) { renderPending = true; return; }
  renderPending = false;
  const total = guests.length, vis = guests.filter(g => !g.hidden);
  $('#stats').innerHTML = '';
  [['전체', total], ['신랑측', vis.filter(g => g.side === 'groom').length], ['신부측', vis.filter(g => g.side === 'bride').length],
   ['둘 다', vis.filter(g => g.side === 'both').length], ['사진', guests.filter(g => g.hasPhoto).length], ['숨김', total - vis.length]]
    .forEach(([k, v]) => { const d = document.createElement('div'); d.className = 'stat'; const b = document.createElement('b'); b.textContent = v; d.append(b, k); $('#stats').append(d); });

  for (const id of [...selectedIds]) if (!guests.some(g => g.id === id)) selectedIds.delete(id);
  const list = visible();
  const grid = $('#grid'); grid.innerHTML = '';
  if (!list.length) { grid.innerHTML = '<div class="empty-state">아직 방명록이 없어요.</div>'; updateSel(); return; }
  for (const g of list) {
    const card = document.createElement('article'); card.className = 'gcard' + (g.hidden ? ' hidden' : '') + (selectedIds.has(g.id) ? ' sel' : '');
    const top = document.createElement('div'); top.className = 'top';
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.className = 'pick'; cb.checked = selectedIds.has(g.id); cb.setAttribute('aria-label', g.name + ' 선택');
    cb.addEventListener('change', () => { cb.checked ? selectedIds.add(g.id) : selectedIds.delete(g.id); card.classList.toggle('sel', cb.checked); updateSel(); });
    top.append(cb, avatarCanvas(g.avatar));
    const info = document.createElement('div');
    const nm = document.createElement('div'); nm.className = 'nm'; nm.textContent = g.name;
    const meta = document.createElement('div'); meta.className = 'meta'; meta.textContent = `${SIDE[g.side]} · ${ACT[g.activity] || ''} · ${fmt(g.createdAt)}${g.hidden ? ' · 숨김' : ''}`;
    info.append(nm, meta); top.append(info);
    const msg = document.createElement('div'); msg.className = 'msg'; msg.textContent = g.message;
    if (g.priv) {   // v4: the text only the couple may read — never on the TV or the guestbook wall
      msg.classList.add('priv'); const lock = document.createElement('b'); lock.className = 'privtag'; lock.textContent = '🔒 신랑·신부에게만';
      const body = document.createElement('span'); body.textContent = noteText.get(g.id) ?? '불러오는 중…';
      msg.replaceChildren(lock, ' ', body);
      if (!noteText.has(g.id)) getNote(g.id).then(t => { body.textContent = t ?? '(메시지를 불러오지 못했어요)'; });
    }
    card.append(top, msg);
    if (g.hasPhoto) { const img = document.createElement('img'); img.className = 'photo'; img.alt = `${g.name} 사진`; img.loading = 'lazy'; card.append(img); lazyPhoto(img, g.id); }
    else { const np = document.createElement('div'); np.className = 'nophoto'; np.textContent = '사진 없음'; card.append(np); }
    if (g.hasVoice) {
      const vb = document.createElement('div'); vb.className = 'voicebox';
      const play = btn('🎤 음성 메시지 듣기', 'blue', async () => {
        play.disabled = true; play.textContent = '불러오는 중...';
        const v = await getVoice(g.id); if (!v) { play.textContent = '없음'; return; }
        const au = document.createElement('audio'); au.controls = true; au.src = v.data; au.preload = 'auto';
        au.addEventListener('pause', () => setTimeout(flushRender, 300)); au.addEventListener('ended', flushRender);
        vb.replaceChildren(au); au.play().catch(() => {});
      });
      vb.append(play); card.append(vb);
    }
    if (g.hasCapsule) { const cp = document.createElement('div'); cp.className = 'capbadge'; cp.textContent = `💌 타임캡슐 · ${CONFIG.capsuleOpen} 공개`; card.append(cp); }
    const acts = document.createElement('div'); acts.className = 'acts';
    acts.append(btn('✏️ 수정', 'secondary', () => openEdit(g)));
    acts.append(btn(g.hidden ? '마을에 다시 보이기' : '마을에서 숨기기', 'secondary', () => store.setHidden(g.id, !g.hidden).catch(e => alertMsg('실패: ' + e.message))));
    const del = btn('삭제', 'secondary', () => {
      if (del.dataset.armed) { clearTimeout(del._armT); delete del.dataset.armed; del.disabled = true; store.deleteGuest(g.id).catch(e => alertMsg('삭제 실패: ' + e.message)).finally(flushRender); return; }
      arm(del, '정말 삭제할까요?', '삭제');
    });
    acts.append(del);
    if (g.hasPhoto) acts.append(btn('사진 저장', 'secondary', async () => download(`${safe(g.name)}.jpg`, await getPhoto(g.id))));
    if (g.hasVoice) acts.append(btn('음성 저장', 'secondary', async () => { const v = await getVoice(g.id); if (v) download(`${safe(g.name)}.${extOf(v.mime)}`, v.data); }));
    card.append(acts);
    grid.append(card);
  }
  updateSel();
}
function arm(b, armedText, normal) {
  clearTimeout(b._armT);
  b.dataset.armed = '1'; b.textContent = armedText; b.style.setProperty('--bg', '#c8433f'); b.style.color = '#fff';
  b._armT = setTimeout(() => { delete b.dataset.armed; delete b._ids; b.textContent = normal; b.style.removeProperty('--bg'); b.style.color = ''; updateSel(); flushRender(); }, 4000);
}
function updateSel() {
  const n = selectedIds.size, b = $('#btn-del-sel');
  b.disabled = !n; if (!b.dataset.armed) b.textContent = n ? `선택 삭제 (${n})` : '선택 삭제';
  const vis = visible(); $('#sel-all').checked = vis.length > 0 && vis.every(g => selectedIds.has(g.id));
}
$('#sel-all').addEventListener('change', e => { visible().forEach(g => e.target.checked ? selectedIds.add(g.id) : selectedIds.delete(g.id)); render(); });
$('#btn-del-sel').addEventListener('click', async () => {
  const b = $('#btn-del-sel'), n = selectedIds.size; if (!n) return;
  // the confirmation names a number — delete exactly those ids, even if the selection changes before the 2nd click
  if (!b.dataset.armed) { b._ids = [...selectedIds]; arm(b, `정말 ${n}개 삭제할까요?`, `선택 삭제 (${n})`); return; }
  const ids = b._ids || [...selectedIds];
  clearTimeout(b._armT); delete b.dataset.armed; delete b._ids; b.disabled = true; b.textContent = '삭제 중...';
  try { await store.deleteMany(ids); ids.forEach(id => selectedIds.delete(id)); } catch (e) { alertMsg('삭제 실패: ' + e.message); }
  render();
});
// v4: "only for the couple" messages live in the admin-only notes/{id} (one read per such guest, cached)
const noteCache = new Map(), noteText = new Map();   // id -> promise · id -> text (for search and the CSV)
function getNote(id) {
  if (!noteCache.has(id)) noteCache.set(id, store.getNote(id).then(t => { if (t != null) noteText.set(id, t); return t; }).catch(e => { console.warn(e); noteCache.delete(id); return null; }));
  return noteCache.get(id);
}
const ensureNotes = () => Promise.all(guests.filter(g => g.priv).map(g => getNote(g.id)));
const voiceCache = new Map();   // id -> promise (one download per voice, even while re-rendering)
function getVoice(id) {
  if (!voiceCache.has(id)) voiceCache.set(id, store.getVoice(id).catch(e => { console.warn(e); voiceCache.delete(id); return null; }));
  return voiceCache.get(id);
}
const extOf = mime => /mp4|aac|m4a/.test(mime) ? 'm4a' : /ogg/.test(mime) ? 'ogg' : 'webm';

// ---------- tabs (v4: a registry — the core tabs register right here, feature tabs through ctx.admin.tabs.add) ----------
// Buttons keep their data-tab, sections their #tab-<key> id. What used to be the hard-coded click handler is now each tab's onShow.
const tabReg = new Map();   // key → { key, label, order, btn, section, onShow, onHide, core }
const tabLabel = t => { try { return String(typeof t.label === 'function' ? t.label() : t.label ?? ''); } catch { return ''; } };
function showTab(key) {
  const t = tabReg.get(key); if (!t) return;
  const prev = tabReg.get(tab);
  if (prev && prev !== t) prev.onHide?.();
  tab = key;
  for (const x of tabReg.values()) { x.btn.setAttribute('aria-selected', x === t); x.section.hidden = x !== t; }
  emit('admin:tab', { key });
  t.onShow?.();
}
$('#atabs').addEventListener('click', e => { const b = e.target.closest('button[data-tab]'); if (b) showTab(b.dataset.tab); });
[['guests', 10, null], ['snaps', 20, () => { ensureSnaps(); renderSnaps(); }], ['capsules', 30, () => renderCapsules()],
 ['report', 40, () => { ensureSnaps(); refreshReport(true); }], ['settings', 90, () => paintSettings()]]
  .forEach(([key, order, onShow]) => {
    const btn = $(`#atabs button[data-tab="${key}"]`); btn.dataset.order = String(order);
    tabReg.set(key, { key, label: null, order, btn, section: $('#tab-' + key), onShow, onHide: null, core: true });
  });
let snapsReady = null, unsubSnaps = null;
function ensureSnaps() {
  if (!snapsReady) snapsReady = new Promise(res => {
    let first = true;
    unsubSnaps = store.subscribeSnaps(list => { snaps = list; renderSnaps(); refreshReport(); if (first) { first = false; res(); } });
  });
  return snapsReady;
}
const nameOf = sn => guests.find(g => g.id === sn.gid)?.name || sn.name;   // the guest's current name (edits apply)

// ---------- snaps ----------
function renderSnaps() {
  const vis = snaps.filter(s => !s.hidden).length;
  $('#snap-n').textContent = snaps.length ? `(${snaps.length})` : '';
  $('#snap-info').textContent = `총 ${snaps.length}장 · TV 표시 ${vis}장${CONFIG.snapApproval ? ' · 승인제: 숨김을 해제하면 TV에 나와요' : ''}`;
  if (tab !== 'snaps') return;
  if ($('#snapgrid [data-armed]')) { setTimeout(renderSnaps, 1500); return; }
  const grid = $('#snapgrid'); grid.innerHTML = '';
  if (!snaps.length) { grid.innerHTML = '<div class="empty-state">아직 하객 스냅이 없어요.</div>'; return; }
  snaps.slice().reverse().forEach(sn => {
    const card = document.createElement('article'); card.className = 'gcard snapcard' + (sn.hidden ? ' hidden' : '');
    const img = document.createElement('img'); img.className = 'photo'; if (sn.data) img.src = sn.data; img.alt = sn.caption || nameOf(sn); img.loading = 'lazy';
    const meta = document.createElement('div'); meta.className = 'meta'; meta.textContent = `${nameOf(sn)} · ${fmt(sn.createdAt)}${sn.hidden ? ' · 숨김' : ''}${guests.some(g => g.id === sn.gid) ? '' : ' · (삭제된 하객)'}`;
    const cap = document.createElement('div'); cap.className = 'msg'; cap.textContent = sn.caption || '';
    const acts = document.createElement('div'); acts.className = 'acts';
    acts.append(btn(sn.hidden ? (CONFIG.snapApproval ? '✅ 승인(TV에 표시)' : 'TV에 다시 보이기') : 'TV에서 숨기기', 'secondary', () => store.setSnapHidden(sn.id, !sn.hidden).catch(e => alertMsg('실패: ' + e.message))));
    const del = btn('삭제', 'secondary', () => { if (del.dataset.armed) { clearTimeout(del._armT); delete del.dataset.armed; store.deleteSnap(sn.id).catch(e => alertMsg('삭제 실패: ' + e.message)); return; } arm(del, '정말 삭제?', '삭제'); });
    acts.append(del, btn('저장', 'secondary', () => download(`snap_${safe(nameOf(sn))}_${sn.id}.jpg`, sn.data)));
    card.append(img, meta, cap, acts); grid.append(card);
  });
}
const addB64 = (zip, path, dataUrl) => { const d = safeData(dataUrl) || safeData(dataUrl, 'audio'); if (!d) return false; try { zip.file(path, d.slice(d.indexOf(',') + 1), { base64: true }); return true; } catch (e) { console.warn('zip', path, e); return false; } };
$('#btn-snap-zip').addEventListener('click', async () => {
  const b = $('#btn-snap-zip'); if (b.disabled) return;
  b.disabled = true; const label = b.textContent; b.textContent = '압축 중...';
  try {
    await ensureSnaps();
    const zip = new window.JSZip();
    snaps.forEach((sn, i) => addB64(zip, `snaps/${String(i + 1).padStart(3, '0')}_${safe(nameOf(sn))}.jpg`, sn.data));
    downloadBlob('wedding-snaps.zip', await zip.generateAsync({ type: 'blob' }));
  } catch (e) { alertMsg('스냅 압축 실패: ' + e.message); }
  finally { b.disabled = false; b.textContent = label; }
});

// ---------- capsules ----------
async function renderCapsules() {
  const box = $('#capsule-panel'), n = guests.filter(g => g.hasCapsule).length;
  box.innerHTML = '<p class="tip">불러오는 중...</p>';
  let res; try { res = await store.getCapsules(); } catch (e) { box.textContent = '불러오기 실패: ' + e.message; return; }
  if (res.locked) {
    const days = Math.ceil((capsuleOpenAt() - Date.now()) / 86400e3);
    box.innerHTML = `<div class="locked"><div class="lock">🔒</div><h2>타임캡슐 ${n}통이 잠겨 있어요</h2><p>결혼 1주년 <b>${CONFIG.capsuleOpen}</b>에 열려요 · <b>D-${days}</b></p><p class="tip">서버 보안 규칙이 날짜를 확인하기 때문에 관리자도 그 전에는 읽을 수 없어요.</p></div>`;
    return;
  }
  box.innerHTML = `<h2>💌 1년 전 하객들이 보낸 편지 (${res.list.length}통)</h2>`;
  const wrap = document.createElement('div'); wrap.className = 'grid';
  res.list.sort((a, b) => a.createdAt - b.createdAt).forEach(c => {
    const g = guests.find(x => x.id === c.id);
    const card = document.createElement('article'); card.className = 'gcard letter';
    const top = document.createElement('div'); top.className = 'top'; if (g) top.append(avatarCanvas(g.avatar));
    const nm = document.createElement('div'); nm.className = 'nm'; nm.textContent = c.name || g?.name || ''; top.append(nm);
    const msg = document.createElement('div'); msg.className = 'msg'; msg.textContent = c.text;
    card.append(top, msg); wrap.append(card);
  });
  box.append(wrap);
}

// ---------- report ----------
let reportT = null, pulseAt = 0;
async function refreshReport(force) {
  if (tab !== 'report' && !force) return;
  clearTimeout(reportT);
  reportT = setTimeout(async () => {
    // remote-tap counts are a full collection read: at most once a minute (or when the tab is opened)
    if (force || Date.now() - pulseAt > 60000) { try { pulseCounts = await store.getPulseCounts(); pulseAt = Date.now(); } catch { /* keep the last counts */ } }
    renderReport($('#report'), computeReport(guests, snaps, pulseCounts));
  }, force ? 0 : 800);
}
$('#btn-report-png').addEventListener('click', async () => { await ensureSnaps(); download(`wedding-report-${CONFIG.couple.date || 'day'}.png`, reportPNG(computeReport(guests, snaps, pulseCounts))); });

function btn(label, cls, fn) { const b = document.createElement('button'); b.className = 'px-btn small ' + cls; b.textContent = label; b.addEventListener('click', fn); return b; }
const safe = s => Array.from(String(s).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/^\.+/, '_')).slice(0, 40).join('') || 'guest';
function alertMsg(m) { $('#zip-status').textContent = m; }

// ---------- edit dialog ----------
const AV_FIELDS = [
  ['skin', '피부', SKIN, 'color'], ['hair', '머리색', HAIR, 'color'], ['hairStyle', '헤어', ['photo', ...HAIR_STYLES]], ['face', '얼굴형', FACES], ['eyes', '눈', EYES],
  ['mouth', '입', MOUTHS], ['brows', '눈썹', BROWS], ['beard', '수염', BEARDS], ['glasses', '안경', GLASSES], ['outfit', '옷', OUTFITS], ['color', '옷 색', COLORS, 'color'], ['acc', '소품', ACCESSORIES],
];
let editing = null, editAv = null;
function openEdit(g) {
  editing = g; editAv = { ...g.avatar }; $('#edit').returnValue = '';   // Esc must never reuse the previous "save"

  $('#e-name').value = g.name; $('#e-side').value = g.side; $('#e-act').value = g.activity || 'walk'; $('#e-msg').value = g.priv ? (noteText.get(g.id) ?? '') : g.message; $('#e-err').textContent = '';
  $('#e-msg').disabled = !!g.priv; $('#e-msg').title = g.priv ? '신랑·신부에게만 남긴 메시지는 하객이 쓴 그대로 둡니다 (수정 불가)' : '';
  const box = $('#edit-avatar'); box.innerHTML = '';
  AV_FIELDS.forEach(([key, label, list, kind]) => {
    if (key === 'hairStyle' && !editAv.hp) list = list.filter(v => v !== 'photo');
    const l = document.createElement('label'); l.className = 'mini'; l.textContent = label;
    const s = document.createElement('select'); s.className = 'input';
    list.forEach((v, i) => { const o = document.createElement('option'); o.value = kind === 'color' ? String(i) : v; o.textContent = kind === 'color' ? `● ${i + 1}` : v; if (kind === 'color') o.style.color = v; s.append(o); });
    if (kind === 'color' && typeof editAv[key] === 'string') { const o = document.createElement('option'); o.value = editAv[key]; o.textContent = '● 사진 색'; o.style.color = editAv[key]; s.prepend(o); }
    s.value = String(editAv[key] ?? '');
    s.addEventListener('change', () => { editAv[key] = kind === 'color' ? (s.value.startsWith('#') ? s.value : Number(s.value)) : s.value; drawPreview($('#edit-preview'), normalizeAvatar(editAv)); });
    l.append(s); box.append(l);
  });
  drawPreview($('#edit-preview'), normalizeAvatar(editAv));
  $('#edit').showModal();
}
$('#edit-form').addEventListener('submit', e => {
  if (e.submitter?.value === 'save' && !$('#e-name').value.trim()) { e.preventDefault(); $('#e-err').textContent = '이름을 입력해주세요'; }
});
$('#edit').addEventListener('close', async () => {
  const g = editing, av = editAv; editing = null;
  if ($('#edit').returnValue !== 'save' || !g) return;
  const name = $('#e-name').value.trim().slice(0, 30), message = $('#e-msg').value.trim().slice(0, 300);
  if (!name) return;
  try { await store.updateGuest(g.id, { name, side: $('#e-side').value, ...(g.priv ? {} : { message }), activity: $('#e-act').value, avatar: normalizeAvatar(av) }); }
  catch (e) { alertMsg('수정 실패: ' + e.message + ' (firestore.rules 를 최신 버전으로 게시했는지 확인하세요)'); }
});

// ---------- events ----------
document.querySelectorAll('[data-ev]').forEach(b => b.addEventListener('click', async () => {
  const st = $('#ev-status');
  try { await store.sendEvent(b.dataset.ev); st.textContent = `✅ "${b.textContent}" TV로 보냈어요 (${new Date().toLocaleTimeString('ko-KR')})`; }
  catch (e) { st.textContent = '실패: ' + e.message + ' (firestore.rules 최신 버전 게시 필요)'; }
}));

// ---------- photos / export ----------
const io = new IntersectionObserver(entries => entries.forEach(async e => {
  if (!e.isIntersecting) return; io.unobserve(e.target);
  if (!e.target.isConnected) return;
  const url = await getPhoto(e.target.dataset.id); if (url) e.target.src = url;
}), { rootMargin: '400px' });
function lazyPhoto(img, id) { img.dataset.id = id; if (photoDone.has(id)) img.src = photoDone.get(id); else io.observe(img); }
const photoDone = new Map();   // id -> data url (resolved)
function getPhoto(id) {          // photoCache: id -> promise, so a photo is downloaded once even if the grid re-renders
  if (!photoCache.has(id)) photoCache.set(id, store.getPhoto(id).then(d => { if (d) photoDone.set(id, d); return d; }, e => { console.warn(e); photoCache.delete(id); return null; }));
  return photoCache.get(id);
}
// only base64 data: URLs (validated) or our own blob: URLs are ever opened/downloaded
function download(name, href) {
  if (!href || !(href.startsWith('blob:') || safeData(href) || safeData(href, 'audio'))) return;
  const a = document.createElement('a'); a.download = name; a.href = href; a.click();
}
function downloadBlob(name, blob) { const u = URL.createObjectURL(blob); download(name, u); setTimeout(() => URL.revokeObjectURL(u), 60000); }
function csv() {
  // quotes for commas/newlines; a leading ' stops Excel from treating =, +, -, @ as a formula
  const esc = v => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; };
  const msgOf = g => g.priv ? '[신랑·신부에게만] ' + (noteText.get(g.id) ?? '') : g.message;   // call ensureNotes() first
  const rows = [['시간', '이름', '구분', '활동', '메시지', '사진', '숨김'], ...guests.map(g => [new Date(g.createdAt).toLocaleString('ko-KR'), g.name, SIDE[g.side], ACT[g.activity] || '', msgOf(g), g.hasPhoto ? 'Y' : '', g.hidden ? 'Y' : ''])];
  return '﻿' + rows.map(r => r.map(esc).join(',')).join('\r\n');
}
$('#btn-csv').addEventListener('click', async () => { await ensureNotes(); downloadBlob('guestbook.csv', new Blob([csv()], { type: 'text/csv;charset=utf-8' })); });
// print: load every visible photo first (they are lazy-loaded while scrolling), then print
$('#btn-print').addEventListener('click', async () => {
  const b = $('#btn-print'), label = b.textContent; b.disabled = true;
  try {
    const need = visible().filter(g => g.hasPhoto && !photoDone.has(g.id));
    let k = 0;
    await Promise.all(need.map(g => getPhoto(g.id).then(() => { b.textContent = `사진 불러오는 중 ${++k}/${need.length}`; })));
    document.querySelectorAll('#grid img.photo').forEach(img => { const d = photoDone.get(img.dataset.id); if (d && img.src !== d) img.src = d; });
    await Promise.all([...document.querySelectorAll('#grid img.photo')].map(img => img.decode?.().catch(() => {})));
  } finally { b.disabled = false; b.textContent = label; }
  print();
});
$('#btn-zip').addEventListener('click', async () => {
  const b = $('#btn-zip'), st = $('#zip-status'); if (b.disabled) return;
  b.disabled = true; const missing = [];
  try {
    const zip = new window.JSZip();
    await ensureNotes();
    zip.file('guestbook.csv', csv()); zip.file('guestbook.json', JSON.stringify(guests.map(g => g.priv ? { ...g, privateMessage: noteText.get(g.id) ?? null } : g), null, 2));
    let i = 0;
    for (const g of guests) {
      i++; st.textContent = `백업 준비 중 ${i}/${guests.length}`;
      const base = `${String(i).padStart(3, '0')}_${safe(g.name)}`;
      addB64(zip, `avatars/${base}.png`, avatarCanvas(g.avatar, 8).toDataURL('image/png'));
      if (g.hasPhoto && !addB64(zip, `photos/${base}.jpg`, await getPhoto(g.id))) missing.push(`사진: ${g.name}`);
      if (g.hasVoice) { const v = await getVoice(g.id); if (!v || !addB64(zip, `voices/${base}.${extOf(v.mime)}`, v.data)) missing.push(`음성: ${g.name}`); }
    }
    st.textContent = '스냅 불러오는 중...'; await ensureSnaps();
    snaps.forEach((sn, k) => addB64(zip, `snaps/${String(k + 1).padStart(3, '0')}_${safe(nameOf(sn))}.jpg`, sn.data));
    try {
      const cap = await store.getCapsules();
      if (!cap.locked) zip.file('time-capsule.json', JSON.stringify(cap.list, null, 2));
      else zip.file('time-capsule-README.txt', `타임캡슐은 ${CONFIG.capsuleOpen}에 열립니다. 그 이후에 백업을 다시 받으면 포함됩니다.`);
    } catch (e) { missing.push('타임캡슐: ' + e.message); }
    try { pulseCounts = await store.getPulseCounts(); pulseAt = Date.now(); } catch {}
    try { addB64(zip, 'report.png', reportPNG(computeReport(guests, snaps, pulseCounts))); } catch (e) { missing.push('리포트 이미지'); }
    // v4 (WP-00c §4.4): the app settings + one backup part per feature that registered one — a failing part only lands in MISSING.txt
    try { zip.file('app/settings.json', JSON.stringify(getSettings(), null, 2)); zip.file('app/live.json', JSON.stringify(getLive(), null, 2)); } catch (e) { missing.push('앱 설정: ' + e.message); }
    await runBackupParts(zip, missing, st);
    if (missing.length) zip.file('MISSING.txt', '백업에 포함하지 못한 항목 (다시 시도해보세요):\n' + missing.join('\n'));
    st.textContent = '압축 중...';
    downloadBlob('wedding-guestbook-backup.zip', await zip.generateAsync({ type: 'blob' }));
    st.textContent = missing.length ? `완료 (빠진 항목 ${missing.length}개 · MISSING.txt 참고)` : '완료!';
  } catch (e) { console.error(e); st.textContent = '백업 실패: ' + e.message; }
  finally { b.disabled = false; }
});
$('#q').addEventListener('input', e => { query = e.target.value; render(); });
document.querySelectorAll('#filter button').forEach(b => b.addEventListener('click', () => {
  filter = b.dataset.v; document.querySelectorAll('#filter button').forEach(x => x.setAttribute('aria-pressed', x === b)); render();
}));

// ============================================================
//  v4 extension points (WP-00c §4) — the only way features touch this page. docs/v4/02-contracts.md §8
//  With every feature off: #live-slot stays empty, the ⚙️ tab lists the features (all switched off), nothing else changes.
// ============================================================
const noop = () => {};
const coded = (code, msg) => Object.assign(new Error(msg), { code });
const mk = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
const PHASE_KO = { pre: '결혼 전', live: '본식 당일', after: '결혼 후', anniversary: '1주년' };
const NO_URL = Object.freeze({ all: false, none: false, on: new Set(), off: new Set() });   // guests' own ?ff= is theirs — the table shows what the settings alone decide
let adminUser = null, settingsBuilt = false, pendingPhase = null;
const settingsSeen = { settings: false, live: false };       // the toggles stay disabled until the first real (or 2 s default) value arrived
const backupParts = new Set();                               // ctx.admin.backup.add → { id, name, fn, report }
const featBoxes = new Map();                                 // feature id → Set<{ box, scope }> (ctx.admin.settings.add)
const rowsById = new Map();                                  // feature id → the ⚙️ row's parts (switch, words, settings box)

// ---- live panel: 🤫 quiet mode · 🛡 safe mode (+ #live-slot for features) ----
const toggleText = (b, label, on) => { b.setAttribute('aria-pressed', String(!!on)); b.textContent = label ? `${label}: ${on ? '켜짐' : '꺼짐'}` : (on ? '켜짐' : '꺼짐'); };
function paintLive() {
  const s = getSettings(), l = getLive();
  toggleText($('#btn-quiet'), '🤫 조용 모드', l.quiet); $('#btn-quiet').disabled = !settingsSeen.live;
  toggleText($('#btn-safe'), '🛡 본식 안전 모드', s.safe); $('#btn-safe').disabled = !settingsSeen.settings;
  toggleText($('#set-safe'), '', s.safe); $('#set-safe').disabled = !settingsSeen.settings;
}
async function saveStatus(label, p) {
  const st = $('#ev-status');
  try { await p; st.textContent = `✅ ${label} (${new Date().toLocaleTimeString('ko-KR')})`; }
  catch (e) { st.textContent = '실패: ' + (e.code || e.message) + ' (firestore.rules 최신 버전 게시 필요)'; }
}
$('#btn-quiet').addEventListener('click', () => { const on = !getLive().quiet; saveStatus(`조용 모드 ${on ? '켬' : '끔'}`, setLive({ quiet: on })); });
const toggleSafe = () => { const on = !getSettings().safe; return saveStatus(`본식 안전 모드 ${on ? '켬' : '끔'}`, setSafe(on)); };
$('#btn-safe').addEventListener('click', toggleSafe);
$('#set-safe').addEventListener('click', toggleSafe);
let alertT = 0;
function featureAlert(msg) {
  const el = $('#admin-alert'); el.textContent = String(msg ?? '').slice(0, 300); el.hidden = !el.textContent;
  clearTimeout(alertT); if (!el.hidden) alertT = setTimeout(() => { el.hidden = true; el.textContent = ''; }, 8000);
}

// ---- ⚙️ settings tab (v4.1 — Patrick 2026-10: plainer): what is on now · features grouped by when they matter · one switch each · advanced folded away ----
// Each feature row: icon · name · one line on what guests get · a switch (켜짐/꺼짐) · where it stands now, in words · ⚙️ its own settings ·
// a small "기본값으로" when the admin overrode the manifest default. Planned features sit greyed in their group ("준비 중").
const FEAT_INFO = {
  prereg: ['🎟', '결혼식 전에 마을에 미리 입주하고, 당일 입구에서 체크인 · 입장권'],
  couple: ['💑', '신랑·신부 캐릭터를 두 사람 모습대로'],
  dday: ['📅', '결혼식까지 남은 날에 따라 마을이 조금씩 꾸며져요'],
  story: ['📖', '마을 곳곳 표지판에 두 사람의 이야기'],
  live: ['📋', '도우미가 "다음 ▶"을 누르면 TV·폰 마을에 식순 장면'],
  translate: ['🌐', 'TV에서 덕담을 한국어↔영어로 자동 번역'],
  bgm: ['🎵', 'TV 마을의 8비트 배경음악·효과음 (식장 음향 때문에 기본은 꺼짐)'],
  meter: ['🌡', 'TV 마음 온도계 — 축하가 모일수록 올라가요'],
  bingo: ['🎯', '양가 하객이 서로 만나며 채우는 빙고'],
  poll: ['🗳', '하객 실시간 투표 → TV에 결과'],
  card: ['🃏', '하객이 내 캐릭터 카드를 저장·공유'],
  fourcut: ['📸', '폰으로 찍는 픽셀 네컷 사진'],
  offline: ['📶', '식장 와이파이가 끊겨도 화면이 열리게'],
  archive: ['🏛', '결혼식 뒤 추억 마을로 보관'],
  thanks: ['💌', '하객마다 감사 카드'],
  photobook: ['📚', '방명록·사진으로 포토북 PDF'],
  postcard: ['✉️', '신혼여행 엽서를 마을로'],
  anniversary: ['🎂', '1주년에 마을 다시 열기'],
  wall: ['💬', '하객들이 서로의 방명록을 볼 수 있어요'],
  tv: ['📺', '마을 호숫가 TV에 유튜브 영상·생중계'],
  _selftest: ['🧪', '코어 점검용 (데모에서만)'],
};
const FEAT_GROUP = { prereg: 'before', couple: 'before', dday: 'before', story: 'before', card: 'before', wall: 'before', tv: 'before', offline: 'before',
  live: 'day', translate: 'day', bgm: 'day', meter: 'day', bingo: 'day', poll: 'day', fourcut: 'day',
  archive: 'after', thanks: 'after', photobook: 'after', postcard: 'after', anniversary: 'after', _selftest: 'test' };
const GROUPS = [['before', '📅 결혼식 전부터', '청첩장을 받은 하객이 지금부터 만나는 기능'], ['day', '💒 결혼식 당일', '켜 두면 4월 10일에 자동으로 나타나요'],
  ['after', '🎁 결혼식 후', '결혼식이 끝난 뒤를 위한 기능'], ['test', '🧪 점검 (데모 전용)', '']];
const whenText = e => (e.phases.length === 4 ? '항상' : e.phases.map(p => PHASE_KO[p]).join(' · '));
/** where a feature stands for guests right now, in plain words */
function guestView(entry, s, phase) {
  const page = ['guest', 'kiosk', 'village'].find(p => entry.pages.includes(p)) || 'admin';
  const r = resolveEnabled(entry, { page, phase, url: NO_URL, remote: s, safe: s.safe, demo: false, tripped: false });
  const onAnyPhase = entry.phases.some(p => resolveEnabled(entry, { page, phase: p, url: NO_URL, remote: s, safe: s.safe, demo: false, tripped: false }).on);
  if (r.source === 'phase') return onAnyPhase ? { on: true, cls: 'wait', why: `⏰ ${whenText(entry)}에 자동으로 나타나요` } : { on: false, cls: 'off', why: '⏸ 꺼짐 — 켜 두면 ' + whenText(entry) + '에 나타나요' };
  if (r.source === 'safe') return { on: false, cls: 'wait', why: '🛡 본식 안전 모드라 잠시 꺼짐' };
  if (r.source === 'planned') return { on: false, cls: 'none', why: '준비 중' };
  return r.on ? { on: true, cls: 'on', why: page === 'admin' ? '✅ 켜짐' : '✅ 켜짐 — 지금 하객에게 보여요' } : { on: false, cls: 'off', why: '⏸ 꺼짐 — 켜면 바로 보여요' };
}
function buildSettings() {
  if (settingsBuilt) return; settingsBuilt = true;
  const host = $('#set-features');
  const sections = new Map(), soon = new Map();
  for (const [g, title, sub] of GROUPS) {
    if (g === 'test' && !DEMO) continue;
    const sec = mk('section', 'fgroup px-box'); sec.dataset.group = g;
    const h = mk('h3', 'fgroup-h', title); sec.append(h);
    if (sub) sec.append(mk('p', 'tip fgroup-sub', sub));
    sections.set(g, sec); host.append(sec);
  }
  for (const entry of FEATURES) {
    if (entry.id[0] === '_' && !DEMO) continue;                      // the self-test feature is demo-only
    const [icon, desc] = FEAT_INFO[entry.id] || ['✨', ''];
    const row = mk('article', 'frow'); row.dataset.fid = entry.id;
    const top = mk('div', 'ftop');
    const nameC = mk('div', 'fname'); nameC.append(mk('span', 'ficon', icon), mk('b', '', entry.name.ko));
    const sw = mk('button', 'fswitch'); sw.type = 'button'; sw.setAttribute('role', 'switch'); sw.setAttribute('aria-checked', 'false'); sw.setAttribute('aria-label', `${entry.name.ko} 켜기/끄기`);
    const track = mk('span', 'fswitch-track'); track.append(mk('span', 'fswitch-knob'));
    sw.append(track, mk('span', 'fswitch-txt'));
    sw.addEventListener('click', () => saveFlag(entry, sw.getAttribute('aria-checked') === 'true' ? 'off' : 'on'));
    top.append(nameC, sw);
    const descC = mk('p', 'fdesc', desc);
    const viewC = mk('div', 'fview'), why = mk('span', 'fwhy');
    const dflt = mk('button', 'flink fdefault', '기본값으로'); dflt.type = 'button'; dflt.hidden = true;
    dflt.addEventListener('click', () => saveFlag(entry, 'default'));
    viewC.append(why, dflt);
    const err = mk('div', 'ferr');
    const more = mk('details', 'fmore'); more.hidden = true;
    const sum = mk('summary', '', '⚙️ 기능 설정'), boxes = mk('div', 'fmore-host'); more.append(sum, boxes);
    const meta = mk('small', 'fmeta', `${entry.wp} · ${entry.id}`);
    row.append(top, descC, viewC, err, more, meta);
    const g = sections.has(FEAT_GROUP[entry.id]) ? FEAT_GROUP[entry.id] : 'before';
    if (entry.status === 'planned') (soon.get(g) || soon.set(g, []).get(g)).push([row, entry.name.ko]);   // not built yet → the folded 🔜 list at the end of the group
    else sections.get(g).append(row);
    rowsById.set(entry.id, { entry, row, sw, why, dflt, err, more, boxes });
  }
  for (const [g, list] of soon) {
    const box = mk('details', 'fsoon'); box.dataset.group = g;
    box.append(mk('summary', '', `🔜 준비 중 ${list.length}개 — ${list.map(([, n]) => n).join(' · ')}`), ...list.map(([row]) => row));
    sections.get(g).append(box);
  }
  for (const set of featBoxes.values()) for (const reg of set) mountBox(reg);   // features that registered before the table existed
  paintSettings();
}
async function saveFlag(entry, v) {
  if (entry.status === 'planned') return;
  const label = `${entry.name.ko}: ${v === 'on' ? '켬' : v === 'off' ? '끔' : '기본값으로'}`;
  try { await setFeature(entry.id, v === 'on' ? true : v === 'off' ? false : null); $('#set-msg').textContent = `✅ ${label} (${new Date().toLocaleTimeString('ko-KR')})`; }
  catch (e) { $('#set-msg').textContent = `실패: ${label} — ${e.code || e.message}`; }
}
function paintSettings() {
  if (!settingsBuilt) return;
  const s = getSettings(), ph = currentPhase(), src = busLast('phase')?.source;
  $('#set-phase-now').textContent = `${PHASE_KO[ph] || ph} (${ph})`;
  $('#set-phase-src').textContent = src === 'url' ? '· 주소의 ?phase= 로 고정 (이 탭만)' : src === 'admin' ? '· 관리자가 강제로 지정' : '· 자동 (시계 · 식장 현지 시간 기준)';
  $('#set-now').textContent = nowLine(ph);
  if (pendingPhase === null) $('#set-phase-sel').value = s.phase;
  $('#set-updated').textContent = s.updatedAt ? `마지막 변경 ${fmt(s.updatedAt)}` : '아직 바꾼 적 없음 (기본값 그대로)';
  const states = new Map(featureStates().map(x => [x.id, x]));
  for (const [id, r] of rowsById) {
    const { entry } = r, planned = entry.status === 'planned', flag = s.features[id], stt = states.get(id);
    r.row.classList.toggle('planned', planned);
    const g = planned ? { on: false, cls: 'none', why: '준비 중 — 필요한 자료가 오면 만들어요' } : guestView(entry, s, ph);
    r.sw.hidden = planned; r.sw.disabled = planned;
    r.sw.setAttribute('aria-checked', String(g.on));
    r.sw.querySelector('.fswitch-txt').textContent = g.on ? '켜짐' : '꺼짐';
    r.why.textContent = g.why; r.why.className = 'fwhy ' + g.cls;
    r.dflt.hidden = planned || flag === undefined;
    r.dflt.title = flag === undefined ? '' : `기본값(${entry.status === 'ready' && entry.default ? '켜짐' : '꺼짐'})으로 되돌리기`;
    r.err.textContent = stt?.tripped ? `⛔ 이번 세션 꺼짐 — 문제가 생겨 이 화면에서 껐어요. 새로고침해 보세요${stt.lastError ? ' · ' + stt.lastError.slice(0, 60) : ''}` : stt?.errors ? `⚠ 오류 ${stt.errors}회 · ${(stt.lastError || '').slice(0, 60)}` : '';
    r.err.title = stt?.lastError || '';
  }
}
/** "지금은 결혼식 전이에요 · D-184" */
function nowLine(ph) {
  const d = Math.ceil((Date.parse((CONFIG.schedule?.weddingDate || '2027-04-10') + 'T00:00:00') - Date.now()) / 86400e3);
  if (ph === 'pre') return `지금은 결혼식 전이에요${Number.isFinite(d) && d > 0 ? ` · D-${d}` : ''}`;
  if (ph === 'live') return '오늘은 결혼식 날이에요 💒';
  if (ph === 'after') return '결혼식이 끝났어요 — 축하해요!';
  return '1주년 기간이에요 🎂';
}
let paintT = 0;
const queueSettingsPaint = () => { if (tab !== 'settings') return; clearTimeout(paintT); paintT = setTimeout(paintSettings, 0); };
busOn('settings', () => { settingsSeen.settings = true; paintLive(); queueSettingsPaint(); });
busOn('live', () => { settingsSeen.live = true; paintLive(); });
busOn('phase', queueSettingsPaint);
busOn('feature:state', queueSettingsPaint);
busOn('feature:error', queueSettingsPaint);

// phase override: asks first — every guest screen changes
$('#set-phase-sel').addEventListener('change', e => {
  const v = e.target.value;
  if (v === getSettings().phase) { pendingPhase = null; $('#set-phase-confirm').hidden = true; return; }
  pendingPhase = v;
  $('#set-phase-ask').textContent = `모든 하객 화면이 바뀝니다. 리허설은 주소에 ?phase= 를 쓰세요. “${v === 'auto' ? '자동 (시계)' : PHASE_KO[v]}”(으)로 바꿀까요?`;
  $('#set-phase-confirm').hidden = false;
});
$('#set-phase-cancel').addEventListener('click', () => { pendingPhase = null; $('#set-phase-confirm').hidden = true; paintSettings(); });
$('#set-phase-ok').addEventListener('click', async () => {
  const v = pendingPhase; if (v === null) return;
  pendingPhase = null; $('#set-phase-confirm').hidden = true;
  try { await setPhaseOverride(v); $('#set-msg').textContent = `✅ 페이즈: ${v === 'auto' ? '자동' : PHASE_KO[v] + ' 로 강제'} (${new Date().toLocaleTimeString('ko-KR')})`; }
  catch (e) { $('#set-msg').textContent = '실패: 페이즈 — ' + (e.code || e.message); }
  paintSettings();
});

// "모든 기능 기본값으로": two confirmations (3 presses). Only the on/off flags are cleared — safe mode, phase and each feature's own settings stay.
let resetStage = 0, resetT = 0;
function resetBack() { resetStage = 0; const b = $('#set-reset'); b.textContent = '모든 기능 기본값으로'; b.style.removeProperty('--bg'); b.style.color = ''; }
$('#set-reset').addEventListener('click', async () => {
  const b = $('#set-reset'); clearTimeout(resetT);
  if (resetStage < 2) {
    resetStage++; b.textContent = resetStage === 1 ? '정말 되돌릴까요? (1/2) 한 번 더 누르세요' : '마지막 확인 (2/2) 한 번 더 누르면 실행돼요';
    b.style.setProperty('--bg', '#c8433f'); b.style.color = '#fff';
    resetT = setTimeout(resetBack, 5000); return;
  }
  resetBack(); b.disabled = true;
  try {
    const ref = docdb().doc('app/settings'), cur = await ref.get();
    if (cur && Object.keys(normalizeSettings(cur).features).length) await ref.update({ features: {}, updatedAt: ts() });
    $('#set-msg').textContent = `✅ 모든 기능을 기본값으로 되돌렸어요 (${new Date().toLocaleTimeString('ko-KR')})`;
  } catch (e) { $('#set-msg').textContent = '실패: ' + (e.code || e.message); }
  finally { b.disabled = false; }
});

// ---- per-feature settings boxes (ctx.admin.settings.add) ----
function mountBox(reg) {
  const r = rowsById.get(reg.scope.id); if (!r || reg.box || !reg.scope.alive()) return;
  reg.box = mk('div', 'fbox'); reg.box.dataset.f = reg.scope.id;
  r.boxes.append(reg.box); r.more.hidden = false;
  reg.render(reg.box);
}
function unmountBox(reg) {
  reg.box?.remove(); reg.box = null;
  const r = rowsById.get(reg.scope.id); if (r) r.more.hidden = !r.boxes.children.length;
}

// ---- backup parts (ctx.admin.backup.add): every path must start with f-<id>/; a failing part lands in MISSING.txt, the rest of the backup goes on ----
const PART_TIMEOUT_MS = 30000;
async function runBackupParts(zip, missing, st) {
  for (const part of [...backupParts]) {
    const entries = [], bad = [];
    const wrap = prefix => ({
      file(path, data, opts) {
        const p = prefix + String(path);
        if (!p.startsWith(`f-${part.id}/`) || p.includes('..') || p.includes('\\') || p.length > 200) { bad.push(p); throw coded('bad-path', `백업 경로 "${p}" 는 f-${part.id}/ 로 시작해야 해요`); }
        entries.push([p, data, opts]); return this;
      },
      folder: name => wrap(prefix + String(name).replace(/^\/+|\/+$/g, '') + '/'),
    });
    let timer;
    try {
      st.textContent = `기능 백업 중: ${part.name}`;
      await Promise.race([Promise.resolve(part.fn(wrap(''), { safe, addB64 })), new Promise((_, rej) => { timer = setTimeout(() => rej(coded('timeout', '시간 초과')), PART_TIMEOUT_MS); })]);
      if (bad.length) throw coded('bad-path', `허용되지 않는 경로: ${bad.join(', ')}`);
      for (const [p, d, o] of entries) zip.file(p, d, o);
    } catch (e) { console.warn('[backup]', part.id, part.name, e); part.report(e); missing.push(`기능 ${part.id}: ${part.name} — ${e.message}`); }
    finally { clearTimeout(timer); }
  }
}

// ---- the ctx.admin object handed to each feature (all registrations are undone by scope.add on dispose) ----
function makeAdminApi(scope) {
  const alive = scope.alive, id = scope.id;
  const keyOk = new RegExp('^f-' + id + '(-[a-z0-9-]{1,24})?$');
  const opt = fn => (typeof fn === 'function' ? scope.guard(fn) : null);
  const order = (o, what) => { if (!Number.isFinite(o)) throw coded('bad-arg', `${what}: order must be a number`); return o; };

  const tabs = Object.freeze({
    add(spec = {}) {
      const { key } = spec;
      if (typeof key !== 'string' || !keyOk.test(key)) throw coded('bad-name', `ctx.admin.tabs.add: key "${key}" must be "f-${id}" or "f-${id}-<x>"`);
      order(spec.order, 'ctx.admin.tabs.add');
      if (typeof spec.render !== 'function') throw coded('bad-arg', 'ctx.admin.tabs.add: render(section) is required');
      if (!alive()) return noop;
      if (tabReg.has(key) || document.getElementById('tab-' + key)) throw coded('duplicate', `tab "${key}" already exists`);
      const btn = mk('button'); btn.type = 'button'; btn.dataset.tab = key; btn.dataset.f = id; btn.dataset.order = String(spec.order); btn.setAttribute('aria-selected', 'false');
      const section = mk('section'); section.id = 'tab-' + key; section.dataset.f = id; section.hidden = true;
      const t = { key, label: spec.label, order: spec.order, btn, section, onShow: opt(spec.onShow), onHide: opt(spec.onHide), core: false };
      btn.textContent = tabLabel(t);
      const nav = $('#atabs');
      nav.insertBefore(btn, [...nav.children].find(b => Number(b.dataset.order) > spec.order) || null);   // keep the buttons sorted by order
      $('#main').append(section);
      tabReg.set(key, t);
      const remove = () => {
        if (tabReg.get(key) !== t) return;
        tabReg.delete(key); btn.remove(); section.remove();
        if (tab === key) showTab('guests');                            // never leave the couple on a tab that no longer exists
      };
      scope.add(remove);
      opt(spec.render)(section);
      return remove;
    },
  });
  const live = Object.freeze({
    add(el, { order: o = 50 } = {}) {
      if (!(el instanceof HTMLElement)) throw coded('bad-arg', 'ctx.admin.live.add: el must be an HTMLElement');
      order(o, 'ctx.admin.live.add');
      if (!alive()) return noop;
      const slot = $('#live-slot');
      el.dataset.f = id; el.dataset.order = String(o);
      slot.insertBefore(el, [...slot.children].find(c => Number(c.dataset.order) > o) || null);
      const remove = () => el.remove();
      scope.add(remove);
      return remove;
    },
  });
  const settings = Object.freeze({
    add(spec = {}) {
      if (typeof spec.render !== 'function') throw coded('bad-arg', 'ctx.admin.settings.add: render(box) is required');
      if (!alive()) return noop;
      const reg = { scope, render: scope.guard(spec.render), box: null };
      let set = featBoxes.get(id); if (!set) featBoxes.set(id, set = new Set());
      set.add(reg);
      const remove = () => { set.delete(reg); if (!set.size) featBoxes.delete(id); unmountBox(reg); };
      scope.add(remove);
      if (settingsBuilt) mountBox(reg);
      return remove;
    },
  });
  const backup = Object.freeze({
    add(name, fn) {
      if (typeof name !== 'string' || !name || name.length > 80) throw coded('bad-arg', 'ctx.admin.backup.add: name must be a short string');
      if (typeof fn !== 'function') throw coded('bad-arg', 'ctx.admin.backup.add: fn(zip, { safe, addB64 }) is required');
      if (!alive()) return noop;
      const part = { id, name, fn, report: scope.report };
      backupParts.add(part);
      const remove = () => backupParts.delete(part);
      scope.add(remove);
      return remove;
    },
  });
  return {
    admin: Object.freeze({
      tabs, live, settings, backup,
      guests: () => guests.slice(),
      user: () => ({ email: adminUser?.email || '' }),
      saveCfg: patch => (alive() ? saveCfg(id, patch) : Promise.resolve()),
      setLive: patch => (alive() ? setLive(patch) : Promise.resolve()),
      alert: msg => { if (alive()) featureAlert(msg); },
      photo: gid => (alive() ? getPhoto(String(gid ?? '')) : Promise.resolve(null)),
      download: (name, href) => { if (alive()) download(String(name), href); },
      downloadBlob: (name, blob) => { if (alive() && blob instanceof Blob) downloadBlob(String(name), blob); },
    }),
  };
}

// ctx.texts / language: no 'lang' event; repaint what the page owns (feature tab labels may be functions of the language)
function refreshTexts() {
  try { applyI18n(); document.documentElement.lang = 'ko'; } catch {}      // the admin page itself is Korean-only
  for (const t of tabReg.values()) if (!t.core) t.btn.textContent = tabLabel(t);
}
let featuresBooted = false;
function bootAdminFeatures() {
  if (featuresBooted) return; featuresBooted = true;                   // once; sign out → sign in again reuses the running loader
  try {
    buildSettings();
    emit('lang', { lang: getLang() });
    emit('admin:tab', { key: tab });
    bootFeatures('admin', { forFeature: makeAdminApi, refreshTexts }).catch(e => console.error('[features] boot failed', e));
  } catch (e) { console.error('[features] boot failed', e); }
}

// Google blocks sign-in inside in-app browsers (KakaoTalk, Instagram, Facebook, LINE…)
if (/KAKAOTALK|Instagram|FBAN|FBAV|Line\/|NAVER\(inapp|DaumApps/i.test(navigator.userAgent)) $('#inapp').hidden = false;
(async () => {
  try { store = await getStore(); }
  catch (e) { $('#login').hidden = false; $('#login-msg').textContent = '인터넷 연결을 확인한 뒤 새로고침해주세요. (' + (e.code || e.message) + ')'; $('#btn-login').onclick = () => location.reload(); return; }
  let unsub = null;
  $('#btn-login').addEventListener('click', () => store.signIn().catch(e => { $('#login-msg').textContent = '로그인 실패: ' + e.message; }));
  $('#btn-logout').addEventListener('click', () => store.signOut());
  store.onAuth(user => {
    const ok = user?.isAdmin;
    $('#login').hidden = !!ok; $('#main').hidden = !ok;
    if (user && !ok) $('#login-msg').textContent = `${user.email} 계정은 관리자 권한이 없어요. config.js 와 firestore.rules 의 관리자 이메일을 확인하세요.`;
    $('#who').textContent = DEMO ? '(데모 모드)' : user?.email || '';
    unsub?.(); unsub = null;
    if (ok) {
      try { localStorage.setItem('wgb_admin', '1'); } catch {}
      adminUser = { email: user.email };
      const u1 = store.subscribeGuests(list => { guests = list; emit('admin:guests', { list: guests.slice() }); render(); refreshReport(); if (snapsReady) renderSnaps(); });
      bootAdminFeatures();                                               // v4: after the guest subscription; the loader reuses itself on the next sign-in
      if (tab === 'snaps' || tab === 'report') ensureSnaps();
      unsub = () => { u1?.(); unsubSnaps?.(); unsubSnaps = null; snapsReady = null; };
    }
  });
})();

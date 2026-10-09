// ============================================================
//  Data layer — Firebase (Firestore + Auth) or local demo mode
//  guests/{id}   : { name, side, message, priv?, avatar, activity, hidden, hasPhoto, hasVoice, hasCapsule, createdAt }  (public)
//  photos/{id}   : { data: jpeg dataURL, createdAt }               admin only
//  voices/{id}   : { data: audio dataURL, mime, createdAt }        admin only
//  capsules/{id} : { text, name, createdAt }                       admin only, and only after the 1st anniversary
//  notes/{id}    : { message, createdAt }                         admin only (v4): the message of a guest who ticked "only for the couple"
//                  — that guest's public document then has message '' and priv: true
//  snaps/{gid}_{k}: { gid, name, caption, data, hidden, createdAt } guests' candid photos → TV slideshow (public)
//                  k = 0..snapLimitPerGuest-1 → the per-guest limit is enforced by the server, not just this phone
//  pulse/{gid}   : { type, n, createdAt }  phone remote. One doc per guest (overwritten, n = total taps).
//                  Phones watch a few guests cheaply; the TV watches the whole collection.
//  events/{id}   : { type, createdAt }      admin → village (bouquet / group photo / fireworks)
// ============================================================
import { CONFIG, DEMO } from './config.js';
import { normalizeAvatar } from './avatar.js';

const FB = 'https://www.gstatic.com/firebasejs/12.19.0/';
export const ACTIVITIES = ['walk', 'dance', 'fish', 'chat', 'eat', 'photo'];
export const EMOTES = ['heart', 'clap', 'dance', 'jump', 'greet'];
export const EVENTS = ['bouquet', 'group', 'fireworks'];
const clean = (s, n) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n);
export const capsuleOpenAt = () => new Date(CONFIG.capsuleOpen + 'T00:00:00Z').getTime();
// only ever hand base64 data: URLs of the expected kind to <img>/<audio>/download links (never javascript:/http: from a tampered doc)
const DATA_RE = { image: /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/, audio: /^data:audio\/[a-z0-9.+-]+(;[a-zA-Z0-9=.+-]+)*;base64,[A-Za-z0-9+/=]+$/ };
export const safeData = (v, kind = 'image') => (typeof v === 'string' && DATA_RE[kind].test(v)) ? v : null;
// sync status for long-running screens (TV / admin): 'wgb-sync' events with { ok, what }
const syncStatus = (ok, what, err) => { try { dispatchEvent(new CustomEvent('wgb-sync', { detail: { ok, what, err: err?.code || err?.message } })); } catch {} };

export function toGuest(id, d) {
  return {
    id,
    name: clean(d.name, 30) || '?',
    side: ['groom', 'bride', 'both'].includes(d.side) ? d.side : 'both',
    message: String(d.message ?? '').trim().slice(0, 300),
    avatar: normalizeAvatar(d.avatar),
    activity: ACTIVITIES.includes(d.activity) ? d.activity : 'walk',
    hidden: !!d.hidden, priv: d.priv === true,
    hasPhoto: !!d.hasPhoto, hasVoice: !!d.hasVoice, hasCapsule: !!d.hasCapsule,
    createdAt: typeof d.createdAt === 'number' ? d.createdAt : d.createdAt?.toMillis?.() ?? Date.now(),
  };
}
const toSnap = (id, d) => ({
  id, gid: String(d.gid || ''), name: clean(d.name, 30), caption: clean(d.caption, 60), data: safeData(d.data),
  hidden: !!d.hidden, createdAt: typeof d.createdAt === 'number' ? d.createdAt : d.createdAt?.toMillis?.() ?? Date.now(),
});
// extras: { photo, voice: {data, mime}, capsule } — older callers passed the photo string directly
const normExtras = x => (typeof x === 'string' || x == null) ? { photo: x || null } : x;

// ------------------------------------------------------------
//  Demo adapter: localStorage (records) + IndexedDB (photos, audio) + BroadcastChannel
// ------------------------------------------------------------
function idb() {
  const open = () => new Promise((res, rej) => { const r = indexedDB.open('wgb-demo', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const tx = async (mode, fn) => { const db = await open(); return new Promise((res, rej) => { const t = db.transaction('kv', mode); const st = t.objectStore('kv'); const r = fn(st); t.oncomplete = () => res(r?.result); t.onerror = () => rej(t.error); }); };
  // keys / scan / delMany: v4 docdb documents live in this same store under "doc:<path>" (docs/v4/03 §3) — deleteMany() below sweeps them
  const range = prefix => IDBKeyRange.bound(prefix, prefix + '￿');
  const scan = async prefix => { const db = await open(); return new Promise((res, rej) => { const t = db.transaction('kv', 'readonly'), st = t.objectStore('kv'), r = range(prefix); const ks = st.getAllKeys(r), vs = st.getAll(r); t.oncomplete = () => res(ks.result.map((k, i) => [k, vs.result[i]])); t.onerror = () => rej(t.error); }); };
  const delMany = async keys => { const db = await open(); return new Promise((res, rej) => { const t = db.transaction('kv', 'readwrite'), st = t.objectStore('kv'); keys.forEach(k => st.delete(k)); t.oncomplete = () => res(); t.onerror = () => rej(t.error); }); };
  return { get: k => tx('readonly', s => s.get(k)), set: (k, v) => tx('readwrite', s => s.put(v, k)), del: k => tx('readwrite', s => s.delete(k)),
    keys: async prefix => (await scan(prefix)).map(e => e[0]), scan, delMany };
}

// v4 documents that hang off a guest (docs/v4/03 §2.1): deleted together with the guest, in both adapters
const V4_PER_GUEST = ['checkins', 'bingo', 'translations', 'anniv', 'notes'];
function demoStore() {
  const KEY = 'wgb_demo_guests', SKEY = 'wgb_demo_snaps', PKEY = 'wgb_demo_pulse';
  const kv = idb();
  const bc = 'BroadcastChannel' in window ? new BroadcastChannel('wgb-demo') : null;
  const listeners = new Set(), snapL = new Set(), emoteL = new Set(), eventL = new Set();
  const readJ = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || d); } catch { return JSON.parse(d); } };
  const read = () => readJ(KEY, '[]');
  const write = (arr) => { localStorage.setItem(KEY, JSON.stringify(arr)); emit(); bc?.postMessage({ k: 'changed' }); };
  const emit = () => { const list = read().map(g => toGuest(g.id, g)).sort((a, b) => a.createdAt - b.createdAt); listeners.forEach(fn => fn(list)); };
  let snapSeq = 0;   // only the newest emitSnaps() may deliver — an older, slower one would roll the list back
  const emitSnaps = async () => { const my = ++snapSeq; const meta = readJ(SKEY, '[]'); const list = await Promise.all(meta.map(async m => toSnap(m.id, { ...m, data: await kv.get('snap_' + m.id) }))); if (my !== snapSeq) return; snapL.forEach(fn => fn(list.sort((a, b) => a.createdAt - b.createdAt))); };
  const writeSnaps = (arr) => { localStorage.setItem(SKEY, JSON.stringify(arr)); emitSnaps(); bc?.postMessage({ k: 'snaps' }); };
  if (bc) bc.onmessage = (e) => {
    const m = e.data || {};
    if (m.k === 'emote') emoteL.forEach(fn => fn(m.v));
    else if (m.k === 'event') eventL.forEach(fn => fn(m.v));
    else if (m.k === 'snaps') emitSnaps();
    else emit();
  };
  // Another tab's BroadcastChannel message can arrive BEFORE its localStorage write is visible here (≈1 in 8 in Chrome),
  // so also re-read when the browser reports the storage change itself. Re-emitting the same list is harmless.
  addEventListener('storage', e => { if (e.key === KEY) emit(); else if (e.key === SKEY) emitSnaps(); });
  const post = (k, v) => { bc?.postMessage({ k, v }); (k === 'emote' ? emoteL : eventL).forEach(fn => fn(v)); };
  const unlocked = () => Date.now() >= capsuleOpenAt() || new URLSearchParams(location.search).get('unlock') === '1';

  return {
    demo: true,
    async addGuest(g, extras) {
      const { photo, voice, capsule } = normExtras(extras);
      const id = 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      if (photo) await kv.set('photo_' + id, photo);
      if (voice) await kv.set('voice_' + id, voice);
      if (capsule) await kv.set('capsule_' + id, { text: capsule, name: g.name, createdAt: Date.now() });
      const priv = !!g.priv && !!String(g.message || '').trim();
      if (priv) await kv.set('doc:notes/' + id, { message: g.message, createdAt: Date.now() });   // v4: admin-only, like the rules' notes/{id}
      write([...read(), { id, ...g, message: priv ? '' : g.message, priv, hidden: false, hasPhoto: !!photo, hasVoice: !!voice, hasCapsule: !!capsule, createdAt: Date.now() }]);
      return { id, queued: false };
    },
    subscribeGuests(cb) { listeners.add(cb); setTimeout(emit, 0); return () => listeners.delete(cb); },
    subscribeSnaps(cb) { snapL.add(cb); setTimeout(emitSnaps, 0); return () => snapL.delete(cb); },
    async addSnap(gid, name, data, caption, slot = 0) {
      const meta = readJ(SKEY, '[]');
      for (let k = slot; k < CONFIG.snapLimitPerGuest; k++) {
        const id = gid + '_' + k; if (meta.some(m => m.id === id)) continue;
        await kv.set('snap_' + id, data);
        writeSnaps([...meta, { id, gid, name, caption, hidden: !!CONFIG.snapApproval, createdAt: Date.now() }]);
        return { id, queued: false, slot: k };
      }
      const e = new Error('snap limit reached'); e.code = 'snap-limit'; throw e;
    },
    async setSnapHidden(id, hidden) { writeSnaps(readJ(SKEY, '[]').map(s => s.id === id ? { ...s, hidden } : s)); },
    async deleteSnap(id) { await kv.del('snap_' + id); writeSnaps(readJ(SKEY, '[]').filter(s => s.id !== id)); },
    subscribeEmotes(cb) { emoteL.add(cb); return () => emoteL.delete(cb); },
    subscribePulse(ids, cb) { const set = new Set(ids), fn = v => { if (set.has(v.gid)) cb(v); }; emoteL.add(fn); return () => emoteL.delete(fn); },
    subscribeEvents(cb) { eventL.add(cb); return () => eventL.delete(cb); },
    async sendEmote(gid, type) { const c = readJ(PKEY, '{}'); c[gid] = (c[gid] || 0) + 1; localStorage.setItem(PKEY, JSON.stringify(c)); post('emote', { gid, type, n: c[gid], createdAt: Date.now() }); },
    async getPulseCounts() { return readJ(PKEY, '{}'); },
    async sendEvent(type) { post('event', { type, createdAt: Date.now() }); },
    async getPhoto(id) { return safeData(await kv.get('photo_' + id)); },
    async getVoice(id) { const v = await kv.get('voice_' + id); return v && safeData(v.data, 'audio') ? v : null; },
    async getNote(id) { const n = await kv.get('doc:notes/' + id); return n && typeof n.message === 'string' ? n.message : null; },
    async getCapsules() {
      if (!unlocked()) return { locked: true };
      const out = []; for (const g of read()) { if (!g.hasCapsule) continue; const c = await kv.get('capsule_' + g.id); if (c) out.push({ id: g.id, ...c }); }
      return { locked: false, list: out };
    },
    async setHidden(id, hidden) { write(read().map(g => g.id === id ? { ...g, hidden } : g)); },
    async updateGuest(id, patch) { write(read().map(g => g.id === id ? { ...g, ...patch } : g)); },
    async deleteGuest(id) { return this.deleteMany([id]); },
    async deleteMany(ids) {
      const s = new Set(ids);
      for (const id of ids) for (const k of ['photo_', 'voice_', 'capsule_']) await kv.del(k + id);
      const snaps = readJ(SKEY, '[]'), gone = snaps.filter(m => s.has(m.gid));
      for (const m of gone) await kv.del('snap_' + m.id);
      if (gone.length) writeSnaps(snaps.filter(m => !s.has(m.gid)));
      const c = readJ(PKEY, '{}'); ids.forEach(id => delete c[id]); localStorage.setItem(PKEY, JSON.stringify(c));
      write(read().filter(g => !s.has(g.id)));
      try { await deleteV4Docs(ids); } catch (e) { console.warn('v4 cleanup failed', e); }   // after the v3.2 part, which is unchanged
    },
    onAuth(cb) { cb({ email: 'demo', isAdmin: true }); return () => {}; },
    async signIn() {}, async signOut() {},
    // v4 core/docdb.js shares this IndexedDB (keys "doc:<path>"), the guest list and the change channel (docs/v4/03 §3)
    backend: { kind: 'demo', kv, bc, guests: read, notifyDocs },
  };
  // v4 documents of the deleted guests: checkins · bingo · translations · anniv · votes (every poll) · thanks cards (gid match)
  async function deleteV4Docs(ids) {
    const polls = (await kv.keys('doc:polls/')).map(k => k.slice('doc:polls/'.length));
    const gone = new Set(ids), dead = [];
    for (const id of ids) {
      V4_PER_GUEST.forEach(col => dead.push(`doc:${col}/${id}`));
      polls.forEach(p => dead.push(`doc:votes/${p}_${id}`));
    }
    for (const [k, v] of await kv.scan('doc:thanks/')) if (gone.has(v?.gid)) dead.push(k);
    await kv.delMany(dead);
    notifyDocs(dead.map(k => k.slice(4)));   // docdb watchers (this tab and the others) re-read
  }
  // docdb's change channel: other BroadcastChannel objects of the same name — in this page and in other tabs — receive it
  function notifyDocs(paths) {
    try { const ch = new BroadcastChannel('wgb-docdb'); ch.postMessage({ paths }); setTimeout(() => ch.close(), 1000); } catch {}
  }
}

// ------------------------------------------------------------
//  Firebase adapter
// ------------------------------------------------------------
/**
 * Which Firestore cache this page uses: 'memory' on phones, 'disk' (IndexedDB) on the TV, the kiosk and desktop admin.
 * A phone that leaves the page for the camera or the photo picker can come back to a Firestore whose IndexedDB connection
 * was closed under it (iOS) or whose multi-tab lease moved to another tab — from then on every write fails until a reload,
 * which is what guests saw as "the 2nd photo never uploads". A guest phone has nothing worth keeping across reloads
 * (writes still queue in memory while the page is open). The TV restarts faster and the kiosk keeps queued writes
 * across a reload with IndexedDB. `?cache=memory|disk` overrides (field debugging).
 */
export function cacheKind(loc = globalThis.location, mm = globalThis.matchMedia) {
  const q = new URLSearchParams(loc?.search || '').get('cache');
  if (q === 'memory' || q === 'disk') return q;
  if (/kiosk\.html$/.test(loc?.pathname || '')) return 'disk';
  try { return mm?.('(pointer: coarse)').matches ? 'memory' : 'disk'; } catch { return 'disk'; }
}
async function firebaseStore() {
  const [{ initializeApp }, fs, au] = await Promise.all([
    import(FB + 'firebase-app.js'), import(FB + 'firebase-firestore.js'), import(FB + 'firebase-auth.js'),
  ]);
  const app = initializeApp(CONFIG.firebase);
  let db;
  const localCache = cacheKind() === 'memory' ? fs.memoryLocalCache() : fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() });
  try { db = fs.initializeFirestore(app, { localCache }); }
  catch { db = fs.getFirestore(app); }
  const auth = au.getAuth(app);
  const admins = CONFIG.adminEmails.map(e => e.toLowerCase());
  const ms = d => d?.toMillis?.() ?? Date.now();
  // onSnapshot that survives errors: a listener that dies (quota, rules re-publish, IndexedDB hiccup) is re-attached
  // with back-off instead of silently freezing the TV for the rest of the night
  // 4th argument (v4, optional): onError(err) — return false to give up instead of re-attaching (e.g. permission-denied never heals by itself)
  const watch = (what, ref, next, onError) => {
    let off = null, stopped = false, tries = 0, timer = null;
    const start = () => {
      off = fs.onSnapshot(ref, snap => { if (tries) syncStatus(true, what); tries = 0; next(snap); }, err => {
        console.error(what + ' listener', err); syncStatus(false, what, err);
        off = null; if (stopped) return;
        if (onError?.(err) === false) return;
        timer = setTimeout(start, Math.min(60000, 3000 * 2 ** tries++));
      });
    };
    start();
    return () => { stopped = true; clearTimeout(timer); off?.(); };
  };
  const sinceNow = (col, cb) => {
    const q = fs.query(fs.collection(db, col), fs.where('createdAt', '>', fs.Timestamp.fromMillis(Date.now() - 3000)), fs.orderBy('createdAt'));
    return watch(col, q, snap => snap.docChanges().forEach(ch => { if (ch.type === 'added') { const d = ch.doc.data({ serverTimestamps: 'estimate' }); cb({ ...d, id: ch.doc.id, createdAt: ms(d.createdAt) }); } }));
  };
  const late = (commit, sec, out) => {   // slow venue Wi-Fi: after `sec` report "queued" (Firestore keeps the write and retries)
    commit.catch(e => console.error('write failed after timeout', e));
    return Promise.race([commit, new Promise(res => setTimeout(() => res({ ...out, queued: true, done: commit }), sec * 1000))]);
  };

  return {
    demo: false,
    async addGuest(g, extras) {
      const { photo, voice, capsule } = normExtras(extras);
      const ref = fs.doc(fs.collection(db, 'guests'));
      const batch = fs.writeBatch(db);
      // v4: "only for the couple" — the public guest document gets an empty message and priv: true; the text goes to the
      // admin-only notes/{id} in the same batch (the rules check that pairing, like photos/voices/capsules)
      const priv = !!g.priv && !!String(g.message || '').trim();
      batch.set(ref, { name: g.name, side: g.side, message: priv ? '' : g.message, ...(priv ? { priv: true } : {}), avatar: g.avatar, activity: g.activity || 'walk', hidden: false,
        hasPhoto: !!photo, hasVoice: !!voice, hasCapsule: !!capsule, createdAt: fs.serverTimestamp() });
      if (priv) batch.set(fs.doc(db, 'notes', ref.id), { message: g.message, createdAt: fs.serverTimestamp() });
      if (photo) batch.set(fs.doc(db, 'photos', ref.id), { data: photo, createdAt: fs.serverTimestamp() });
      if (voice) batch.set(fs.doc(db, 'voices', ref.id), { data: voice.data, mime: voice.mime, createdAt: fs.serverTimestamp() });
      if (capsule) batch.set(fs.doc(db, 'capsules', ref.id), { text: capsule, name: g.name, createdAt: fs.serverTimestamp() });
      return late(batch.commit().then(() => ({ id: ref.id, queued: false })), 10, { id: ref.id });
    },
    subscribeGuests(cb) {
      const q = fs.query(fs.collection(db, 'guests'), fs.orderBy('createdAt'));
      return watch('guests', q, snap => cb(snap.docs.map(d => toGuest(d.id, d.data({ serverTimestamps: 'estimate' })))));
    },
    subscribeSnaps(cb) {
      const q = fs.query(fs.collection(db, 'snaps'), fs.orderBy('createdAt'));
      return watch('snaps', q, snap => cb(snap.docs.map(d => toSnap(d.id, d.data({ serverTimestamps: 'estimate' })))));
    },
    // slot k → doc id "<gid>_<k>". If that slot is already taken (same guest uploading from a 2nd phone),
    // the rules reject the write as an update → move to the next free slot.
    async addSnap(gid, name, data, caption, slot = 0) {
      for (let k = slot; k < CONFIG.snapLimitPerGuest; k++) {
        const ref = fs.doc(db, 'snaps', gid + '_' + k);
        try {
          return await late(fs.setDoc(ref, { gid, name, caption: caption || '', data, hidden: !!CONFIG.snapApproval, createdAt: fs.serverTimestamp() })
            .then(() => ({ id: ref.id, queued: false, slot: k })), 25, { id: ref.id, slot: k });
        } catch (e) {
          if (e.code !== 'permission-denied') throw e;
          const taken = await fs.getDoc(ref).then(d => d.exists()).catch(() => false);
          if (!taken) throw e;
        }
      }
      const e = new Error('snap limit reached'); e.code = 'snap-limit'; throw e;
    },
    async setSnapHidden(id, hidden) { await fs.updateDoc(fs.doc(db, 'snaps', id), { hidden }); },
    async deleteSnap(id) { await fs.deleteDoc(fs.doc(db, 'snaps', id)); },
    // TV: every guest's reactions (1 read per reaction)
    subscribeEmotes(cb) {
      const since = Date.now() - 3000;
      return watch('pulse', fs.collection(db, 'pulse'), snap => snap.docChanges().forEach(ch => {
        if (ch.type === 'removed') return;
        const d = ch.doc.data({ serverTimestamps: 'estimate' }), at = ms(d.createdAt);
        if (at > since) cb({ gid: ch.doc.id, type: d.type, n: d.n, createdAt: at });
      }));
    },
    // phones: only the listed guests (me + a few nearby friends)
    subscribePulse(ids, cb) {
      const since = Date.now() - 3000;
      const offs = ids.map(id => fs.onSnapshot(fs.doc(db, 'pulse', id), snap => {
        if (!snap.exists()) return;
        const d = snap.data({ serverTimestamps: 'estimate' }), at = ms(d.createdAt);
        if (at > since) cb({ gid: id, type: d.type, n: d.n, createdAt: at });   // n lets the caller drop the duplicate (local echo + server ack)
      }, err => console.warn('pulse', err)));
      return () => offs.forEach(f => f());
    },
    async sendEmote(gid, type) { await fs.setDoc(fs.doc(db, 'pulse', gid), { type, n: fs.increment(1), createdAt: fs.serverTimestamp() }, { merge: true }); },
    async getPulseCounts() { const s = await fs.getDocs(fs.collection(db, 'pulse')); const o = {}; s.forEach(d => { o[d.id] = d.data().n || 0; }); return o; },
    subscribeEvents(cb) { return sinceNow('events', cb); },
    async sendEvent(type) { await fs.addDoc(fs.collection(db, 'events'), { type, createdAt: fs.serverTimestamp() }); },
    async getPhoto(id) { const s = await fs.getDoc(fs.doc(db, 'photos', id)); return s.exists() ? safeData(s.data().data) : null; },
    async getNote(id) { const s = await fs.getDoc(fs.doc(db, 'notes', id)); return s.exists() && typeof s.data().message === 'string' ? s.data().message : null; },
    async getVoice(id) { const s = await fs.getDoc(fs.doc(db, 'voices', id)); return s.exists() && safeData(s.data().data, 'audio') ? { data: s.data().data, mime: String(s.data().mime || '') } : null; },
    async getCapsules() {
      if (Date.now() < capsuleOpenAt()) return { locked: true };
      try { const s = await fs.getDocs(fs.collection(db, 'capsules')); return { locked: false, list: s.docs.map(d => ({ id: d.id, ...d.data(), createdAt: ms(d.data().createdAt) })) }; }
      catch (e) { if (e.code === 'permission-denied') return { locked: true }; throw e; }
    },
    async setHidden(id, hidden) { await fs.updateDoc(fs.doc(db, 'guests', id), { hidden }); },
    async updateGuest(id, patch) { await fs.updateDoc(fs.doc(db, 'guests', id), patch); },
    async deleteGuest(id) { return this.deleteMany([id]); },
    async deleteMany(ids) {
      // removes the guest and everything hanging off it — including their snaps (ids are <gid>_<k>, so no read is needed)
      const per = 5 + CONFIG.snapLimitPerGuest, chunk = Math.max(1, Math.floor(480 / per));
      for (let i = 0; i < ids.length; i += chunk) {
        const b = fs.writeBatch(db);
        ids.slice(i, i + chunk).forEach(id => {
          ['guests', 'photos', 'voices', 'capsules', 'pulse'].forEach(c => b.delete(fs.doc(db, c, id)));
          for (let k = 0; k < CONFIG.snapLimitPerGuest; k++) b.delete(fs.doc(db, 'snaps', id + '_' + k));
        });
        await b.commit();
      }
      // v4 documents of the same guests (docs/v4/03 §2.1) — separate batches AFTER the v3.2 ones: if the v4 rules are not published yet
      // (or a read fails) the guests are still gone; what is left is orphans nobody lists
      try { await deleteV4Docs(ids); } catch (e) { console.warn('v4 cleanup failed', e); }
    },
    onAuth(cb) { return au.onAuthStateChanged(auth, u => cb(u ? { email: u.email, isAdmin: !!u.email && admins.includes(u.email.toLowerCase()) } : null)); },
    async signIn() {
      const p = new au.GoogleAuthProvider();
      try { await au.signInWithPopup(auth, p); } catch (e) {
        if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment') await au.signInWithRedirect(auth, p);
        else throw e;
      }
    },
    async signOut() { await au.signOut(auth); },
    // v4 core/docdb.js uses the very same Firestore instance (docs/v4/03 §3)
    backend: { kind: 'firebase', fs, db, auth, au, watch, late },
  };
  // checkins · bingo · translations · anniv · votes (one per poll: the polls list is read once) · thanks cards whose gid matches (where gid in …, 10 at a time)
  async function deleteV4Docs(ids) {
    if (!ids.length) return;
    const polls = (await fs.getDocs(fs.collection(db, 'polls'))).docs.map(d => d.id);
    const cards = new Map();
    for (let i = 0; i < ids.length; i += 10) {
      const s = await fs.getDocs(fs.query(fs.collection(db, 'thanks'), fs.where('gid', 'in', ids.slice(i, i + 10))));
      s.forEach(d => { const g = d.data().gid; if (!cards.has(g)) cards.set(g, []); cards.get(g).push(d.id); });
    }
    const refs = [];
    for (const id of ids) {
      V4_PER_GUEST.forEach(col => refs.push(fs.doc(db, col, id)));
      polls.forEach(p => refs.push(fs.doc(db, 'votes', p + '_' + id)));
      (cards.get(id) || []).forEach(token => refs.push(fs.doc(db, 'thanks', token)));
    }
    for (let i = 0; i < refs.length; i += 480) {
      const b = fs.writeBatch(db);
      refs.slice(i, i + 480).forEach(r => b.delete(r));
      await b.commit();
    }
  }
}

// Which adapter getStore() will hand out — known synchronously (core/docdb.js shows it as ctx.db.backend before the SDK has loaded).
// WP-14 adds 'archive' here and in getStore().
export const storeKind = () => (DEMO ? 'demo' : 'firebase');

// A failed SDK download (venue Wi-Fi blip) must not be cached forever — the next call tries again.
let storePromise;
export function getStore() {
  if (!storePromise) {
    storePromise = DEMO ? Promise.resolve(demoStore()) : Promise.race([
      firebaseStore(),
      new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error('Firebase load timeout'), { code: 'load-timeout' })), 20000)),
    ]).catch(e => { storePromise = null; throw e; });
  }
  return storePromise;
}

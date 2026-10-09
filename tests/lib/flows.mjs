// ============================================================
//  Reusable UI flows. The selectors here are the test contract with public/index.html & village.html.
//  If a work package renames one of them, update it HERE (one place), never inline in suites.
// ============================================================

/** Activity cards render in this order (store.js ACTIVITIES). */
export const ACTIVITY_ORDER = ['walk', 'dance', 'fish', 'chat', 'eat', 'photo'];
/** Remote / phone-bar emote buttons render in this order (store.js EMOTES). */
export const EMOTE_ORDER = ['heart', 'clap', 'dance', 'jump', 'greet'];

/**
 * Sign the guestbook from the welcome screen to the done screen.
 * opts: name, msg (null = leave empty), side ('groom'|'bride'|'both'), photo (fixture file → face analysis),
 *       simple (elder mode), act (activity id), voiceMs (record N ms of fake mic), capsule (text),
 *       lang ('ko'|'en'), kiosk (open kiosk.html), open=false (already on the welcome screen), params (extra URL params)
 * returns { gid } — the new guest id from localStorage (null on the kiosk, which never remembers guests).
 */
export async function signGuest(h, page, opts = {}) {
  const { name = '하객', msg = '결혼 축하해요!', side = null, photo = null, simple = false, act = null,
    voiceMs = 0, capsule = null, lang = null, kiosk = false, open = true, params = {}, priv = false } = opts;
  if (open) await page.goto(h.url(kiosk ? 'kiosk.html' : 'index.html', params));
  if (lang) { await page.click(`.lang [data-lang=${lang}]`); await page.waitForTimeout(150); }
  await page.click(simple ? '#btn-simple' : '#btn-start');
  await page.fill('#in-name', name);
  if (side) await page.click(`#side-seg [data-v=${side}]`);
  if (msg != null) await page.fill('#in-msg', msg);
  if (priv) await page.check('#in-priv');                     // v4: "only for the couple"
  if (voiceMs) { await page.click('#v-rec'); await page.waitForTimeout(voiceMs); await page.click('#v-stop'); await page.waitForTimeout(700); }
  if (capsule) { await page.click('#capsule-box summary'); await page.fill('#in-capsule', capsule); }
  await page.click('#info-next');
  if (photo) {
    await page.setInputFiles('#file', h.fixture(photo));
    await page.waitForSelector('#btn-use:not([hidden])', { timeout: 120000 });
    await page.waitForTimeout(300);
    await page.click('#btn-use');
  } else {
    await page.click('#btn-skip');
  }
  if (!simple) {
    await page.click('#btn-to-act');
    if (act) await page.click(`#acts .act-card:nth-child(${ACTIVITY_ORDER.indexOf(act) + 1})`);
    await page.click('#btn-submit');
  }
  await page.waitForSelector('#s-done.active', { timeout: 20000 });
  return { gid: await myLastGuestId(page) };
}

/** Last guest id this device signed (localStorage wgb_mine), or null. */
export const myLastGuestId = page => page.evaluate(() => {
  try { return JSON.parse(localStorage.getItem('wgb_mine') || '[]').slice(-1)[0]?.id || null; } catch { return null; }
});

/** Open the village the way a guest does after signing (the done screen's "see me in the village" link). */
export async function openMyVillage(h, page) {
  const href = await page.getAttribute('#link-village', 'href');
  await page.goto(new URL(href, page.url()).href);
  await page.waitForTimeout(2500);
  return href;
}

/** Number of villagers the TV HUD shows. */
export const villageCount = async page => parseInt((await page.textContent('#count-n')) || '0', 10);

/** Send a wedding event (bouquet | group | fireworks) the way admin.html does, from inside `page`. */
export const sendEvent = (h, page, type) => h.store(page, (s, t) => s.sendEvent(t), type);

/** Add n demo guests directly through the store (fast; no UI). Returns their ids. */
export const addGuests = (h, page, n, prefix = '하객') => h.store(page, async (s, a) => {
  const ids = [];
  for (let i = 0; i < a.n; i++) ids.push((await s.addGuest({ name: a.prefix + (i + 1), side: 'both', message: '축하해요 ' + (i + 1), avatar: {}, activity: 'walk' }, null)).id);
  return ids;
}, { n, prefix });

/** Listen on the demo BroadcastChannel inside `page` and record messages of kind k → window.__bc[k]. */
export const tapDemoChannel = page => page.evaluate(() => {
  window.__bc = {};
  const ch = new BroadcastChannel('wgb-demo');
  ch.onmessage = e => { const m = e.data || {}; (window.__bc[m.k] = window.__bc[m.k] || []).push(m.v ?? null); };
  window.__bcChannel = ch;
});

// ============================================================
//  WP-20 tv — docs/v4/wp/WP-20-tv.md · 04-testing §4.1 (S1–S9) + A1–A8
//  The village TV: a frame by the lake playing the YouTube link the couple saved in ⚙️ settings.
//  YouTube itself is never contacted: every context routes www.youtube-nocookie.com to a stub page that records the
//  player commands it receives (the same postMessage format the real player understands). Real playback, autoplay
//  policies, live streams and sound are manual QA (WP-20 §6).
// ============================================================
import { on, off, adminPage, setFlag, setCfg, setLive, expectClean, featureState, footprint } from '../lib/v4.mjs';

const ID = 'tv';
export const meta = { title: 'tv: the village TV plays the saved YouTube link · one press = sound · two presses = full screen', timeout: 420000, tags: ['slow'] };

const MIN_FPS = +(process.env.PERF_MIN_FPS || 24);
const VIDEO = 'dQw4w9WgXcQ';
const STUB = '<!doctype html><html><body style="margin:0;background:#1b4d7a;color:#fff;font:16px sans-serif;display:grid;place-items:center;height:100vh">'
  + '<p>STUB PLAYER</p><script>window.cmds=[];addEventListener("message",e=>{try{const m=JSON.parse(e.data);if(m.event==="command")cmds.push(m.func)}catch{}})</script></body></html>';
const HANGUL = /[ㄱ-힝]/;

/** a device whose YouTube requests land on the stub */
async function device(h, preset) {
  const ctx = await h.context(preset);
  await ctx.route('https://www.youtube-nocookie.com/**', r => r.fulfill({ contentType: 'text/html', body: STUB }));
  return ctx;
}
/** poll a page predicate (sync or async — waitForFunction would take an async function's promise as "true") */
const until = async (page, fn, arg, ms = 8000) => { const t0 = Date.now(); do { if (await page.evaluate(fn, arg).catch(() => false)) return true; await page.waitForTimeout(100); } while (Date.now() - t0 < ms); return false; };
const screenBox = page => page.evaluate(() => { const r = document.querySelector('#wdom .f-tv-screen')?.getBoundingClientRect(); return r ? { x: r.x, y: r.y, w: r.width, h: r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2 } : null; });
const frameSrc = page => page.evaluate(() => document.querySelector('#wdom .f-tv-frame')?.src || null);
const stubCmds = async page => { const f = page.frames().find(x => x.url().startsWith('https://www.youtube-nocookie.com/')); return f ? f.evaluate(() => window.cmds.slice()) : null; };
const fsIsScreen = page => page.evaluate(() => !!document.fullscreenElement?.classList.contains('f-tv-screen'));
/** village:tap events seen since countTaps() was first called on this page */
const taps = page => page.evaluate(async () => { if (window.__taps == null) { window.__taps = 0; (await import('/js/core/bus.js')).on('village:tap', () => { window.__taps++; }); } return window.__taps; });

export default async (h) => {
  h.allowErrors(/youtube-nocookie/);                       // the stub page has no favicon etc.

  // ---------------------------------------------------------------- A1 the link reader (core/ui.js youtubeSource)
  await h.step('A1 youtubeSource: six link shapes → one video id · two channel shapes · anything else → null', async () => {
    const p = await h.page('desktop', { tag: 'parse' });
    await p.goto(h.url('admin.html'));
    const r = await p.evaluate(async id => {
      const { youtubeSource: y } = await import('/js/core/ui.js');
      const ch = 'UC' + 'a'.repeat(22);
      return {
        videos: [id, `https://youtu.be/${id}?t=3`, `https://www.youtube.com/watch?v=${id}&list=x`, `youtube.com/live/${id}?feature=share`, `https://m.youtube.com/shorts/${id}`, `https://www.youtube-nocookie.com/embed/${id}`].map(s => y(s)?.video ?? null),
        channels: [ch, `https://www.youtube.com/channel/${ch}/live`].map(s => y(s)?.channel ?? null),
        bad: ['', '   ', 'hello', 'https://vimeo.com/123', 'https://youtube.com/@handle', `https://evil.com/watch?v=${id}`, 'javascript:alert(1)', `https://youtu.be/${id}x`, 'https://youtube.com/watch?v=short'].map(s => y(s)),
      };
    }, VIDEO);
    h.eq('A1 six video shapes → the same id', r.videos, Array(6).fill(VIDEO));
    h.eq('A1 channel id and channel link → the channel', r.channels, Array(2).fill('UC' + 'a'.repeat(22)));
    h.eq('A1 handles, other sites, scripts, wrong lengths → null', r.bad, Array(9).fill(null));
    const f = await p.evaluate(async () => { const u = await import('/js/core/ui.js'); try { u.youtubeFrame({ video: 'bad' }); return 'made'; } catch (e) { return e.code; } });
    h.eq('A1 youtubeFrame refuses anything youtubeSource did not produce', f, 'invalid-argument');
  });

  // ---------------------------------------------------------------- S1 off
  await h.step('S1 off: no trace on the TV village (link saved) or the admin page; the village still works', async () => {
    const ctx = await device(h, 'tv');
    const tv = await h.page(ctx, { tag: 'off' });
    await tv.goto(h.url('village.html', { ff: off(ID), seed: 12, time: 'day' }));
    const admin = await adminPage(h, ctx, { params: { ff: off(ID) } });
    await setCfg(h, admin, ID, { url: VIDEO });
    await expectClean(h, admin, ID, 'S1 admin');
    await tv.bringToFront(); await tv.waitForTimeout(1200);
    await expectClean(h, tv, ID, 'S1 TV village');
    h.check('S1 no player anywhere', !(await tv.$('iframe')));
    h.check('S1 the village works (count)', /^\d+$/.test(await tv.textContent('#count-n')));
    await ctx.close();
  });

  // ---------------------------------------------------------------- A2–A5, A7 on the venue TV
  await h.step('A2–A5 TV: appears on save without a reload · muted autoplay · press = sound · two presses = full screen · quiet mode mutes', async () => {
    const ctx = await device(h, 'tv');
    const tv = await h.page(ctx, { tag: 'tv' });
    await tv.goto(h.url('village.html', { ff: on(ID), seed: 30, time: 'day' }));
    await tv.waitForTimeout(1500); await tv.mouse.click(300, 1000); await tv.waitForTimeout(400);   // the first click hides the start hint
    h.check('A2 no link yet → the TV stands with "coming up soon", no player', await until(tv, () => document.querySelector('#wdom .f-tv-soon')?.textContent.includes('곧 방송이 시작돼요')) && !(await tv.$('#wdom iframe')));
    await h.shot(tv, 'tv-0-soon');
    const admin = await adminPage(h, ctx, { params: { ff: on(ID) } });
    await setCfg(h, admin, ID, { url: `https://youtu.be/${VIDEO}` });
    await tv.bringToFront();
    h.check('A2 saved → the TV appears without a reload', await until(tv, () => !!document.querySelector('#wdom .f-tv-frame')));
    const src = new URL(await frameSrc(tv));
    h.eq('A2 the player is youtube-nocookie embed/<id>', src.origin + src.pathname, `https://www.youtube-nocookie.com/embed/${VIDEO}`);
    h.eq('A2 …muted autoplay, inline', ['autoplay', 'mute', 'playsinline'].map(k => src.searchParams.get(k)), ['1', '1', '1']);
    const box = await screenBox(tv);
    h.check('A2 the screen sits by the lake, top right, 16:9, fully on screen', box && box.x > 960 && box.y < 400 && Math.abs(box.w / box.h - 76 / 43) < 0.05 && box.x + box.w <= 1920 && box.y >= 0, JSON.stringify(box));
    await tv.waitForTimeout(800);                                                 // the stub loads
    await h.shot(tv, 'tv-1-venue');

    // A3 one press = sound on · again = off (waits 0.36 s for a second press)
    const t0 = await taps(tv);
    await tv.mouse.click(box.cx, box.cy);
    h.check('A3 one press → unMute sent to the player', await (async () => { for (let i = 0; i < 30; i++) { const c = await stubCmds(tv); if (c?.includes('unMute')) return true; await tv.waitForTimeout(100); } return false; })());
    h.eq('A3 …and the badge says the sound is on', await tv.textContent('#wdom .f-tv-badge'), '🔊 소리 켜짐');
    await tv.mouse.click(box.cx, box.cy); await tv.waitForTimeout(600);
    h.eq('A3 a second press → mute', (await stubCmds(tv)).slice(-1)[0], 'mute');
    h.eq('A7 presses on the TV are not village taps', await taps(tv), t0);

    // A4 two presses = full screen (the box itself) · two again = back
    const before = (await stubCmds(tv)).length;
    await tv.mouse.dblclick(box.cx, box.cy);
    h.check('A4 two presses → the TV box goes full screen', await until(tv, () => !!document.fullscreenElement?.classList.contains('f-tv-screen'), null, 3000));
    await tv.waitForTimeout(500);
    h.eq('A4 …without toggling the sound', (await stubCmds(tv)).length, before);
    await h.shot(tv, 'tv-2-fullscreen');
    const full = await screenBox(tv);
    h.check('A4 full screen fills the screen', full && full.w >= 1900 && full.h >= 1060, JSON.stringify(full));
    await tv.mouse.dblclick(960, 540);
    h.check('A4 two presses again → back in the village', await until(tv, () => !document.fullscreenElement, null, 3000));

    // A5 quiet mode mutes the venue screen (only a person turns it back on)
    await tv.mouse.click(box.cx, box.cy); await tv.waitForTimeout(700);
    h.eq('A5 (sound on first)', (await stubCmds(tv)).slice(-1)[0], 'unMute');
    await setLive(h, admin, { quiet: true }); await tv.bringToFront();
    h.check('A5 quiet mode on → mute', await (async () => { for (let i = 0; i < 40; i++) { if ((await stubCmds(tv))?.slice(-1)[0] === 'mute') return true; await tv.waitForTimeout(100); } return false; })());
    h.eq('A5 …badge back to "tap for sound"', await tv.textContent('#wdom .f-tv-badge'), '🔇 누르면 소리');
    await setLive(h, admin, { quiet: false });

    // A2 a channel link → the channel's live stream · A7 clearing the link removes the TV
    await setCfg(h, admin, ID, { url: 'https://www.youtube.com/channel/UC' + 'b'.repeat(22) + '/live' }); await tv.bringToFront();
    h.check('A2 channel link → embed/live_stream?channel=', await until(tv, () => /\/embed\/live_stream\?.*channel=UCb{22}/.test(document.querySelector('#wdom .f-tv-frame')?.src || '')));
    h.eq('A7 one TV only (the old one is gone)', await tv.$$eval('#wdom > [data-f="tv"]', n => n.length), 1);
    await setCfg(h, admin, ID, { url: '' }); await tv.bringToFront();
    h.check('A7 link cleared → the player is gone, the TV says "coming up soon" again', await until(tv, () => !document.querySelector('#wdom iframe') && !!document.querySelector('#wdom .f-tv-soon')));
    h.eq('A7 …one TV box in the world layer (the old one is gone)', await tv.$$eval('#wdom > *', n => n.length), 1);

    // A6 autoplay off → the venue TV shows a poster first
    await setCfg(h, admin, ID, { url: VIDEO, autoplay: false }); await tv.bringToFront();
    h.check('A6 autoplay off → a "click to play" poster, no player yet', await until(tv, () => !!document.querySelector('#wdom .f-tv-poster')) && !(await tv.$('#wdom iframe')));
    h.eq('A6 …in the TV wording', (await tv.textContent('#wdom .f-tv-poster')).trim(), '▶ 클릭해서 재생');
    const pb = await screenBox(tv);
    await tv.mouse.click(pb.cx, pb.cy);
    h.check('A6 click → the player starts', await until(tv, () => !!document.querySelector('#wdom .f-tv-frame')));
    await setCfg(h, admin, ID, { url: VIDEO, autoplay: true });
    await ctx.close();
  });

  // ---------------------------------------------------------------- A6 guests' phones
  await h.step('A6 phone village: poster → tap plays · 📺 brings the camera to the TV · phone: false hides it', async () => {
    const ctx = await device(h, 'phone');
    const admin = await adminPage(h, ctx, { params: { ff: on(ID) } });
    await setCfg(h, admin, ID, { url: VIDEO, autoplay: true, phone: true });
    const p = await h.page(ctx, { tag: 'phone' });
    await p.goto(h.url('village.html', { ff: on(ID), seed: 16, time: 'day' })); await p.waitForTimeout(1800);
    h.check('A6 phone: the TV waits behind a poster (autoplay is for the venue screen only)', !!(await p.$('#wdom .f-tv-poster')) && !(await p.$('#wdom iframe')));
    h.eq('A6 …"tap to watch"', (await p.textContent('#wdom .f-tv-poster')).trim(), '▶ 눌러서 보기');
    const act = await p.$('#mremote [data-fa="f-tv"]');
    h.check('A6 the 📺 action is on the bottom bar', !!act && await act.isVisible());
    await act.click(); await p.waitForTimeout(2500);
    const b = await screenBox(p), vp = p.viewportSize();
    h.check('A6 📺 → the camera shows the TV', b && b.x >= 0 && b.y >= 0 && b.x + b.w <= vp.width && b.y + b.h <= vp.height, JSON.stringify(b));
    await p.touchscreen.tap(b.cx, b.cy);
    h.check('A6 tap the poster → the player starts (muted)', await until(p, () => /mute=1/.test(document.querySelector('#wdom .f-tv-frame')?.src || '')));
    await p.waitForTimeout(500);
    const r = await h.layoutReport(p);
    h.check('S8 phone: no overlaps · no sideways scroll · tap targets', r.overlaps.length === 0 && !r.hscroll && r.small.length === 0, JSON.stringify(r).slice(0, 400));
    await h.shot(p, 'tv-3-phone');
    await setCfg(h, admin, ID, { phone: false }); await p.bringToFront();
    h.check('A6 phone: false → the TV leaves the phones', await until(p, () => !document.querySelector('#wdom [data-f="tv"]')));
    h.check('A6 …and so does the 📺 action', await until(p, () => !document.querySelector('#mremote [data-fa="f-tv"]')));
    await ctx.close();
  });

  // ---------------------------------------------------------------- admin ⚙️ settings row
  await h.step('S2 admin ⚙️: paste a link → it is read at once · save → the TV · English stays out of the admin table', async () => {
    const ctx = await device(h, 'desktop');
    const tv = await h.page(ctx, { tag: 'admin-tv' });
    await tv.goto(h.url('village.html', { ff: on(ID), seed: 8, time: 'day', host: 1 }));
    const a = await adminPage(h, ctx, { params: { ff: on(ID) } });
    await a.click('#atabs [data-tab="settings"]');
    const row = await a.waitForSelector('.frow[data-fid="tv"] details.fmore:not([hidden])', { timeout: 8000 }).catch(() => null);
    h.check('S2 the tv row has a settings box', !!row);
    await a.click('.frow[data-fid="tv"] details.fmore summary');
    const read = async s => { await a.fill('.fbox[data-f="tv"] .f-tv-url', s); return a.textContent('.fbox[data-f="tv"] .f-tv-parsed'); };
    h.eq('S2 a video link is read', await read(`youtube.com/live/${VIDEO}`), `✓ 유튜브 영상 (${VIDEO})`);
    h.eq('S2 a channel is read', await read('UC' + 'c'.repeat(22)), '✓ 채널의 라이브 방송');
    h.eq('S2 a wrong link is called out', await read('https://youtube.com/@ourwedding'), '유튜브 주소를 알아볼 수 없어요');
    h.check('S2 …and preview is disabled for it', await a.isDisabled('.fbox[data-f="tv"] .f-tv-prev'));
    await a.click('.fbox[data-f="tv"] .f-tv-save');
    h.eq('S2 saving a wrong link is refused', await a.textContent('.fbox[data-f="tv"] .f-tv-msg'), '유튜브 주소를 알아볼 수 없어요');
    await read(`https://youtu.be/${VIDEO}`);
    await a.click('.fbox[data-f="tv"] .f-tv-prev');
    h.check('S2 preview → a player in the admin page, not autoplaying', await until(a, () => /autoplay=0/.test(document.querySelector('.fbox[data-f="tv"] .f-tv-prevframe')?.src || '')));
    await a.click('.fbox[data-f="tv"] .f-tv-save');
    h.check('S2 save → "saved"', await until(a, () => document.querySelector('.fbox[data-f="tv"] .f-tv-msg')?.textContent.startsWith('저장했어요')));
    await a.waitForTimeout(400);
    const r = await h.layoutReport(a);
    h.check('S8 admin ⚙️ (desktop): no overlaps · tap targets', r.overlaps.length === 0 && !r.hscroll && r.small.length === 0, JSON.stringify(r).slice(0, 400));
    await h.shot(a, 'tv-4-admin');
    await tv.bringToFront();
    h.check('S2 the TV village picked it up', await until(tv, () => !!document.querySelector('#wdom .f-tv-frame')));
    await ctx.close();
  });

  // ---------------------------------------------------------------- S3 hot toggle
  await h.step('S3 hot toggle (ready = on by default): admin off (while full screen) → gone, no trace, full screen left · on again · default again', async () => {
    const ctx = await device(h, 'tv');
    const tv = await h.page(ctx, { tag: 'hot' });
    await tv.goto(h.url('village.html', { seed: 20, time: 'day' }));
    await tv.waitForTimeout(1200); await tv.mouse.click(300, 1000);
    const admin = await adminPage(h, ctx);
    await setCfg(h, admin, ID, { url: VIDEO, autoplay: true, phone: true });
    await tv.bringToFront();
    h.check('S3 default (ready): on without any flag — the saved link plays without a reload', await until(tv, () => !!document.querySelector('#wdom .f-tv-frame')));
    const box = await screenBox(tv);
    await tv.mouse.dblclick(box.cx, box.cy);
    h.check('S3 (full screen first)', await until(tv, () => !!document.fullscreenElement, null, 3000));
    await setFlag(h, admin, ID, false); await tv.bringToFront();
    h.check('S3 off: the TV is gone', await until(tv, () => !document.querySelector('[data-f="tv"]')));
    h.check('S3 off: full screen is left', await until(tv, () => !document.fullscreenElement, null, 3000));
    await tv.waitForTimeout(300);
    await expectClean(h, tv, ID, 'S3 off');
    const st = await featureState(tv, ID);
    h.eq('S3 off: nothing registered', st && st.live, { listeners: 0, timers: 0, raf: 0, watchers: 0, bus: 0 });
    await setFlag(h, admin, ID, true); await tv.bringToFront();
    h.check('S3 on again: the TV is back (setup twice is safe)', await until(tv, () => !!document.querySelector('#wdom .f-tv-frame')));
    await setFlag(h, admin, ID, false); await tv.bringToFront();
    h.check('S3 (off once more)', await until(tv, () => !document.querySelector('[data-f="tv"]')));
    await setFlag(h, admin, ID, null); await tv.bringToFront();
    h.check('S3 back to the default → on', await until(tv, () => !!document.querySelector('#wdom .f-tv-frame')));
    await ctx.close();
  });

  // ---------------------------------------------------------------- S4 phases and pages
  await h.step('S4 in the pre and live phases (Patrick 2026-10-08: visible before the wedding) · never on the guest page or the kiosk · the admin row in every phase', async () => {
    const ctx = await device(h, 'tv');
    const admin = await adminPage(h, ctx, { params: { ff: on(ID) } });
    // pre, no link yet: the set stands with "곧 방송이 시작돼요" — next to the D-day village (dday is on by default in pre)
    const pre = await h.page(ctx, { tag: 'phase-pre-soon' });
    await pre.goto(h.url('village.html', { phase: 'pre', seed: 6, time: 'day' }));
    h.check('S4 pre (no ?ff, the default): the TV stands with "📺 곧 방송이 시작돼요"', await until(pre, () => /곧 방송이 시작돼요/.test(document.querySelector('#wdom .f-tv-soon')?.textContent || ''), null, 10000));
    await pre.mouse.click(300, 1000).catch(() => {}); await pre.waitForTimeout(600);
    const lr = await h.layoutReport(pre);
    h.check('S4 pre: no overlaps with the D-day panel, the QR or anything else', !lr.overlaps.length, lr.overlaps.join(' | '));
    await h.shot(pre, 'tv-pre-soon');
    await pre.close();
    await setCfg(h, admin, ID, { url: VIDEO });
    const pre2 = await h.page(ctx, { tag: 'phase-pre-video' });
    await pre2.goto(h.url('village.html', { ff: on(ID), phase: 'pre', seed: 6 }));
    h.check('S4 pre with a link: the video frame is there before the wedding too', await until(pre2, () => !!document.querySelector('#wdom .f-tv-frame'), null, 10000));
    await pre2.close();
    for (const phase of ['after', 'anniversary']) {
      const p = await h.page(ctx, { tag: 'phase-' + phase });
      await p.goto(h.url('village.html', { ff: on(ID), phase, seed: 6 })); await p.waitForTimeout(1200);
      h.check(`S4 ${phase}: not loaded, no TV`, !(await featureState(p, ID))?.on && !(await p.$('#wdom [data-f="tv"]')));
      await p.close();
    }
    const g = await h.page(ctx, { tag: 'guest' });
    await g.goto(h.url('index.html', { ff: on(ID) })); await g.waitForTimeout(800);
    await expectClean(h, g, ID, 'S4 guest page');
    const k = await h.page(ctx, { tag: 'kiosk' });
    await k.goto(h.url('kiosk.html', { ff: on(ID) })); await k.waitForTimeout(800);
    await expectClean(h, k, ID, 'S4 kiosk');
    const a2 = await adminPage(h, ctx, { params: { ff: on(ID), phase: 'pre' } });
    h.check('S4 admin in the pre phase: loaded (the couple sets the link ahead of time)', await until(a2, async id => (await (await import('/js/core/features.js')).featureStates()).find(s => s.id === id)?.on === true, ID));
    await ctx.close();
  });

  // ---------------------------------------------------------------- S6 English
  await h.step('S6 English: the poster, the badge and the action have no Hangul', async () => {
    const ctx = await device(h, 'phone');
    const admin = await adminPage(h, ctx, { params: { ff: on(ID) } });
    await setCfg(h, admin, ID, { url: VIDEO, phone: true });
    const p = await h.page(ctx, { tag: 'en' });
    await p.goto(h.url('village.html', { ff: on(ID), seed: 6, lang: 'en' }));
    await p.evaluate(() => localStorage.setItem('wgb_lang', 'en')); await p.reload(); await p.waitForTimeout(1500);
    const texts = [await p.textContent('#wdom .f-tv-poster'), await p.textContent('#mremote [data-fa="f-tv"]')].join(' | ');
    h.check('S6 poster and action in English', !HANGUL.test(texts) && texts.includes('Tap to watch'), texts);
    await p.click('#mremote [data-fa="f-tv"]'); await p.waitForTimeout(2200);
    const b = await screenBox(p); await p.touchscreen.tap(b.cx, b.cy);
    await until(p, () => !!document.querySelector('#wdom .f-tv-badge'));
    const badge = await p.textContent('#wdom .f-tv-badge');
    h.check('S6 badge in English', !HANGUL.test(badge) && badge.includes('Tap for sound'), badge);
    await ctx.close();
  });

  // ---------------------------------------------------------------- A8 frame rate with the TV playing
  await h.step(`A8 perf: 50 villagers, night, the TV playing → ≥ ${MIN_FPS} fps`, async () => {
    const ctx = await device(h, 'tv');
    const admin = await adminPage(h, ctx, { params: { ff: on(ID) } });
    await setCfg(h, admin, ID, { url: VIDEO, autoplay: true });
    await admin.close();
    const tv = await h.page(ctx, { tag: 'fps', fps: true });
    await tv.goto(h.url('village.html', { ff: on(ID), seed: 50, time: 'night' }));
    await until(tv, () => !!document.querySelector('#wdom .f-tv-frame'));
    await tv.waitForTimeout(3000);
    await tv.evaluate(() => window.__fps.reset()); await tv.waitForTimeout(5000);
    const m = await tv.evaluate(() => ({ fps: window.__fps.frames / ((performance.now() - window.__fps.since) / 1000), long: window.__fps.long }));
    h.check(`A8 ≥ ${MIN_FPS} fps with the TV on`, m.fps >= MIN_FPS, `${m.fps.toFixed(1)} fps, ${m.long} long tasks`);
    await h.shot(tv, 'tv-5-night');
    await ctx.close();
  });
};

// ============================================================
//  core/ui.js — 기능끼리 공유하는 도우미 (docs/v4/02-contracts.md §11)
//
//  기능(features/*)이 import 할 수 있는 코어 모듈은 이 파일 전체와 02 §1.1 표의 것들뿐입니다.
//  여기 함수는 전부 부수효과가 없거나(순수), 호출한 쪽이 결과를 직접 받습니다. 모듈을 불러온다고 아무 일도 일어나지 않습니다.
// ============================================================
import { CONFIG } from '../config.js';
import { getSprite, SPRITE_W, SPRITE_H } from '../avatar.js';
import { safeData } from '../store.js';
import { qrcode } from '../vendor/qrcode.mjs';

/** 사진 줄이기 (≤ 850KB JPEG) — snaps.js 의 구현을 그대로 재사용. compressImage(file, maxSide, q?) → { data, thumb } */
export { compressImage } from '../snaps.js';

const bad = (msg, code = 'invalid-argument') => Object.assign(new Error(msg), { code });

// ---------- 하객 코드 · 언어 · 난수 ----------

const CODE_CHARS = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';   // 31자 (0 O 1 I L 제외)

/** FNV-1a 32bit (문자열 → 부호 없는 정수). */
function fnv32(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h;
}

/**
 * 4글자 하객 코드. 입장권·카드·빙고가 같은 값을 씁니다 (같은 하객 = 어느 기기에서나 같은 코드).
 * ⚠️ 인쇄물에 찍히는 값이라 알고리즘을 바꾸면 안 됩니다 — core-units 가 고정값으로 지킵니다.
 */
export function guestCode(gid) {
  let n = fnv32(String(gid ?? '')), out = '';
  for (let i = 0; i < 4; i++) { out += CODE_CHARS[n % 31]; n = Math.floor(n / 31); }
  return out;
}

/** 한글이 하나라도 있으면 'ko', 아니면 'en'. */
export function detectLang(text) {
  return /[\u1100-\u11ff\u3130-\u318f\ua960-\ua97f\uac00-\ud7af\ud7b0-\ud7ff]/.test(String(text ?? '')) ? 'ko' : 'en';
}

/** 결정적 난수 — village.js 의 seeded() 와 같은 알고리즘(같은 시드 → 같은 수열). 0 이상 1 미만. */
export function seeded(seed) {
  let a = 0;
  for (const ch of String(seed)) a = (Math.imul(a, 31) + ch.charCodeAt(0)) | 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- 그림 ----------

/**
 * 아바타(또는 getSprite 가 돌려준 프레임 묶음 — `couple:sprites` 의 groom/bride) → 정수 배율로 키운 캔버스.
 * 픽셀이 뭉개지지 않게 보간을 끄고 image-rendering: pixelated.
 */
export function spriteCanvas(avatar, frame = 'idle', scale = 1) {
  const frames = (avatar && avatar.idle && typeof avatar.idle.getContext === 'function') ? avatar : getSprite(avatar);
  const src = frames[frame] || frames.idle;
  const k = Math.max(1, Math.round(scale) || 1);
  const c = document.createElement('canvas'); c.width = SPRITE_W * k; c.height = SPRITE_H * k;
  const g = c.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(src, 0, 0, c.width, c.height);
  c.style.imageRendering = 'pixelated';
  return c;
}

/**
 * QR 코드 캔버스 (vendor/qrcode.mjs). 한 모듈 = scale 픽셀, 둘레 여백 pad 모듈(흰색), 어두운 점은 #2b2033.
 * 다른 캔버스에 그릴 때는 imageSmoothingEnabled=false 로 (scale ≥ 4 권장).
 */
export function qrCanvas(url, { ecc = 'M', scale = 1, pad = 2 } = {}) {
  const q = qrcode(0, ['L', 'M', 'Q', 'H'].includes(ecc) ? ecc : 'M'); q.addData(String(url)); q.make();
  const n = q.getModuleCount(), px = Math.max(1, Math.round(scale) || 1), p = Math.max(0, Math.round(pad));
  const c = document.createElement('canvas'); c.width = c.height = (n + p * 2) * px;
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.fillStyle = '#2b2033';
  for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (q.isDark(r, k)) g.fillRect((k + p) * px, (r + p) * px, px, px);
  c.style.imageRendering = 'pixelated';
  return c;
}

// ---------- 글자 ----------

const FONT = "Galmuri11, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif";

/** Galmuri 글꼴이 불러와질 때까지 기다림 (캔버스에 글자를 그리기 전에). 실패·지연(3초)해도 resolve — 대체 글꼴로 그려집니다. */
export async function ensureFonts() {
  const fonts = typeof document !== 'undefined' ? document.fonts : null;
  if (!fonts || typeof fonts.load !== 'function') return;
  let timer;
  try {
    await Promise.race([
      Promise.all(['16px Galmuri11', 'bold 16px Galmuri11', '16px Galmuri9'].map(f => fonts.load(f))),
      new Promise(res => { timer = setTimeout(res, 3000); }),
    ]);
  } catch {} finally { clearTimeout(timer); }
}

/**
 * 캔버스에 픽셀 글꼴 한 줄. y = 글자 윗선(top 기준 — 레이아웃 잡기 쉽게).
 * maxWidth 가 있으면 글자 크기를 1px씩 줄여(minSize 까지) 맞추고, 그래도 넘치면 가로로 눌러서 맞춥니다. 실제로 쓴 크기를 돌려줍니다.
 */
export function canvasText(g, text, x, y, { size = 16, bold = false, color = '#2b2033', align = 'left', maxWidth = 0, minSize = 8 } = {}) {
  const s0 = String(text ?? '');
  const font = px => `${bold ? 'bold ' : ''}${px}px ${FONT}`;
  let s = size;
  g.save();
  g.textBaseline = 'top'; g.textAlign = align; g.fillStyle = color; g.font = font(s);
  if (maxWidth > 0) while (s > minSize && g.measureText(s0).width > maxWidth) { s -= 1; g.font = font(s); }
  if (maxWidth > 0 && g.measureText(s0).width > maxWidth) g.fillText(s0, x, y, maxWidth); else g.fillText(s0, x, y);
  g.restore();
  return s;
}

// ---------- 날짜 ----------

/** CONFIG.schedule.utcOffset('-04:00') → 밀리초. 형식이 틀리면 0 (UTC). */
function venueOffsetMs() {
  const m = /^([+-])(\d{2}):?(\d{2})$/.exec(String(CONFIG.schedule?.utcOffset ?? ''));
  return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) * 60e3 : 0;
}
const dateFormats = new Map();

/**
 * 날짜 표시. **식장 현지 시각**(CONFIG.schedule.utcOffset) 기준 — 한국에서 나중에 봐도 "결혼식 날 2:05 PM" 으로 같게 보이도록.
 * ko: 2027년 4월 10일 · 오후 2:05   /   en: Apr 10, 2027 · 2:05 PM        style = 'date' | 'time' | 'datetime'
 */
export function fmtDate(ms, lang = 'ko', style = 'datetime') {
  const t = Number(ms); if (!Number.isFinite(t)) return '';
  const ko = lang !== 'en', key = (ko ? 'ko' : 'en') + '|' + style;
  let f = dateFormats.get(key);
  if (!f) {
    const d = { year: 'numeric', month: ko ? 'long' : 'short', day: 'numeric' }, tm = { hour: 'numeric', minute: '2-digit' };
    const opts = style === 'date' ? d : style === 'time' ? tm : { ...d, ...tm };
    f = new Intl.DateTimeFormat(ko ? 'ko-KR' : 'en-US', { ...opts, timeZone: 'UTC' });
    dateFormats.set(key, f);
  }
  return f.format(new Date(t + venueOffsetMs())).replace(/[\u202f\u00a0]/g, ' ');   // ICU 버전마다 다른 공백 문자를 통일
}

// ---------- 저장 · 공유 ----------

const safeName = n => String(n ?? '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 120) || 'download';
function clickDownload(name, href) {
  const a = document.createElement('a'); a.download = safeName(name); a.href = href; a.rel = 'noopener'; a.hidden = true;
  document.body.appendChild(a); a.click(); a.remove();
}

/** data: URL 저장. 검증된 base64 이미지·오디오(store.safeData)만 허용 — 아니면 아무것도 하지 않고 false. */
export function downloadDataURL(name, dataURL) {
  if (!(safeData(dataURL, 'image') || safeData(dataURL, 'audio'))) return false;
  clickDownload(name, dataURL);
  return true;
}

/** Blob 저장 (우리가 만든 파일 — ZIP·ICS·PNG). 60초 뒤 주소를 거둡니다. */
export function downloadBlob(name, blob) {
  if (typeof Blob === 'undefined' || !(blob instanceof Blob)) return false;
  const u = URL.createObjectURL(blob);
  clickDownload(name, u);
  setTimeout(() => URL.revokeObjectURL(u), 60000);
  return true;
}

/** 검증된 base64 이미지 data: URL → Blob (동기 — 공유 시트는 "사용자가 방금 누른" 동안에만 열려서 중간에 await 를 끼우지 않음). */
function imageBlob(dataURL) {
  const url = safeData(dataURL, 'image');
  if (!url) throw bad('shareImage: dataURL must be a base64 image');
  const type = url.slice(5, url.indexOf(';')), bin = atob(url.slice(url.indexOf(',') + 1)), u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return new Blob([u8], { type });
}

/**
 * 이미지 공유: 파일 공유가 되는 기기(iOS·Android)는 공유 시트, 아니면 다운로드.
 * 반환: 'shared' | 'downloaded' | 'cancelled' (사용자가 공유 시트를 닫음 — 오류가 아님). 이미지가 아니면 reject(invalid-argument).
 * 반드시 사용자가 누른 직후(클릭 핸들러)에서 부르세요.
 */
export async function shareImage({ dataURL, filename = 'image.png', title = '', text = '' } = {}) {
  const blob = imageBlob(dataURL), name = safeName(filename);
  let file = null;
  try { file = new File([blob], name, { type: blob.type }); } catch {}
  try {
    if (file && typeof navigator.share === 'function' && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title, text });
      return 'shared';
    }
  } catch (e) {
    if (e?.name === 'AbortError') return 'cancelled';
    // 그 밖의 오류(권한·지원 안 함)는 다운로드로 대신합니다
  }
  downloadBlob(name, blob);
  return 'downloaded';
}

// ---------- 캘린더 파일 (.ics, RFC 5545 최소) ----------

const icsStamp = ms => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');   // 20270410T140000Z
const icsText = s => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r\n|\r|\n/g, '\\n');
const utf8Len = cp => (cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4);

/** 75 옥텟(UTF-8 바이트)을 넘는 줄은 CRLF + 공백 1칸으로 접습니다 (한글처럼 여러 바이트 글자의 중간은 자르지 않음). */
function icsFold(line) {
  const out = []; let cur = '', bytes = 0, limit = 75;
  for (const ch of line) {
    const b = utf8Len(ch.codePointAt(0));
    if (bytes + b > limit) { out.push(cur); cur = ''; bytes = 0; limit = 74; }   // 이어지는 줄은 맨 앞 공백이 1바이트
    cur += ch; bytes += b;
  }
  out.push(cur);
  return out.join('\r\n ');
}

/**
 * 캘린더 파일 텍스트. start/end = 밀리초(또는 Date·ISO 문자열) — UTC 로 기록. end 가 없거나 start 이전이면 start + 2시간.
 * 같은 일정을 다시 받으면 캘린더 앱이 중복 대신 갱신하도록 UID 는 (시작 시각 + 제목)에서 만듭니다.
 * 저장은 downloadBlob('wedding.ics', new Blob([text], { type: 'text/calendar' })).
 */
export function icsEvent({ title = '', start, end, location = '', description = '' } = {}) {
  const toMs = v => (v instanceof Date ? v.getTime() : typeof v === 'string' ? Date.parse(v) : Number(v));
  const s = toMs(start); if (!Number.isFinite(s)) throw bad('icsEvent: start is required');
  let e = (end === undefined || end === null) ? NaN : toMs(end); if (!Number.isFinite(e) || e <= s) e = s + 2 * 3600e3;
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//wedding-guestbook//v4//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${icsStamp(s)}-${fnv32(String(title)).toString(16)}@wedding-guestbook`,
    `DTSTAMP:${icsStamp(Date.now())}`, `DTSTART:${icsStamp(s)}`, `DTEND:${icsStamp(e)}`,
    `SUMMARY:${icsText(title)}`,
    ...(location ? [`LOCATION:${icsText(location)}`] : []),
    ...(description ? [`DESCRIPTION:${icsText(description)}`] : []),
    'END:VEVENT', 'END:VCALENDAR',
  ];
  return lines.map(icsFold).join('\r\n') + '\r\n';
}

// ---------- 유튜브 영상 (WP-20 마을 TV) ----------
// 기능 코드에는 외부 주소를 쓸 수 없으므로(02 §12-4) 유튜브 iframe 은 여기서만 만듭니다. 허용 주소 = www.youtube-nocookie.com (03 §6).
const YT_HOST = 'https://www.youtube-nocookie.com';
const YT_ID = /^[A-Za-z0-9_-]{11}$/, YT_CHANNEL = /^UC[A-Za-z0-9_-]{22}$/;

/**
 * 관리자가 붙여 넣은 유튜브 주소(또는 id) → { video } | { channel } | null
 * 받는 모양: 11자 영상 id · youtu.be/<id> · youtube.com/watch?v=<id> · /live/<id> · /shorts/<id> · /embed/<id>
 *            · 채널 id(UC…, 24자) · youtube.com/channel/<UC…>(/live) — 채널은 "지금 라이브 중인 방송"
 */
export function youtubeSource(input) {
  const s = String(input ?? '').trim();
  if (!s) return null;
  if (YT_ID.test(s)) return { video: s };
  if (YT_CHANNEL.test(s)) return { channel: s };
  let u;
  try { u = new URL(/^[a-z]+:\/\//i.test(s) ? s : 'https://' + s); } catch { return null; }
  const host = u.hostname.toLowerCase().replace(/^(www\.|m\.|music\.)/, '');
  const parts = u.pathname.split('/').filter(Boolean);
  if (host === 'youtu.be') return YT_ID.test(parts[0] || '') ? { video: parts[0] } : null;
  if (host !== 'youtube.com' && host !== 'youtube-nocookie.com') return null;
  const v = u.searchParams.get('v');
  if (parts[0] === 'watch' && YT_ID.test(v || '')) return { video: v };
  if (['live', 'shorts', 'embed', 'v'].includes(parts[0]) && YT_ID.test(parts[1] || '')) return { video: parts[1] };
  if (parts[0] === 'channel' && YT_CHANNEL.test(parts[1] || '')) return { channel: parts[1] };
  if (parts[0] === 'embed' && parts[1] === 'live_stream' && YT_CHANNEL.test(u.searchParams.get('channel') || '')) return { channel: u.searchParams.get('channel') };
  return null;
}

/**
 * 유튜브 플레이어 iframe (youtube-nocookie). src = youtubeSource() 결과.
 * mute: 음소거로 시작(자동 재생은 음소거여야 허용됨) · autoplay · controls(유튜브 자체 버튼)
 * 돌려준 iframe 을 기능의 [data-f] 상자 안에 붙이세요 (꺼지면 상자와 함께 사라짐). 잘못된 src 면 throw(code 'invalid-argument').
 */
export function youtubeFrame(src, { mute = true, autoplay = true, controls = true, title = 'YouTube' } = {}) {
  const video = src?.video, channel = src?.channel;
  if (!(YT_ID.test(video || '') || YT_CHANNEL.test(channel || ''))) throw bad('youtubeFrame: { video } or { channel } from youtubeSource()');
  const q = new URLSearchParams({ autoplay: autoplay ? '1' : '0', mute: mute ? '1' : '0', playsinline: '1', rel: '0', modestbranding: '1', controls: controls ? '1' : '0', enablejsapi: '1', origin: location.origin });
  if (channel) q.set('channel', channel);
  const f = document.createElement('iframe');
  f.src = `${YT_HOST}/embed/${channel ? 'live_stream' : video}?${q}`;
  f.title = String(title).slice(0, 80);
  f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
  f.allowFullscreen = true;
  f.referrerPolicy = 'strict-origin-when-cross-origin';   // 유튜브 임베드는 출처(origin)가 필요함 — 없으면 "플레이어 구성 오류"
  f.setAttribute('frameborder', '0');
  return f;
}

/** 열려 있는 플레이어에 명령 (유튜브 iframe API 의 postMessage 형식): 'mute' · 'unMute' · 'playVideo' · 'pauseVideo' · 'setVolume' */
export function youtubeCommand(frame, func, args = []) {
  if (!(frame instanceof HTMLIFrameElement) || !frame.src.startsWith(YT_HOST + '/embed/')) return false;
  if (!['mute', 'unMute', 'playVideo', 'pauseVideo', 'setVolume'].includes(func)) return false;
  try { frame.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), YT_HOST); return true; } catch { return false; }
}

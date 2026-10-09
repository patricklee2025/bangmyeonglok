// ============================================================
//  Wedding report — fun stats computed from the guestbook
//  Rendered as HTML in admin.html, and exportable as a pixel-style PNG card.
// ============================================================
import { CONFIG } from './config.js';
import { getSprite, SPRITE_W, SPRITE_H } from './avatar.js';

const SIDE = { groom: '신랑측', bride: '신부측', both: '둘 다' };
// validated categorical order (groom, bride, both) — see dataviz validator run in the build notes
const SIDE_COLOR = { groom: '#3d5a9e', bride: '#c45a86', both: '#6a4fa3' };
const ACT = { walk: '🚶 산책', dance: '💃 댄스', fish: '🎣 낚시', chat: '💬 수다', eat: '🍰 먹방', photo: '📷 사진사' };
const OUTFIT = { suit: '정장', dress: '드레스', hanbok_chima: '한복(치마)', hanbok_baji: '한복(바지)', casual: '캐주얼' };
const STOP = new Set(['너무', '정말', '진짜', '그리고', '항상', '우리', '두', '분', '오늘', '이제', '앞으로', 'and', 'the', 'you', 'to', 'of', 'a', 'for', 'your', 'with', 'in', 'is', 'be', 'so', 'on', 'all', 'my', 'we', 'i', 'it', 'are', 'both', 'have', 'many']);
const PARTICLE = /(은|는|이|가|을|를|에|의|도|요|해요|해|합니다|하세요|해라|게|께|와|과|로|으로|에게|하게|하고|한|아|야)$/;

export function computeReport(guests, snaps = [], pulse = {}) {
  const vis = guests.filter(g => !g.hidden);
  const n = vis.length;
  const sides = { groom: 0, bride: 0, both: 0 }; vis.forEach(g => sides[g.side]++);
  const acts = {}; vis.forEach(g => { acts[g.activity] = (acts[g.activity] || 0) + 1; });
  const outfits = {}; vis.forEach(g => { outfits[g.avatar.outfit] = (outfits[g.avatar.outfit] || 0) + 1; });

  // arrivals: 15/30/60-minute buckets for a single evening, per (local) day for longer spans
  const times = vis.map(g => g.createdAt).sort((a, b) => a - b);
  let timeline = [];
  if (times.length) {
    const span = times[times.length - 1] - times[0], H = 3600e3;
    const step = span > 36 * H ? 24 * H : span > 10 * H ? H : span > 5 * H ? 30 * 60e3 : 15 * 60e3;
    const start = step === 24 * H ? new Date(times[0]).setHours(0, 0, 0, 0) : Math.floor(times[0] / step) * step;   // days start at LOCAL midnight
    const buckets = new Map();
    times.forEach(t => { const k = Math.floor((t - start) / step); buckets.set(k, (buckets.get(k) || 0) + 1); });
    const last = Math.floor((times[times.length - 1] - start) / step);
    for (let k = 0; k <= last; k++) {
      const at = new Date(start + k * step);
      timeline.push({ label: step > 60e3 * 60 ? `${at.getMonth() + 1}/${at.getDate()}` : at.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' }), v: buckets.get(k) || 0 });
    }
    if (timeline.length > 40) timeline = timeline.slice(-40);
  }

  // keywords
  const freq = new Map();
  vis.forEach(g => {
    const seen = new Set();
    String(g.message).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).forEach(w => {
      w = w.replace(PARTICLE, '');
      if (w.length < 2 || STOP.has(w) || seen.has(w)) return;
      seen.add(w); freq.set(w, (freq.get(w) || 0) + 1);
    });
  });
  const keywords = [...freq].sort((a, b) => b[1] - a[1]).slice(0, 12);

  const byId = new Map(vis.map(g => [g.id, g]));
  const remote = Object.entries(pulse).filter(([id]) => byId.has(id)).sort((a, b) => b[1] - a[1]);
  const snapBy = {}; snaps.filter(s => !s.hidden).forEach(s => { snapBy[s.gid] = (snapBy[s.gid] || 0) + 1; });
  const snapKing = Object.entries(snapBy).filter(([id]) => byId.has(id)).sort((a, b) => b[1] - a[1])[0];
  const longest = vis.slice().sort((a, b) => b.message.length - a.message.length)[0];
  const top = (o) => Object.entries(o).sort((a, b) => b[1] - a[1])[0];

  return {
    n, sides, acts, outfits, timeline, keywords,
    counts: { photo: vis.filter(g => g.hasPhoto).length, voice: vis.filter(g => g.hasVoice).length, capsule: vis.filter(g => g.hasCapsule).length, snaps: snaps.filter(s => !s.hidden).length, remote: remote.reduce((s, [, v]) => s + v, 0) },
    first: vis.slice().sort((a, b) => a.createdAt - b.createdAt)[0], lastG: vis.slice().sort((a, b) => b.createdAt - a.createdAt)[0],
    awards: [
      remote[0] && { icon: '🎮', title: '리모컨 장인', who: byId.get(remote[0][0]), note: `${remote[0][1]}번 누름` },
      snapKing && { icon: '📷', title: '스냅 작가상', who: byId.get(snapKing[0]), note: `사진 ${snapKing[1]}장` },
      longest && longest.message.length > 20 && { icon: '✍️', title: '정성 가득 편지상', who: longest, note: `${longest.message.length}자` },
    ].filter(Boolean),
    topOutfit: top(outfits), topAct: top(acts),
  };
}

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const avatarURL = av => { const c = document.createElement('canvas'); c.width = SPRITE_W; c.height = SPRITE_H; c.getContext('2d').drawImage(getSprite(av).idle, 0, 0); return c.toDataURL(); };

export function renderReport(el, R) {
  if (!R.n) { el.innerHTML = '<div class="empty-state">아직 방명록이 없어요.</div>'; return; }
  const pct = v => Math.round(v / R.n * 100);
  const hbars = (obj, labels, color) => {
    const rows = Object.entries(obj).sort((a, b) => b[1] - a[1]); const max = Math.max(...rows.map(r => r[1]), 1);
    return `<div class="hbars">${rows.map(([k, v]) => `<div class="hbar" title="${esc(labels[k] || k)}: ${v}명 (${pct(v)}%)"><span class="lab">${esc(labels[k] || k)}</span><span class="track"><i style="width:${v / max * 100}%;background:${color}"></i></span><b>${v}</b></div>`).join('')}</div>`;
  };
  const tmax = Math.max(...R.timeline.map(t => t.v), 1);
  const every = Math.ceil(R.timeline.length / 8);
  el.innerHTML = `
    <div class="rpt-head px-box"><h2>${esc(CONFIG.couple.groom.ko)} ♥ ${esc(CONFIG.couple.bride.ko)} 결혼식 리포트</h2><span class="tip">${esc(CONFIG.couple.date)}</span></div>
    <div class="tiles">
      ${[['🏡', '하객', R.n], ['📸', '얼굴 사진', R.counts.photo], ['🎤', '음성 메시지', R.counts.voice], ['💌', '타임캡슐', R.counts.capsule], ['📷', '하객 스냅', R.counts.snaps], ['🎮', '리모컨 터치', R.counts.remote]]
        .map(([i, k, v]) => `<div class="tile"><span>${i} ${k}</span><b>${v}</b></div>`).join('')}
    </div>
    <div class="rpt-grid">
      <section class="rpt-card"><h3>누구의 하객?</h3>
        <div class="stack" role="img" aria-label="신랑측 ${R.sides.groom}, 신부측 ${R.sides.bride}, 둘 다 ${R.sides.both}">
          ${['groom', 'bride', 'both'].filter(k => R.sides[k]).map(k => `<i style="flex:${R.sides[k]};background:${SIDE_COLOR[k]}" title="${SIDE[k]} ${R.sides[k]}명 (${pct(R.sides[k])}%)"></i>`).join('')}
        </div>
        <div class="legend">${['groom', 'bride', 'both'].map(k => `<span><i style="background:${SIDE_COLOR[k]}"></i>${SIDE[k]} <b>${R.sides[k]}</b> (${pct(R.sides[k])}%)</span>`).join('')}</div>
      </section>
      <section class="rpt-card"><h3>도착 시간</h3>
        <div class="cols">${R.timeline.map((t, i) => `<div class="col" title="${esc(t.label)}: ${t.v}명"><i style="height:${t.v / tmax * 100}%"></i><span>${i % every === 0 ? esc(t.label) : ''}</span></div>`).join('')}</div>
        <p class="tip">첫 하객: <b>${esc(R.first?.name || '-')}</b> · 마지막 하객: <b>${esc(R.lastG?.name || '-')}</b></p>
      </section>
      <section class="rpt-card"><h3>인기 마을 활동</h3>${hbars(R.acts, ACT, '#c45a86')}</section>
      <section class="rpt-card"><h3>인기 옷차림</h3>${hbars(R.outfits, OUTFIT, '#3d5a9e')}</section>
      <section class="rpt-card wide"><h3>메시지 키워드</h3>
        <div class="kw">${R.keywords.map(([w, c], i) => `<span style="font-size:${Math.max(14, 30 - i * 1.6)}px">${esc(w)} <small>${c}</small></span>`).join('') || '<span class="tip">메시지가 더 모이면 보여요</span>'}</div>
      </section>
      <section class="rpt-card wide"><h3>🏆 오늘의 시상식</h3>
        <div class="awards">${R.awards.map(a => `<div class="award"><img src="${avatarURL(a.who.avatar)}" alt=""><div><b>${a.icon} ${esc(a.title)}</b><span>${esc(a.who.name)} · ${esc(a.note)}</span></div></div>`).join('') || '<span class="tip">아직 수상자가 없어요</span>'}</div>
      </section>
    </div>`;
}

/** pixel-style summary card (1080x1350, Instagram portrait) */
export function reportPNG(R) {
  const W = 1080, H = 1350, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
  g.fillStyle = '#fff8ec'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#2b2033'; g.fillRect(0, 0, W, 12); g.fillRect(0, H - 12, W, 12); g.fillRect(0, 0, 12, H); g.fillRect(W - 12, 0, 12, H);
  const font = (s, b) => `${b ? 'bold ' : ''}${s}px Galmuri11, sans-serif`;
  g.textAlign = 'center'; g.fillStyle = '#2b2033';
  g.font = font(56, true); g.fillText(`${CONFIG.couple.groom.ko} ♥ ${CONFIG.couple.bride.ko}`, W / 2, 110);
  g.font = font(30); g.fillStyle = '#5a4d63'; g.fillText(`${CONFIG.couple.date} 결혼식 리포트`, W / 2, 160);
  // tiles
  const tiles = [['하객', R.n], ['사진', R.counts.photo], ['음성', R.counts.voice], ['타임캡슐', R.counts.capsule], ['스냅', R.counts.snaps], ['리모컨', R.counts.remote]];
  tiles.forEach(([k, v], i) => {
    const x = 60 + (i % 3) * 330, y = 210 + Math.floor(i / 3) * 150;
    g.fillStyle = '#ffffff'; g.fillRect(x, y, 300, 125); g.strokeStyle = '#2b2033'; g.lineWidth = 6; g.strokeRect(x, y, 300, 125);
    g.fillStyle = '#5a4d63'; g.font = font(28); g.fillText(k, x + 150, y + 45); g.fillStyle = '#e66b8f'; g.font = font(54, true); g.fillText(String(v), x + 150, y + 105);
  });
  // side split bar
  let y = 560; g.textAlign = 'left'; g.fillStyle = '#2b2033'; g.font = font(32, true); g.fillText('누구의 하객?', 60, y);
  let x = 60; const bw = W - 120;
  ['groom', 'bride', 'both'].forEach(k => { const w = R.sides[k] / Math.max(1, R.n) * bw; if (w <= 0) return; g.fillStyle = SIDE_COLOR[k]; g.fillRect(x, y + 20, Math.max(0, w - 4), 50); x += w; });
  g.font = font(26); x = 60;
  ['groom', 'bride', 'both'].forEach(k => { g.fillStyle = SIDE_COLOR[k]; g.fillRect(x, y + 95, 24, 24); g.fillStyle = '#2b2033'; const t = `${SIDE[k]} ${R.sides[k]}`; g.fillText(t, x + 34, y + 117); x += g.measureText(t).width + 80; });
  // keywords
  y = 760; g.font = font(32, true); g.fillText('많이 나온 말', 60, y);
  x = 60; let ky = y + 60;
  const fit = (txt, max) => { if (g.measureText(txt).width <= max) return txt; const a = Array.from(txt); while (a.length > 1 && g.measureText(a.join('') + '…').width > max) a.pop(); return a.join('') + '…'; };
  let rows = 1;
  for (const [i, [w0]] of R.keywords.slice(0, 10).entries()) {   // at most 2 rows, so the awards always fit on the card
    const s = Math.max(28, 52 - i * 3); g.font = font(s, i < 3); const w = fit(w0, W - 120); const tw = g.measureText(w).width;
    if (x + tw > W - 60) { if (rows === 2) break; rows++; x = 60; ky += 66; }
    g.fillStyle = i < 3 ? '#c45a86' : '#2b2033'; g.fillText(w, x, ky); x += tw + 36;
  }
  // awards
  y = Math.max(ky + 90, 1010); g.fillStyle = '#2b2033'; g.font = font(32, true); g.fillText('🏆 시상식', 60, y);
  R.awards.slice(0, 3).forEach((a, i) => {
    const ay = y + 30 + i * 96; g.drawImage(getSprite(a.who.avatar).idle, 60, ay, SPRITE_W * 2.6, SPRITE_H * 2.6);
    g.fillStyle = '#2b2033'; g.font = font(30, true); g.fillText(`${a.title}`, 140, ay + 38); g.font = font(26); g.fillStyle = '#5a4d63'; g.fillText(fit(`${a.who.name} · ${a.note}`, W - 200), 140, ay + 74);
  });
  return c.toDataURL('image/png');
}

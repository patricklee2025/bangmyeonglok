// ============================================================
//  core-features-static (WP-00b) — 브라우저 없이 1초: v4 기능 플러그인의 "정적 약속"을 검사합니다 (docs/v4/04-testing.md §3.1, 02 §1 · §1.1 · §12).
//    · 매니페스트 형식 (+ WP-00b §5 의 줄들이 몰래 바뀌지 않았는지)
//    · 기능 폴더마다: 필수 파일, i18n 접두사·한/영 짝, CSS 접두사, 금지 목록, import 허용 목록, 접두사 없는 storage 키·DOM id
//    · core/schema.js ↔ firestore.rules 경로 (컬렉션 + 고정 문서), firestore.rules = 03 §4 (바이트 단위), 규칙 ↔ config
//  검사기 자신도 시험합니다: 일부러 틀린 코드 조각을 주고 정확히 그 규칙이 걸리는지 확인 ("lint self-test") — 검사기가 조용히 아무것도 못 잡는 사고를 막습니다.
//  ⚠ 기능 WP 는 이 파일을 고치지 않습니다. 걸리면 코드를 고치거나 QUESTIONS.md (허용 목록을 넓히는 것 = 금지).
// ============================================================
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadDictionary } from './core-static.mjs';

export const meta = { title: 'v4 static rules: manifest, feature folders (prefixes, forbidden list, import allow-list), schema.js ↔ rules, rules ↔ docs/config', timeout: 60000, browser: false };

// ---------------------------------------------------------------- 약속 (02-contracts / WP-00b §5 에서 옮김)
const ALL = ['pre', 'live', 'after', 'anniversary'];
/** [id, wp, ko, en, pages, phases, simple, liveSafe, gate] — status · default 는 WP 가 바꾸는 값이라 고정하지 않습니다 */
const EXPECT = [
  ['prereg', 'WP-01', '사전 입주 · 체크인 · 입장권', 'Move-in & check-in', ['guest', 'kiosk', 'village', 'admin'], ['pre', 'live'], true, true, true],
  ['couple', 'WP-02', '커플 캐릭터', 'Couple characters', ['guest', 'kiosk', 'village', 'admin'], ALL, true, true, false],
  ['dday', 'WP-03', 'D-day 마을', 'D-day village', ['guest', 'village'], ['pre'], true, false, false],
  ['story', 'WP-04', '커플 스토리 표지판', 'Our story signs', ['village', 'admin'], ALL, true, true, false],
  ['live', 'WP-05', '식순 라이브 모드', 'Live program', ['village', 'admin'], ['live'], true, false, false],
  ['translate', 'WP-06', '덕담 번역', 'Message translation', ['village', 'admin'], ['live', 'after', 'anniversary'], true, false, false],
  ['bgm', 'WP-07', '8비트 BGM · 효과음', '8-bit music', ['village', 'admin'], ALL, true, false, false],
  ['meter', 'WP-08', '마음 온도계', 'Love-o-meter', ['village', 'admin'], ['live'], true, false, false],
  ['bingo', 'WP-09', '양가 섞이기 빙고', 'Mix & Mingle Bingo', ['guest', 'village', 'admin'], ['live'], false, false, false],
  ['poll', 'WP-10', '실시간 투표', 'Live polls', ['guest', 'village', 'admin'], ['live'], true, false, false],
  ['card', 'WP-11', '내 픽셀 카드', 'My pixel card', ['guest', 'village'], ALL, true, false, false],
  ['fourcut', 'WP-12', '픽셀 네컷', 'Pixel photo strip', ['guest'], ['live', 'after'], false, false, false],
  ['offline', 'WP-13', '오프라인 대비', 'Offline support', ['guest', 'kiosk', 'village', 'admin'], ALL, true, true, false],
  ['archive', 'WP-14', '추억 마을 아카이브', 'Memory Village archive', ['guest', 'village', 'admin'], ['after', 'anniversary'], true, true, false],
  ['thanks', 'WP-15', '하객별 감사 카드', 'Thank-you cards', ['guest', 'admin'], ['after', 'anniversary'], true, false, false],
  ['photobook', 'WP-16', '포토북 PDF', 'Photobook PDF', ['admin'], ['after', 'anniversary'], true, false, false],
  ['postcard', 'WP-17', '신혼여행 엽서', 'Honeymoon postcards', ['guest', 'village', 'admin'], ['after', 'anniversary'], true, false, false],
  ['anniversary', 'WP-18', '1주년 재개장', '1st anniversary', ['guest', 'village', 'admin'], ['anniversary'], true, false, false],
  // 2026-10-07 — added at Patrick's request (WP-19 / WP-20 documents)
  ['wall', 'WP-19', '방명록 모아보기', 'Guestbook wall', ['guest', 'village'], ALL, true, true, false],
  ['tv', 'WP-20', '마을 TV (유튜브)', 'Village TV (YouTube)', ['village', 'admin'], ['pre', 'live'], true, true, false],   // 2026-10-08 Patrick: visible before the wedding too
  ['_selftest', 'WP-00c', '코어 자체 점검', 'Core self-test', ['guest', 'kiosk', 'village', 'admin'], ALL, true, true, false],
];
const PAGES = ['guest', 'kiosk', 'village', 'admin'];
const STATUSES = ['planned', 'beta', 'ready'];
const ID_RE = /^(?:[a-z][a-z0-9]{1,15}|_selftest)$/;

/** 02 §1.1 — 기능이 가져올 수 있는 코어 모듈 (기능 폴더 기준 경로) → 가져와도 되는 이름. '*' = 전부 */
export const IMPORT_ALLOW = {
  '../../core/ui.js': '*',
  '../../core/phase.js': ['PHASES', 'phaseAt', 'liveWindow'],
  '../../config.js': ['CONFIG'],
  '../../avatar.js': ['getSprite', 'normalizeAvatar', 'FRAMES', 'SPRITE_W', 'SPRITE_H', 'SKIN', 'HAIR', 'COLORS', 'shade', 'mix', 'coupleLook', 'COUPLE_OUTFITS'],
  '../../scene.js': ['W', 'H', 'TILE', 'Z', 'buildGround', 'buildProps'],
  '../../report.js': ['computeReport'],
};
/** WP-02 가 avatar.js 에 추가할 이름 — 그 전에는 모듈에 없어도 허용 목록에는 있어야 함 */
const NOT_YET = new Set(['coupleLook', 'COUPLE_OUTFITS']);
/** 새 파일이 생기면 안 되는 폴더 (02 §12-5) */
// the core's own vendor set (v3.3 added the face-api age/gender model to the core photo analysis); features may add nothing
const VENDOR_FILES = ['face-api/LICENSE', 'face-api/face-api.esm.js', 'face-api/model/age_gender_model-weights_manifest.json', 'face-api/model/age_gender_model.bin',
  'face-api/model/face_expression_model-weights_manifest.json', 'face-api/model/face_expression_model.bin',
  'face-api/model/face_landmark_68_model-weights_manifest.json', 'face-api/model/face_landmark_68_model.bin', 'face-api/model/tiny_face_detector_model-weights_manifest.json',
  'face-api/model/tiny_face_detector_model.bin', 'jszip.min.js', 'qrcode.mjs'];

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const walk = (dir, acc = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p, acc); else acc.push(p); }
  return acc;
};

// ============================================================
//  검사기 (순수 함수 — 아래 "lint self-test" 가 조각으로 직접 시험)
// ============================================================

/** 주석을 공백으로 바꿉니다 (줄 번호 유지). 문자열·템플릿·정규식 리터럴 안은 그대로 둡니다. */
export function stripComments(src) {
  let out = '', i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') { out += ' '; i++; } continue; }
    if (c === '/' && d === '*') {
      out += '  '; i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { out += src[i] === '\n' ? '\n' : ' '; i++; }
      out += '  '; i += 2; continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      const q = c; out += c; i++;
      while (i < n && src[i] !== q) {
        if (src[i] === '\\') { out += src[i] + (src[i + 1] ?? ''); i += 2; continue; }
        if (q !== '`' && src[i] === '\n') break;
        out += src[i]; i++;
      }
      out += src[i] ?? ''; i++; continue;
    }
    if (c === '/') {                                              // 정규식 리터럴? (앞의 의미 있는 글자로 판단)
      const before = out.trimEnd(), prev = before.slice(-1);
      if (prev === '' || '(,=:[!&|?{};+-*%<>~^'.includes(prev) || /(?:^|[^\w$])(?:return|typeof|case|of|in|delete|void|throw|new)$/.test(before)) {
        let j = i + 1, cls = false, ok = false;
        while (j < n && src[j] !== '\n') {
          if (src[j] === '\\') { j += 2; continue; }
          if (src[j] === '[') cls = true; else if (src[j] === ']') cls = false;
          else if (src[j] === '/' && !cls) { ok = true; break; }
          j++;
        }
        if (ok) { out += src.slice(i, j + 1); i = j + 1; continue; }
      }
    }
    out += c; i++;
  }
  return out;
}

const PLAIN_STRING = /^(?:'[^'\\\n]*'|"[^"\\\n]*"|`[^`$\\]*`)$/;
const lineOf = (code, idx) => code.slice(0, idx).split('\n').length;

/** import 문 전부 → [{ kind, from, names | null, ns, line }] (names = 중괄호 안 원래 이름, null = 이름 없음) */
export function parseImports(code) {
  const out = [];
  for (const m of code.matchAll(/\bimport\s+([\w$]+)?\s*,?\s*(?:\*\s+as\s+([\w$]+)|\{([^}]*)\})?\s*from\s*(['"])([^'"]+)\4/g)) {
    out.push({ kind: 'static', from: m[5], def: m[1] || null, ns: m[2] || null, names: m[3] ? m[3].split(',').map(s => s.trim().split(/\s+as\s+/)[0]).filter(Boolean) : [], line: lineOf(code, m.index) });
  }
  for (const m of code.matchAll(/\bimport\s*(['"])([^'"]+)\1\s*;?/g)) out.push({ kind: 'side-effect', from: m[2], def: null, ns: null, names: [], line: lineOf(code, m.index) });
  for (const m of code.matchAll(/\bexport\s+(?:\*(?:\s+as\s+[\w$]+)?|\{([^}]*)\})\s*from\s*(['"])([^'"]+)\2/g)) {
    out.push({ kind: 'reexport', from: m[3], def: null, ns: m[1] === undefined ? '*' : null, names: m[1] ? m[1].split(',').map(s => s.trim().split(/\s+as\s+/)[0]).filter(Boolean) : [], line: lineOf(code, m.index) });
  }
  for (const m of code.matchAll(/(?<![\w$.])import\s*\(\s*([^)]*?)\s*\)/g)) out.push({ kind: 'dynamic', arg: m[1], from: PLAIN_STRING.test(m[1]) ? m[1].slice(1, -1) : null, line: lineOf(code, m.index) });
  return out;
}

/** 02 §1.1 허용 목록 검사. fileExists(rel) = 자기 폴더 안 파일이 실제로 있는지 */
export function checkImports(code, { fileExists = () => true } = {}) {
  const bad = [];
  for (const im of parseImports(code)) {
    const where = `line ${im.line}`;
    if (im.kind === 'dynamic') {
      if (im.from === null) { bad.push(`import: ${where}: dynamic import() needs a fixed string path`); continue; }
      if (!/^\.\/[\w.-]+(?:\/[\w.-]+)*$/.test(im.from)) bad.push(`import: ${where}: import('${im.from}') — dynamic import is only for files of your own folder`);
      else if (!fileExists(im.from)) bad.push(`import: ${where}: ${im.from} does not exist`);
      continue;
    }
    const own = /^\.\/[\w.-]+(?:\/[\w.-]+)*$/.test(im.from);
    if (own) { if (!fileExists(im.from)) bad.push(`import: ${where}: ${im.from} does not exist`); continue; }
    const allow = Object.prototype.hasOwnProperty.call(IMPORT_ALLOW, im.from) ? IMPORT_ALLOW[im.from] : undefined;
    if (allow === undefined) { bad.push(`import: ${where}: '${im.from}' is not on the allow-list (02 §1.1) — use ctx, or ask in QUESTIONS.md`); continue; }
    if (allow === '*') continue;
    if (im.ns) bad.push(`import: ${where}: '${im.from}' — name what you import, do not use a namespace import`);
    if (im.def) bad.push(`import: ${where}: '${im.from}' has no default export`);
    for (const n of im.names) if (!allow.includes(n)) bad.push(`import: ${where}: '${n}' from '${im.from}' is not allowed (allowed: ${allow.join(' ')})`);
  }
  return bad;
}

/** 기능 JS 한 파일 검사 (02 §12 · §1 · §3). 문제 문자열 배열 (비어 있으면 통과). */
export function lintJs(src, id, { fileExists } = {}) {
  const code = stripComments(src), P = [];
  const add = (rule, idx, msg) => P.push(`${rule}: line ${lineOf(code, idx)}: ${msg}`);
  const lit = v => (/^(['"`])/.test(v) ? v.slice(1) : null);               // 따옴표로 시작하면 그 뒤 내용
  const idOk = v => v.startsWith(`f-${id}-`);

  // 12-4 외부 주소 (주석 포함 원문 — 예외는 SVG 이름공간 www.w3.org 뿐)
  for (const m of src.matchAll(/https?:\/\/(?!www\.w3\.org\/)[^\s'"`)\\]*/g)) P.push(`url: line ${lineOf(src, m.index)}: external address ${m[0].slice(0, 60)}`);

  // 12-2 innerHTML / outerHTML / insertAdjacentHTML / document.write 는 고정 문자열만
  for (const m of code.matchAll(/\.(innerHTML|outerHTML)\s*(\+?=)(?!=)\s*([^;\n]*)/g)) if (!PLAIN_STRING.test(m[3].trim().replace(/,$/, ''))) add('html', m.index, `${m[1]} ${m[2]} with a non-literal value — use textContent / ctx.el`);
  for (const m of code.matchAll(/\.insertAdjacentHTML\s*\(\s*[^,()]+,\s*([^)]*)\)/g)) if (!PLAIN_STRING.test(m[1].trim())) add('html', m.index, 'insertAdjacentHTML with a non-literal value');
  for (const m of code.matchAll(/\bdocument\s*\.\s*write(?:ln)?\s*\(/g)) add('eval', m.index, 'document.write');
  for (const m of code.matchAll(/\.srcdoc\s*=/g)) add('html', m.index, 'srcdoc');
  // 12-3 eval · new Function · 문자열 타이머
  for (const m of code.matchAll(/(?<![\w$.])eval\s*\(/g)) add('eval', m.index, 'eval');
  for (const m of code.matchAll(/\bnew\s+Function\b|(?<![\w$.])Function\s*\(/g)) add('eval', m.index, 'new Function');
  for (const m of code.matchAll(/\bset(?:Timeout|Interval)\s*\(\s*['"`]/g)) add('eval', m.index, 'string argument to setTimeout/setInterval');
  // 12-9 console.log
  for (const m of code.matchAll(/\bconsole\s*\.\s*log\b/g)) add('console', m.index, 'console.log — use ctx.log');
  // 12-8 storage 비우기 · IndexedDB 삭제
  for (const m of code.matchAll(/\b(?:localStorage|sessionStorage)\s*\.\s*clear\s*\(/g)) add('storage', m.index, 'storage.clear()');
  for (const m of code.matchAll(/\bindexedDB\s*\.\s*deleteDatabase\b/g)) add('storage', m.index, 'indexedDB.deleteDatabase');
  // 12-7 storage 키는 wgb_f_<id>_ 로 시작
  const consts = new Map([...code.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(['"`])([^'"`]*)\2/g)].map(m => [m[1], m[3]]));
  const keyPrefix = `wgb_f_${id}_`;
  for (const m of code.matchAll(/\b(localStorage|sessionStorage)\s*\.\s*(getItem|setItem|removeItem)\s*\(\s*([^,)]*)/g)) {
    const a = m[3].trim();
    const v = lit(a) ?? (/^[A-Za-z_$][\w$]*$/.test(a) && consts.has(a) ? consts.get(a) : null);
    if (v === null) add('storage', m.index, `${m[1]}.${m[2]}(${a}) — the key must be a literal starting with ${keyPrefix}`);
    else if (!v.startsWith(keyPrefix)) add('storage', m.index, `${m[1]} key "${v.slice(0, 30)}" must start with ${keyPrefix}`);
  }
  for (const m of code.matchAll(/\b(?:localStorage|sessionStorage)\s*(?:\[|\.(?!getItem\b|setItem\b|removeItem\b|clear\b))/g)) add('storage', m.index, 'use getItem / setItem / removeItem with a wgb_f_<id>_ key');
  // 12-7 <html> · <body> 클래스는 ctx.rootClass 로만
  for (const m of code.matchAll(/\bdocument\s*\.\s*(?:documentElement|body)\s*\.\s*(?:classList|className)\b|\b(?:documentElement|body)\s*\.\s*className\b/g)) add('rootclass', m.index, 'touching <html>/<body> classes directly — use ctx.rootClass(name)');
  for (const m of code.matchAll(/\b(?:documentElement|body)\s*\.\s*setAttribute\s*\(\s*['"]class['"]/g)) add('rootclass', m.index, 'setAttribute("class") on <html>/<body>');
  // 12-7 DOM id 는 f-<id>- 로 시작
  const idChecks = [
    [/\.id\s*=(?!=)\s*(['"`])([^'"`]*)/g, 2, '.id ='],
    [/setAttribute\s*\(\s*['"]id['"]\s*,\s*(['"`])([^'"`]*)/g, 2, 'setAttribute("id")'],
    [/getElementById\s*\(\s*(['"`])([^'"`]*)/g, 2, 'getElementById'],
    [/\battrs\s*:\s*\{[^}]*?\bid\s*:\s*(['"`])([^'"`]*)/g, 2, 'attrs.id'],
    [/<[a-zA-Z][^<>]*?\sid\s*=\s*\\?(["'])([^"'\\]*)/g, 2, 'id="…" in markup'],
  ];
  for (const [re, g, what] of idChecks) for (const m of code.matchAll(re)) if (!idOk(m[g])) add('domid', m.index, `${what} "${m[g].slice(0, 30)}" must start with f-${id}-`);
  for (const m of code.matchAll(/\bquerySelector(?:All)?\s*\(\s*(['"`])([^'"`]*)\1/g)) for (const t of m[2].matchAll(/#([A-Za-z_][\w-]*)/g)) if (!idOk(t[1])) add('domid', m.index, `selector #${t[1]} must start with #f-${id}-`);
  // 02 §3 규칙 4 전역 오염 금지
  for (const m of code.matchAll(/\b(?:window|globalThis)\s*\.\s*[\w$]+\s*=(?!=)|\b(?:window|globalThis)\s*\[[^\]]+\]\s*=(?!=)/g)) add('global', m.index, `global assignment (${m[0].replace(/\s+/g, '').slice(0, 40)})`);
  for (const m of code.matchAll(/\.prototype\s*\.\s*[\w$]+\s*=(?!=)/g)) add('global', m.index, 'prototype modification');
  for (const m of code.matchAll(/\bObject\s*\.\s*(?:defineProperty|setPrototypeOf)\s*\(\s*(?:window|globalThis|document|[A-Z]\w*\.prototype)\b/g)) add('global', m.index, 'defineProperty on a global');
  // 02 §3 규칙 2 모듈 최상위에서는 아무 일도 하지 않음 (맨 앞 칸에서 시작하는 명백한 부수 효과만)
  for (const m of code.matchAll(/^(?:(?:const|let|var)\s+[\w$]+\s*=\s*)?(?:document|window|navigator|localStorage|sessionStorage|setTimeout|setInterval|requestAnimationFrame|addEventListener)\b[^\n]*$/gm)) add('toplevel', m.index, 'module top level must only import and define constants — do the work inside setup(ctx)');
  // 02 §1.1 import 허용 목록
  for (const p of checkImports(code, { fileExists })) P.push(p);
  return P;
}

/** CSS 한 파일 검사: 모든 선택자가 .f-<id>- / [data-f="<id>"] / html.f-<id>- 로 시작, @keyframes f-<id>-… */
export function lintCss(src, id) {
  const css = src.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' ')), P = [];
  const startOk = new RegExp(`^(?:\\.f-${esc(id)}-|\\[data-f=(["'])${esc(id)}\\1\\]|html\\.f-${esc(id)}-)`);
  const splitTop = s => { const out = []; let d = 0, q = '', cur = ''; for (const ch of s) { if (q) { cur += ch; if (ch === q) q = ''; continue; } if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; } if ('(['.includes(ch)) d++; if (')]'.includes(ch)) d--; if (ch === ',' && d === 0) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out.map(s => s.trim()).filter(Boolean); };
  const block = (from, to, nested) => {                                    // from..to 사이의 규칙들
    let i = from;
    while (i < to) {
      const open = css.indexOf('{', i), semi = css.indexOf(';', i);
      if (semi !== -1 && (open === -1 || semi < open) && semi < to) { const stmt = css.slice(i, semi).trim(); if (/^@import\b/.test(stmt)) P.push(`css: line ${lineOf(css, i)}: @import is not allowed`); i = semi + 1; continue; }
      if (open === -1 || open >= to) break;
      let depth = 1, j = open + 1;
      while (j < to && depth) { if (css[j] === '{') depth++; else if (css[j] === '}') depth--; j++; }
      const prelude = css.slice(i, open).trim(), inner = [open + 1, j - 1];
      if (prelude.startsWith('@')) {
        const kw = /^@([\w-]+)/.exec(prelude)?.[1] || '';
        if (/keyframes$/.test(kw)) { const name = prelude.replace(/^@[\w-]+\s*/, ''); if (!name.startsWith(`f-${id}-`)) P.push(`css: line ${lineOf(css, i)}: @keyframes ${name} must be named f-${id}-…`); }
        else if (/^(media|supports|layer|container)$/.test(kw)) block(inner[0], inner[1], true);
        // @font-face · @page … : 선택자가 없는 블록 — 그대로 둠
      } else {
        for (const sel of splitTop(prelude)) if (!startOk.test(sel)) P.push(`css: line ${lineOf(css, i)}: selector "${sel.slice(0, 50)}" must start with .f-${id}- / [data-f="${id}"] / html.f-${id}-`);
      }
      i = j;
    }
  };
  block(0, css.length, false);
  for (const m of css.matchAll(/url\(\s*['"]?\s*\/\//g)) P.push(`css: line ${lineOf(css, m.index)}: protocol-relative url()`);
  return P;
}

/** 기능 i18n.js 한 파일 검사 → { problems, keys: Set } */
export function lintI18n(src, id) {
  const P = [], D = loadDictionary(src);
  if (!D) return { problems: ['i18n: needs `const D = { ko: {…}, en: {…} };` and `export default D;`'], keys: new Set() };
  if (!/export\s+default\s+D\s*;?/.test(src)) P.push('i18n: missing `export default D;`');
  const ko = Object.keys(D.ko || {}), en = Object.keys(D.en || {});
  const bad = ko.concat(en).filter(k => !k.startsWith(`${id}_`));
  if (bad.length) P.push(`i18n: keys must start with ${id}_ → ${[...new Set(bad)].join(', ')}`);
  const onlyKo = ko.filter(k => !(k in D.en)), onlyEn = en.filter(k => !(k in D.ko));
  if (onlyKo.length) P.push(`i18n: ko keys without en → ${onlyKo.join(', ')}`);
  if (onlyEn.length) P.push(`i18n: en keys without ko → ${onlyEn.join(', ')}`);
  const empty = [...ko.filter(k => D.ko[k] === ''), ...en.filter(k => D.en[k] === '')];
  if (empty.length) P.push(`i18n: empty strings → ${empty.join(', ')}`);
  return { problems: P, keys: new Set(ko) };
}

/** ctx.t('literal') 로 쓴 키가 i18n 에 있는지 */
export function lintKeysUsed(src, keys) {
  const code = stripComments(src), P = [];
  for (const m of code.matchAll(/\bctx\s*\.\s*t\s*\(\s*(['"])([^'"]+)\1/g)) if (!keys.has(m[2])) P.push(`i18n: line ${lineOf(code, m.index)}: ctx.t('${m[2]}') — no such key in i18n.js`);
  return P;
}

/**
 * 모듈 소스가 export 하는 이름 전부 (실제 import 없이 — 이 스위트는 Node 만 씁니다).
 * export const A = 1, B = 2; · function · async function · class · export { a, b as c } · export default → 'default'.
 * 구조 분해 export(`export const { a } = o`)는 찾지 못합니다 — 없는 이름은 허용 목록 검사가 시끄럽게 실패하므로 조용한 통과는 생기지 않습니다.
 */
export function exportedNames(src) {
  const code = stripComments(src), out = new Set();
  for (const m of code.matchAll(/^export\s+(?:async\s+)?(?:function\s*\*?|class)\s*([\w$]+)/gm)) out.add(m[1]);
  if (/^export\s+default\b/m.test(code)) out.add('default');
  for (const m of code.matchAll(/^export\s*\{([^}]*)\}/gm)) for (const part of m[1].split(',')) { const n = part.trim().split(/\s+as\s+/).pop(); if (n) out.add(n); }
  for (const m of code.matchAll(/^export\s+(?:const|let|var)\s+/gm)) {
    let i = m.index + m[0].length, depth = 0, from = i;                       // 선언부 끝(깊이 0 의 ';')까지 훑고, 깊이 0 의 쉼표로 선언자를 나눔
    const parts = [];
    for (; i < code.length; i++) {
      const c = code[i];
      if (c === '"' || c === "'" || c === '`') { for (i++; i < code.length && code[i] !== c; i++) if (code[i] === '\\') i++; continue; }
      if ('([{'.includes(c)) depth++;
      else if (')]}'.includes(c)) depth--;
      else if (depth === 0 && c === ',') { parts.push(code.slice(from, i)); from = i + 1; }
      else if (depth === 0 && c === ';') break;
    }
    parts.push(code.slice(from, i));
    for (const part of parts) { const nm = /^\s*([A-Za-z_$][\w$]*)\s*(?:=|:|$)/.exec(part); if (nm) out.add(nm[1]); }
  }
  return out;
}

// ============================================================
export default async (h) => {
  const read = f => fs.readFileSync(f, 'utf8');
  const rel = f => path.relative(h.repo, f);
  const js = path.join(h.publicDir, 'js'), featDir = path.join(js, 'features'), coreDir = path.join(js, 'core');

  // ---------------------------------------------------------------- 검사기 자체 시험 (lint self-test)
  await h.step('lint self-test: every rule fires on a bad snippet and stays quiet on a good one', async () => {
    const ID = 'poll';
    const rules = (src, opts) => [...new Set(lintJs(src, ID, opts).map(p => p.split(':')[0]))];
    const bad = [
      ['html', "el.innerHTML = '<b>' + name + '</b>';"], ['html', 'box.innerHTML += `<i>${x}</i>`;'], ['html', "el.insertAdjacentHTML('beforeend', html);"], ['html', 'el.outerHTML = tpl;'],
      ['eval', 'eval(code)'], ['eval', 'const f = new Function("a", "return a");'], ['eval', "setTimeout('go()', 10)"], ['eval', 'document.write(x)'],
      ['console', "console.log('x')"],
      ['storage', "localStorage.clear()"], ['storage', "sessionStorage.clear();"], ['storage', "indexedDB.deleteDatabase('wgb-demo')"],
      ['storage', "localStorage.getItem('voted')"], ['storage', "localStorage.setItem('wgb_f_bingo_x', '1')"], ['storage', 'localStorage.getItem(k)'], ['storage', "const K = 'voted'; localStorage.getItem(K)"], ['storage', "localStorage['wgb_f_poll_x']"],
      ['rootclass', "document.documentElement.classList.add('x')"], ['rootclass', "document.body.classList.toggle('x')"], ['rootclass', "document.body.className = 'x'"],
      ['domid', "el.id = 'sheet'"], ['domid', "document.getElementById('arrival')"], ['domid', "document.querySelector('#fsheet .x')"], ['domid', "ctx.el('div', { attrs: { id: 'box' } })"], ['domid', "x.setAttribute('id', 'box')"],
      ['global', 'window.poll = {};'], ['global', "globalThis['x'] = 1"], ['global', 'Array.prototype.last = function () {};'],
      ['toplevel', "document.addEventListener('x', y);"], ['toplevel', 'const box = document.getElementById("a");'], ['toplevel', 'setInterval(tick, 1000);'],
      ['url', "const u = 'https://example.com/x.js';"], ['url', "// see http://example.com\nexport const a = 1;"],
      ['import', "import { getStore } from '../../store.js';"], ['import', "import x from '../bingo/index.js';"], ['import', "import { guestCode } from '../../core/bus.js';"], ['import', "import { nope } from '../../core/phase.js';"],
      ['import', "import * as A from '../../avatar.js';"], ['import', "import D from './missing.js';"], ['import', 'const m = await import(path);'], ['import', "const m = await import('../../store.js');"], ['import', "import { x } from '../../vendor/qrcode.mjs';"],
    ];
    for (const [rule, snippet] of bad) {
      const got = rules(snippet, { fileExists: f => f !== './missing.js' });
      h.check(`lint: "${snippet.slice(0, 54)}" is caught by [${rule}]`, got.includes(rule), got.join(',') || 'nothing');
    }
    const good = [
      "import D from './i18n.js';\nexport const i18n = D;\nexport async function setup(ctx) { ctx.el('div', { text: 'x', attrs: { id: 'f-poll-box' } }); }",
      "el.textContent = name; el.innerHTML = ''; el.innerHTML = '<b>fixed</b>';",
      "const KEY = 'wgb_f_poll_voted'; localStorage.getItem(KEY); localStorage.setItem('wgb_f_poll_' + pid, '1'); sessionStorage.removeItem(`wgb_f_poll_${pid}`);",
      "import { CONFIG } from '../../config.js';\nimport { PHASES, phaseAt } from '../../core/phase.js';\nimport * as ui from '../../core/ui.js';\nimport { getSprite, SPRITE_W } from '../../avatar.js';\nimport { W, H } from '../../scene.js';\nimport { computeReport } from '../../report.js';",
      "const mod = await import('./helper.js');",
      "function mk() { return document.createElementNS('http://www.w3.org/2000/svg', 'svg'); }",
      "// console.log('in a comment') and eval(x) and innerHTML = x in a comment are fine\nexport const a = /[\"'`]/.test(x) ? 1 : 2;",
      "function f() { const t = setTimeout(() => go(), 10); const n = a / b / c; const re = /https?:\\/\\//; return [t, n, re]; }",
      "if (ctx.page === 'village') { ctx.v.onUpdate(() => {}); }\nfunction setupGuest(ctx) { document.querySelector('#f-poll-card'); document.getElementById('f-poll-sheet'); }",
      "export const retrieval = 5; const fn = obj.eval; widget.id = someVariable;",
    ];
    good.forEach((snippet, i) => {
      const got = lintJs(snippet, ID, { fileExists: () => true });
      h.check(`lint: clean snippet #${i + 1} passes`, got.length === 0, got.join(' | '));
    });
    const sc = stripComments("a('//x'); // gone\n/* gone */ b(/\\/\\//); c = a / b / d; // end");
    h.check('lint: stripComments keeps strings, regexes and divisions, drops comments', sc.includes("a('//x');") && sc.includes('b(/\\/\\//);') && sc.includes('c = a / b / d;') && !/gone|end/.test(sc), JSON.stringify(sc));
    h.eq('lint: stripComments keeps the line count (comments turn into blanks)', sc.split('\n').length, 2);
    h.eq('lint: exportedNames reads const lists, functions, classes and export { … }',
      [...exportedNames("export const A = 1, B = [1, ',', ';'], C = (x) => { return x; };\nexport function f() {}\nexport async function g() {}\nexport class K {}\nconst x = 1, z = 2;\nexport { x as y, z };\n// export const hidden = 1;\nexport default 1;")].sort(),
      ['A', 'B', 'C', 'K', 'default', 'f', 'g', 'y', 'z']);

    const cssBad = ['.btn { color: red }', 'body.f-poll-x .a { }', 'html.f-other-x .a { }', '.f-poll-a, .btn { }', '@keyframes pulse { from { top: 0 } }', '@media (max-width: 600px) { .box { } }', ':root { --x: 1 }', '@import url(x.css);', '[data-f="other"] .a {}', 'bgcolor { }'];
    for (const css of cssBad) h.check(`lint css: "${css.slice(0, 40)}" is caught`, lintCss(css, ID).length > 0);
    const cssGood = ['.f-poll-bar { width: 1px }', '[data-f="poll"] > .x, html.f-poll-mode .qr { top: 0 }', "[data-f='poll'] { }", '@keyframes f-poll-pop { from { top: 0 } 50% { top: 1px } to { top: 2px } }',
      '@media (max-width: 600px) { .f-poll-a, [data-f="poll"] .b { color: red } }', '/* .btn { } */ .f-poll-a:is(.x, .y) { }', '.f-poll-a[title="a,b"] { }', '@font-face { font-family: "F"; src: url(font.woff2) }'];
    cssGood.forEach((css, i) => h.check(`lint css: clean snippet #${i + 1} passes`, lintCss(css, ID).length === 0, lintCss(css, ID).join(' | ')));
    h.check('lint css: id with underscore (_selftest)', lintCss('.f-_selftest-a { } html.f-_selftest-on { } [data-f="_selftest"] { }', '_selftest').length === 0 && lintCss('.f-selftest-a { }', '_selftest').length === 1);

    const i18n = lintI18n("const D = {\n  ko: { poll_a: '가', poll_b: '나' },\n  en: { poll_a: 'a' },\n};\nexport default D;\n", ID).problems.join(' | ');
    h.check('lint i18n: missing en key is caught', /ko keys without en → poll_b/.test(i18n), i18n);
    h.check('lint i18n: wrong prefix is caught', /must start with poll_ → x_a/.test(lintI18n("const D = {\n  ko: { x_a: '가' },\n  en: { x_a: 'a' },\n};\nexport default D;\n", ID).problems.join(' | ')));
    h.check('lint i18n: empty string is caught', /empty strings/.test(lintI18n("const D = {\n  ko: { poll_a: '' },\n  en: { poll_a: 'a' },\n};\nexport default D;\n", ID).problems.join(' | ')));
    h.check('lint i18n: ctx.t with an unknown key is caught', lintKeysUsed("ctx.t('poll_x'); ctx.t('poll_a'); // ctx.t('poll_y')", new Set(['poll_a'])).length === 1);
  });

  // ---------------------------------------------------------------- 매니페스트
  const manifestFile = path.join(featDir, 'index.js');
  const { FEATURES } = await import(pathToFileURL(manifestFile).href);
  await h.step('manifest: format and the lines WP-00b §5 fixed', async () => {
    const src = read(manifestFile);
    h.check('manifest has the 20 features (18 + WP-19 wall + WP-20 tv) + _selftest', FEATURES.length === 21, String(FEATURES.length));
    h.eq('manifest ids and order (a WP may not add, remove or reorder other lines)', FEATURES.map(e => e.id), EXPECT.map(r => r[0]));
    const fixed = e => [e.id, e.wp, e.name.ko, e.name.en, e.pages, e.phases, e.simple, e.liveSafe, e.gate];
    for (const row of EXPECT) {
      const e = FEATURES.find(x => x.id === row[0]);
      h.eq(`manifest line "${row[0]}": id · wp · names · pages · phases · simple · liveSafe · gate are as in WP-00b §5`, e ? fixed(e) : null, row);
    }
    const ids = new Set(), problems = [];
    for (const e of FEATURES) {
      if (ids.has(e.id)) problems.push(`duplicate id ${e.id}`); ids.add(e.id);
      if (!ID_RE.test(e.id)) problems.push(`bad id ${e.id}`);
      if (!/^WP-\d\d[abc]?$/.test(e.wp)) problems.push(`${e.id}: bad wp ${e.wp}`);
      if (!e.name?.ko || !e.name?.en) problems.push(`${e.id}: name needs ko and en`);
      if (!Array.isArray(e.pages) || !e.pages.length || e.pages.some(p => !PAGES.includes(p)) || new Set(e.pages).size !== e.pages.length) problems.push(`${e.id}: bad pages`);
      if (!Array.isArray(e.phases) || !e.phases.length || e.phases.some(p => !ALL.includes(p)) || new Set(e.phases).size !== e.phases.length) problems.push(`${e.id}: bad phases`);
      for (const k of ['simple', 'liveSafe', 'gate', 'default']) if (typeof e[k] !== 'boolean') problems.push(`${e.id}: ${k} must be a boolean`);
      if (!STATUSES.includes(e.status)) problems.push(`${e.id}: status must be ${STATUSES.join(' | ')}`);
      if (typeof e.load !== 'function') problems.push(`${e.id}: load must be a function`);
    }
    h.check('every manifest line is well-formed (id, wp, names, pages, phases, booleans, status, load)', problems.length === 0, problems.join(' | '));
    h.eq('gate: true is for prereg only (02 §2.2)', FEATURES.filter(e => e.gate).map(e => e.id), ['prereg']);
    h.check('_selftest stays planned forever (demo only) and off by default', FEATURES.find(e => e.id === '_selftest').status === 'planned' && FEATURES.find(e => e.id === '_selftest').default === false);
    h.check('bgm is off by default (music at the venue is the couple\'s decision)', FEATURES.find(e => e.id === 'bgm').default === false);
    h.check('no seat finder / arrival dashboard (declined by Patrick)', !FEATURES.some(e => /seat|arrival|dashboard/i.test(e.id)));
    // load 경로: 모든 줄이 같은 도우미 F() 로 만들어짐 = ./<id>/index.js 하나뿐
    h.check('every load() comes from the one helper: import(`./${id}/index.js`)', (src.match(/import\(/g) || []).length === 1 && src.includes('load: () => import(`./${id}/index.js`)'));
    h.check('every entry is built with F(…)', (src.match(/^\s*F\('/gm) || []).length === FEATURES.length, `${(src.match(/^\s*F\('/gm) || []).length} F() lines`);
  });

  // ---------------------------------------------------------------- 기능 폴더
  const dirs = fs.existsSync(featDir) ? fs.readdirSync(featDir, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name) : [];
  await h.step('feature folders: every folder belongs to a manifest line, every non-planned line has its folder, tests and guide', async () => {
    h.check('no folder without a manifest line', dirs.every(d => FEATURES.some(e => e.id === d)), dirs.filter(d => !FEATURES.some(e => e.id === d)).join(', '));
    for (const e of FEATURES) {
      if (e.status === 'planned' && !dirs.includes(e.id)) continue;
      h.check(`${e.id}: folder features/${e.id}/ with index.js and i18n.js`, dirs.includes(e.id) && fs.existsSync(path.join(featDir, e.id, 'index.js')) && fs.existsSync(path.join(featDir, e.id, 'i18n.js')));
      if (e.id[0] === '_' || e.status === 'planned') continue;
      h.check(`${e.id}: tests/features/${e.id}.mjs exists (status ${e.status})`, fs.existsSync(path.join(h.repo, 'tests/features', `${e.id}.mjs`)));
      h.check(`${e.id}: docs/guide/${e.id}.md exists (status ${e.status})`, fs.existsSync(path.join(h.repo, 'docs/guide', `${e.id}.md`)));
    }
  });

  for (const id of dirs.filter(d => FEATURES.some(e => e.id === d))) {
    await h.step(`feature "${id}": prefixes, forbidden list, import allow-list`, async () => {
      const dir = path.join(featDir, id), files = walk(dir);
      const tag = f => path.relative(featDir, f);
      const idx = path.join(dir, 'index.js'), i18nFile = path.join(dir, 'i18n.js');
      let keys = new Set();
      if (fs.existsSync(i18nFile)) {
        const r = lintI18n(read(i18nFile), id); keys = r.keys;
        h.check(`${id}/i18n.js: keys prefixed ${id}_, ko ⇄ en, no empty strings, \`export default D\``, r.problems.length === 0, r.problems.join(' | '));
      }
      if (fs.existsSync(idx)) {
        const src = read(idx);
        h.check(`${id}/index.js: exports setup(ctx) and i18n`, /export\s+(?:async\s+)?function\s+setup\s*\(/.test(src) && /export\s+(?:const|\{[^}]*\bi18n\b)/.test(src) && /\bi18n\b/.test(src));
        const wantsCss = /export\s+const\s+css\s*=\s*true/.test(src), hasCss = fs.existsSync(path.join(dir, 'style.css'));
        h.check(`${id}: \`export const css = true\` ⇔ style.css exists`, wantsCss === hasCss, `css=${wantsCss} file=${hasCss}`);
        if (/\bmarkOffHook\s*\(/.test(src)) h.check(`${id}: markOffHook() needs features/${id}/off.js exporting off()`, fs.existsSync(path.join(dir, 'off.js')) && /export\s+(?:async\s+)?function\s+off\s*\(/.test(read(path.join(dir, 'off.js'))));
        const used = lintKeysUsed(src, keys);
        h.check(`${id}/index.js: every ctx.t('literal') key exists in i18n.js`, used.length === 0, used.join(' | '));
      }
      for (const f of files.filter(f => /\.(js|mjs)$/.test(f))) {
        const problems = lintJs(read(f), id, { fileExists: r => fs.existsSync(path.join(path.dirname(f), r)) });
        h.check(`${tag(f)}: forbidden list (02 §12) and import allow-list (02 §1.1)`, problems.length === 0, problems.slice(0, 5).join(' | '));
      }
      for (const f of files.filter(f => f.endsWith('.css'))) {
        const problems = lintCss(read(f), id);
        h.check(`${tag(f)}: every selector and @keyframes is prefixed`, problems.length === 0, problems.slice(0, 5).join(' | '));
      }
      const odd = files.filter(f => /\.(html|htm)$/.test(f));
      h.check(`${id}: no HTML files inside a feature folder`, odd.length === 0, odd.map(tag).join(', '));
    });
  }

  // ---------------------------------------------------------------- 코어 모듈 구조
  await h.step('core modules: layout and dependency direction', async () => {
    const want = ['bus', 'phase', 'settings', 'schema', 'docdb', 'features', 'ui'];
    h.eq('public/js/core holds exactly the 7 modules of 01 §2 (a new core file is a design decision, not a side effect)', fs.readdirSync(coreDir).sort(), want.map(m => m + '.js').sort());
    const bad = [];
    for (const f of fs.readdirSync(coreDir).filter(f => f.endsWith('.js'))) {
      for (const im of parseImports(stripComments(read(path.join(coreDir, f))))) {
        const from = im.from || '';
        if (/(^|\/)features\//.test(from) && !(f === 'features.js' && from === '../features/index.js')) bad.push(`core/${f} → ${from}`);
        if (/(guest|village|admin)\.js$/.test(from)) bad.push(`core/${f} → ${from} (core must not import page scripts)`);
      }
    }
    h.check('core/* never imports a feature (only features.js reads the manifest) or a page script', bad.length === 0, bad.join(' | '));
    h.check('core/bus.js and core/schema.js import nothing (they run anywhere)', ['bus', 'schema'].every(m => parseImports(stripComments(read(path.join(coreDir, m + '.js')))).length === 0));
  });

  await h.step('allow-list (02 §1.1) names exist in the modules they point at', async () => {
    for (const [mod, names] of Object.entries(IMPORT_ALLOW)) {
      if (names === '*') continue;
      const target = path.resolve(featDir, 'x', mod);                    // '../../avatar.js' is relative to a feature folder (features/<id>/)
      const have = fs.existsSync(target) ? exportedNames(read(target)) : new Set();
      const want = names.filter(n => !NOT_YET.has(n));
      const missing = want.filter(n => !have.has(n));
      h.check(`${path.relative(js, target)} exports ${want.join(' ')}`, fs.existsSync(target) && missing.length === 0, missing.length ? `missing: ${missing.join(', ')}` : '');
    }
    h.check('core/ui.js exports the helpers of 02 §11', ['guestCode', 'detectLang', 'seeded', 'spriteCanvas', 'qrCanvas', 'fmtDate', 'ensureFonts', 'canvasText', 'downloadDataURL', 'downloadBlob', 'shareImage', 'compressImage', 'icsEvent', 'youtubeSource', 'youtubeFrame', 'youtubeCommand']
      .every(n => new RegExp(`export\\s+(?:async\\s+)?(?:function|const)\\s+${n}\\b|export\\s*\\{[^}]*\\b${n}\\b`).test(read(path.join(coreDir, 'ui.js')))));
  });

  await h.step('no new dependencies: package.json and public/js/vendor/ (02 §12-5)', async () => {
    const pkg = JSON.parse(read(path.join(h.repo, 'package.json')));
    h.eq('package.json: no dependencies, only playwright in devDependencies', [pkg.dependencies || {}, Object.keys(pkg.devDependencies || {})], [{}, ['playwright']]);
    const vendor = path.join(js, 'vendor');
    const have = walk(vendor).map(f => path.relative(vendor, f).split(path.sep).join('/')).sort();
    h.eq('public/js/vendor/ holds exactly the core\'s files (v3.3 set, no new file)', have, [...VENDOR_FILES].sort());
  });

  // ---------------------------------------------------------------- schema.js ↔ firestore.rules ↔ 03 문서 ↔ config
  const rulesFile = path.join(h.repo, 'firestore.rules'), rules = read(rulesFile);
  await h.step('schema.js declares exactly the paths firestore.rules matches (collections AND the two fixed app documents)', async () => {
    const S = await import(pathToFileURL(path.join(coreDir, 'schema.js')).href);
    const inRules = [...rules.matchAll(/^\s*match\s+\/(\S+)\s*\{/gm)].map(m => m[1]).filter(p => !p.startsWith('databases/'));
    const collections = inRules.filter(p => p.includes('{')), fixed = inRules.filter(p => !p.includes('{'));
    const norm = p => p.replace(/\{[^}]+\}/g, '{}');
    h.eq('rules: 17 collection patterns (16 + notes, 2026-10-07)', collections.length, 17);
    h.eq('rules: the two fixed documents', fixed.sort(), ['app/live', 'app/settings']);
    h.eq('every collection pattern in firestore.rules is in schema.js and vice versa', S.SCHEMA.filter(d => d.pattern.includes('{')).map(d => norm(d.pattern)).sort(), collections.map(norm).sort());
    h.eq('every fixed document path in firestore.rules is in schema.js and vice versa', S.SCHEMA.filter(d => !d.pattern.includes('{')).map(d => d.pattern).sort(), fixed.sort());
    h.check('schema.js has no pattern twice', new Set(S.SCHEMA.map(d => d.pattern)).size === S.SCHEMA.length);
  });

  await h.step('A4 firestore.rules is byte-for-byte the code block of docs/v4/03-data-and-rules.md §4', async () => {
    const doc = read(path.join(h.repo, 'docs/v4/03-data-and-rules.md'));
    const sec = doc.split('\n## 4. ')[1]?.split('\n## 5. ')[0] || '';
    const m = /```[^\n]*\n([\s\S]*?)\n```/.exec(sec);
    h.check('03 §4 has a rules code block', !!m);
    if (m) {
      const want = Buffer.from(m[1] + '\n', 'utf8'), have = fs.readFileSync(rulesFile);
      h.check('firestore.rules == 03 §4 (bytes)', want.equals(have), `doc ${want.length} B · file ${have.length} B`);
    }
  });

  await h.step('rules ↔ config.js (admin e-mails, capsule date inside the capsules block, snap slots)', async () => {
    const cfg = read(path.join(js, 'config.js'));
    const mails = s => (s || '').match(/'[^']+'/g)?.map(x => x.slice(1, -1).toLowerCase()).sort() || [];
    h.eq('admin e-mails: rules (isAdmin) = config.adminEmails', mails((rules.match(/email\.lower\(\) in \[([^\]]*)\]/) || [])[1]), mails((cfg.match(/adminEmails:\s*\[([^\]]*)\]/) || [])[1]));
    const open = (cfg.match(/capsuleOpen:\s*'(\d{4})-(\d{2})-(\d{2})'/) || []).slice(1).map(Number);
    const block = (rules.match(/match \/capsules\/\{id\} \{[\s\S]*?\n    \}/) || [''])[0];
    h.eq('capsule open date: timestamp.date(…) inside the capsules block = config.capsuleOpen', (block.match(/timestamp\.date\((\d{4}),\s*(\d{1,2}),\s*(\d{1,2})\)/) || []).slice(1).map(Number), open);
    const slots = (rules.match(/function snapSlotOk[\s\S]*?\n    \}/) || [''])[0].match(/\bin \[([^\]]*)\]/)?.[1].match(/'\d+'/g) || [];
    h.eq('snap slots: snapSlotOk lists snapLimitPerGuest slots', slots.length, Number((cfg.match(/snapLimitPerGuest:\s*(\d+)/) || [])[1]));
    h.check('config.schedule exists and archive defaults to null (03 §1)', /schedule:\s*\{[\s\S]*?weddingDate:\s*'2027-04-10'/.test(cfg) && /archive:\s*null/.test(cfg));
  });
};

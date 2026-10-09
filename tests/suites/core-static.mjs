// Static checks — no browser. Fast guard rails that catch the most common "it worked on my screen" mistakes.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { kioskFrom } from '../../tools/gen-kiosk.mjs';

export const meta = { title: 'kiosk sync, JS syntax, i18n parity, external hosts, rules ↔ config, size budgets', timeout: 60000, browser: false };

/** Hosts the site may reference. Adding one is an architecture decision → docs/v4/QUESTIONS.md first. */
const ALLOWED_HOSTS = ['www.gstatic.com', 'www.w3.org', 'www.youtube-nocookie.com'];   // youtube-nocookie: core/ui.js youtubeFrame only (WP-20, 03 §6)
/** v3.2 i18n keys that intentionally exist in one language only (fallback to ko is fine for these). */
const I18N_ONE_LANGUAGE_OK = [];

const walk = (dir, filter, acc = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, filter, acc); else if (filter(p)) acc.push(p);
  }
  return acc;
};

/** Evaluate the `const D = {…}` dictionary of an i18n module with a stub CONFIG. */
export function loadDictionary(src) {
  const m = src.match(/const D = (\{[\s\S]*?\n\});/);
  if (!m) return null;
  const stub = new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => 'X' : k === 'toString' ? () => 'X' : stub), apply: () => 'X' });
  return vm.runInNewContext('(' + m[1] + ')', { CONFIG: stub });
}

export default async (h) => {
  const pub = h.publicDir, js = path.join(pub, 'js');
  const read = f => fs.readFileSync(f, 'utf8');
  const rel = f => path.relative(h.repo, f);

  await h.step('kiosk.html is generated from index.html', async () => {
    const want = kioskFrom(read(path.join(pub, 'index.html')));
    h.check('kiosk.html in sync with index.html (npm run gen:kiosk)', want === read(path.join(pub, 'kiosk.html')));
  });

  await h.step('every app JS file parses', async () => {
    const files = walk(js, f => f.endsWith('.js') && !f.includes(`${path.sep}vendor${path.sep}`));
    const bad = [];
    for (const f of files) {
      const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
      if (r.status !== 0) bad.push(rel(f) + ': ' + (r.stderr || '').split('\n').find(l => /Error/.test(l)));
    }
    h.check(`all ${files.length} app JS files parse (node --check)`, bad.length === 0, bad.join(' | '));
  });

  await h.step('i18n KO/EN parity', async () => {
    const files = walk(js, f => /(^|[\\/])i18n\.js$/.test(f) && !f.includes('vendor'));
    for (const f of files) {
      const D = loadDictionary(read(f));
      if (!D) { h.check(`${rel(f)} has a "const D = {…}" dictionary`, false); continue; }
      const ko = Object.keys(D.ko || {}), en = Object.keys(D.en || {});
      const onlyKo = ko.filter(k => !(k in D.en) && !I18N_ONE_LANGUAGE_OK.includes(k));
      const onlyEn = en.filter(k => !(k in D.ko) && !I18N_ONE_LANGUAGE_OK.includes(k));
      h.check(`${rel(f)}: every ko key has en`, onlyKo.length === 0, onlyKo.join(', '));
      h.check(`${rel(f)}: every en key has ko`, onlyEn.length === 0, onlyEn.join(', '));
      const empty = [...ko.filter(k => D.ko[k] === ''), ...en.filter(k => D.en[k] === '')];
      h.check(`${rel(f)}: no empty strings`, empty.length === 0, empty.join(', '));
    }
  });

  await h.step('only allowed external hosts', async () => {
    const files = walk(pub, f => /\.(js|mjs|html|css|webmanifest)$/.test(f) && !f.includes(`${path.sep}vendor${path.sep}`));
    const hits = [];
    for (const f of files) for (const m of read(f).matchAll(/https?:\/\/([a-z0-9.-]+)/gi)) if (!ALLOWED_HOSTS.includes(m[1].toLowerCase())) hits.push(`${rel(f)} → ${m[1]}`);
    h.check('no new external hosts (CDNs, APIs) in public/', hits.length === 0, [...new Set(hits)].join(' | '));
  });

  await h.step('firestore.rules agrees with config.js', async () => {
    const rules = read(path.join(h.repo, 'firestore.rules')), cfg = read(path.join(js, 'config.js'));
    h.check('rules_version = 2', /rules_version\s*=\s*'2'/.test(rules));
    const opens = (rules.match(/\{/g) || []).length, closes = (rules.match(/\}/g) || []).length;
    h.check('rules braces balanced', opens === closes, `${opens} { vs ${closes} }`);
    const ruleEmails = (rules.match(/email\.lower\(\) in \[([^\]]*)\]/) || [])[1]?.match(/'[^']+'/g)?.map(s => s.slice(1, -1).toLowerCase()).sort() || [];
    const cfgEmails = (cfg.match(/adminEmails:\s*\[([^\]]*)\]/) || [])[1]?.match(/'[^']+'/g)?.map(s => s.slice(1, -1).toLowerCase()).sort() || [];
    h.eq('admin emails identical in rules and config', ruleEmails, cfgEmails);
    const open = (cfg.match(/capsuleOpen:\s*'(\d{4})-(\d{2})-(\d{2})'/) || []).slice(1).map(Number);
    // pinned to the capsules block: other blocks have their own timestamp.date(…) (pulse's 2000-01-01 default, anniv's window)
    const capsulesBlock = (rules.match(/match \/capsules\/\{id\} \{[\s\S]*?\n    \}/) || [''])[0];
    const ruleDate = (capsulesBlock.match(/timestamp\.date\((\d{4}),\s*(\d{1,2}),\s*(\d{1,2})\)/) || []).slice(1).map(Number);
    h.eq('capsule open date identical in rules and config', ruleDate, open);
  });

  await h.step('size budgets', async () => {
    // public/archive/ (WP-14) holds exported photos — data, not app code — so it has no per-file budget
    const big = walk(pub, f => !f.includes(`${path.sep}vendor${path.sep}`) && !f.includes(`${path.sep}fonts${path.sep}`) && !f.includes(`${path.sep}archive${path.sep}`))
      .map(f => [f, fs.statSync(f).size])
      .filter(([f, s]) => (f.endsWith('.js') && s > 120_000) || (f.endsWith('.css') && s > 80_000) || s > 400_000);
    h.check('no app file over budget (js 120 KB, css 80 KB, other 400 KB)', big.length === 0, big.map(([f, s]) => `${rel(f)} ${(s / 1024).toFixed(0)} KB`).join(', '));
  });
};

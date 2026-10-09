#!/usr/bin/env node
// ============================================================
//  kiosk.html is generated from index.html (same markup, body class "guest kiosk", different title).
//  Never edit kiosk.html by hand.
//
//    node tools/gen-kiosk.mjs           → rewrite public/kiosk.html
//    node tools/gen-kiosk.mjs --check   → exit 1 if kiosk.html is out of date (used by the test suite)
// ============================================================
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PUB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

export function kioskFrom(indexHtml) {
  const swaps = [
    ['<title>Wedding Guestbook</title>', '<title>Guestbook Kiosk</title>'],
    ['<body class="guest">', '<body class="guest kiosk">'],
  ];
  let out = indexHtml;
  for (const [a, b] of swaps) {
    if (!out.includes(a)) throw new Error(`gen-kiosk: marker not found in index.html: ${a}`);
    out = out.replace(a, b);
  }
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const want = kioskFrom(readFileSync(path.join(PUB, 'index.html'), 'utf8'));
  const file = path.join(PUB, 'kiosk.html');
  if (process.argv.includes('--check')) {
    const have = readFileSync(file, 'utf8');
    if (have !== want) { console.error('kiosk.html is out of date → run: npm run gen:kiosk'); process.exit(1); }
    console.log('kiosk.html is up to date');
  } else { writeFileSync(file, want); console.log('wrote public/kiosk.html'); }
}

// Tiny, dependency-free readers for files the app downloads (backups, PNGs, CSVs).
import { inflateRawSync } from 'node:zlib';

/** Names of the entries in a ZIP buffer (reads the central directory). */
export function zipEntries(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) return [];
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const names = [];
  for (let i = 0; i < count && p + 46 <= buf.length && buf.readUInt32LE(p) === 0x02014b50; i++) {
    const n = buf.readUInt16LE(p + 28), x = buf.readUInt16LE(p + 30), c = buf.readUInt16LE(p + 32);
    names.push(buf.toString('utf8', p + 46, p + 46 + n));
    p += 46 + n + x + c;
  }
  return names;
}

/** Text of one entry of a ZIP buffer (stored or deflated), or null when the name is not in it. Uses the central directory, so data-descriptor ZIPs (JSZip) work. */
export function zipRead(buf, name) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) return null;
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let i = 0; i < count && p + 46 <= buf.length && buf.readUInt32LE(p) === 0x02014b50; i++) {
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20), lho = buf.readUInt32LE(p + 42);
    const n = buf.readUInt16LE(p + 28), x = buf.readUInt16LE(p + 30), c = buf.readUInt16LE(p + 32);
    if (buf.toString('utf8', p + 46, p + 46 + n) === name) {
      const start = lho + 30 + buf.readUInt16LE(lho + 26) + buf.readUInt16LE(lho + 28), raw = buf.subarray(start, start + csize);
      return (method === 0 ? raw : inflateRawSync(raw)).toString('utf8');
    }
    p += 46 + n + x + c;
  }
  return null;
}

export const isPng = buf => buf.length > 24 && buf.subarray(1, 4).toString() === 'PNG';
export const isJpeg = buf => buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8;
export const isPdf = buf => buf.length > 5 && buf.subarray(0, 5).toString() === '%PDF-';
/** { width, height } of a PNG buffer. */
export const pngSize = buf => ({ width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) });

/** Minimal CSV parser (quotes, doubled quotes, CRLF, BOM). Returns rows of strings. */
export function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; continue; }
    if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

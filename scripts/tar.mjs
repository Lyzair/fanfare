// Minimal streaming .tar.gz writer (POSIX ustar + gzip from node:zlib), so packaging needs no
// extra dependency and runs the same on Windows. Regular files only; tar creates the folders.
import { createReadStream, createWriteStream, statSync } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';

const BLOCK = 512;

/** Split a path into ustar's prefix (<= 155 bytes) and name (<= 100 bytes) at a slash. */
function splitName(path) {
  if (Buffer.byteLength(path) <= 100) return ['', path];
  for (let i = path.indexOf('/'); i !== -1; i = path.indexOf('/', i + 1)) {
    const prefix = path.slice(0, i), name = path.slice(i + 1);
    if (Buffer.byteLength(prefix) <= 155 && Buffer.byteLength(name) <= 100 && name) return [prefix, name];
  }
  throw new Error(`Path too long for a tar archive: ${path}`);
}

function header(name, mode, size, mtime) {
  const h = Buffer.alloc(BLOCK);
  const field = (value, offset, length) => h.write(value, offset, length, 'utf8');
  const octal = (n, offset, length) => field(n.toString(8).padStart(length - 1, '0') + '\0', offset, length);
  const [prefix, short] = splitName(name);
  field(short, 0, 100);
  octal(mode, 100, 8);
  octal(0, 108, 8); // uid
  octal(0, 116, 8); // gid
  octal(size, 124, 12);
  octal(Math.floor(mtime.getTime() / 1000), 136, 12);
  field('        ', 148, 8); // checksum is computed with this field as spaces
  field('0', 156, 1); // regular file
  field('ustar\0', 257, 6);
  field('00', 263, 2);
  field(prefix, 345, 155);
  let sum = 0;
  for (const b of h) sum += b;
  field(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8);
  return h;
}

async function* tarStream(entries) {
  for (const { src, name, mode, mtime } of entries) {
    const size = statSync(src).size;
    yield header(name, mode, size, mtime);
    for await (const chunk of createReadStream(src, { highWaterMark: 1 << 20 })) yield chunk;
    const pad = (BLOCK - (size % BLOCK)) % BLOCK;
    if (pad) yield Buffer.alloc(pad);
  }
  yield Buffer.alloc(BLOCK * 2); // end of archive
}

/**
 * Write `entries` ({ src, name, mode, mtime }) to `outPath` as a gzip-compressed ustar archive.
 * @returns {Promise<void>}
 */
export async function writeTarGz(outPath, entries) {
  await pipeline(Readable.from(tarStream(entries)), createGzip({ level: 6 }), createWriteStream(outPath));
}

#!/usr/bin/env node
// Draws the Fanfare trumpet icon: writes public/icons/icon.svg and the 192/512 PNGs
// from the same shapes (no rasteriser dependency; pngjs only).
import { mkdir, writeFile } from 'node:fs/promises';
import { PNG } from 'pngjs';

const BG = '#1a7431';
const FG = '#ffffff';
// 512x512 units, content kept inside the maskable safe zone (centre 80%).
const SHAPES = [
  [[120, 225], [165, 225], [165, 295], [120, 295]], // mouthpiece
  [[165, 215], [345, 125], [345, 395], [165, 305]], // bell
  [[200, 308], [250, 322], [232, 395], [190, 395]], // grip
  [[372, 200], [392, 190], [392, 330], [372, 320]], // sound
  [[410, 170], [430, 160], [430, 360], [410, 350]], // sound
];

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="${BG}"/>${SHAPES.map(
  (p) => `<polygon fill="${FG}" points="${p.map((q) => q.join(',')).join(' ')}"/>`,
).join('')}</svg>\n`;

function inside(poly, x, y) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

function png(size) {
  const img = new PNG({ width: size, height: size });
  const k = 512 / size;
  const SS = 4;
  const bg = [0x1a, 0x74, 0x31];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let hit = 0;
      for (let sy = 0; sy < SS; sy++)
        for (let sx = 0; sx < SS; sx++) {
          const px = (x + (sx + 0.5) / SS) * k;
          const py = (y + (sy + 0.5) / SS) * k;
          if (SHAPES.some((p) => inside(p, px, py))) hit++;
        }
      const a = hit / (SS * SS);
      const i = (y * size + x) * 4;
      for (let c = 0; c < 3; c++) img.data[i + c] = Math.round(bg[c] * (1 - a) + 255 * a);
      img.data[i + 3] = 255;
    }
  }
  return PNG.sync.write(img);
}

await mkdir('public/icons', { recursive: true });
await writeFile('public/icons/icon.svg', svg);
for (const s of [192, 512]) await writeFile(`public/icons/icon-${s}.png`, png(s));
console.log('icons written');

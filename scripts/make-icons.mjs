// Generates the app icons (PNG + SVG) with no dependencies: navy tile with three rising bars.
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'icons');
mkdirSync(OUT, { recursive: true });
const BG = [0x1f, 0x3a, 0x5f], FG = [0xff, 0xff, 0xff], GOLD = [0xf2, 0xb5, 0x4a];

// Shapes in a 0..1 unit square. Bars sit inside the 60% centre so maskable crops are safe.
const bars = [
  { x: 0.27, w: 0.12, top: 0.56, c: FG },
  { x: 0.44, w: 0.12, top: 0.44, c: FG },
  { x: 0.61, w: 0.12, top: 0.30, c: GOLD },
];
const BASE = 0.72;

function render(size, { rounded }) {
  const px = Buffer.alloc(size * size * 4);
  const r = rounded ? 0.22 : 0;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let cov = 0, col = [0, 0, 0], ss = 4;
    let acc = [0, 0, 0, 0];
    for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
      const u = (x + (sx + 0.5) / ss) / size, v = (y + (sy + 0.5) / ss) / size;
      if (r) { // rounded corners
        const cx = Math.min(Math.max(u, r), 1 - r), cy = Math.min(Math.max(v, r), 1 - r);
        if ((u - cx) ** 2 + (v - cy) ** 2 > r * r) continue;
      }
      let c = BG;
      for (const b of bars) {
        const rr = b.w / 2;
        if (u >= b.x && u <= b.x + b.w && v <= BASE && v >= b.top) {
          // rounded bar top
          const cyTop = b.top + rr;
          if (v < cyTop && (u - (b.x + rr)) ** 2 + (v - cyTop) ** 2 > rr * rr) continue;
          c = b.c;
        }
      }
      acc[0] += c[0]; acc[1] += c[1]; acc[2] += c[2]; acc[3] += 1;
    }
    const n = ss * ss, i = (y * size + x) * 4;
    if (acc[3]) { px[i] = acc[0] / acc[3]; px[i + 1] = acc[1] / acc[3]; px[i + 2] = acc[2] / acc[3]; }
    px[i + 3] = Math.round((acc[3] / n) * 255);
  }
  return png(size, px);
}

function png(size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

writeFileSync(join(OUT, 'icon-192.png'), render(192, { rounded: true }));
writeFileSync(join(OUT, 'icon-512.png'), render(512, { rounded: true }));
writeFileSync(join(OUT, 'maskable-512.png'), render(512, { rounded: false }));
const hex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
writeFileSync(join(OUT, 'icon.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="${hex(BG)}"/>${bars.map((b) => `<path d="M${b.x * 100} ${BASE * 100}V${(b.top + b.w / 2) * 100}a${b.w * 50} ${b.w * 50} 0 0 1 ${b.w * 100} 0V${BASE * 100}z" fill="${hex(b.c)}"/>`).join('')}</svg>\n`);
console.log('icons written to', OUT);

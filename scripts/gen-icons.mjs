// Generates PWA icons (pwa-192.png, pwa-512.png) matching the in-app "T" badge.
// Pure Node — no dependencies. Draws a rounded teal square with a centered white "T"
// into a raw RGBA buffer, then encodes a valid PNG via the built-in zlib.
//
//   node scripts/gen-icons.mjs
//
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(__dirname, '..', 'public');

// Brand teal (#2D9B8A) + white
const WHITE = [0xff, 0xff, 0xff];
const BG = [0x2d, 0x9b, 0x8a]; // full-bleed teal so it reads well as a maskable icon

// ── Tiny CRC32 + PNG encoder ────────────────────────────────────────────────
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function encodePng(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // color type RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  // raw scanlines with filter byte 0 per row
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Drawing helpers ─────────────────────────────────────────────────────────
function makeCanvas(size) {
  const buf = Buffer.alloc(size * size * 4);
  return { size, buf };
}
function setPx(c, x, y, [r, g, b], a = 255) {
  if (x < 0 || y < 0 || x >= c.size || y >= c.size) return;
  const i = (y * c.size + x) * 4;
  c.buf[i] = r; c.buf[i + 1] = g; c.buf[i + 2] = b; c.buf[i + 3] = a;
}
// Filled rounded rectangle
function roundRect(c, x0, y0, x1, y1, radius, color) {
  for (let y = Math.floor(y0); y < Math.ceil(y1); y++) {
    for (let x = Math.floor(x0); x < Math.ceil(x1); x++) {
      let inside = true;
      // corner checks
      const corners = [
        [x0 + radius, y0 + radius], [x1 - radius, y0 + radius],
        [x0 + radius, y1 - radius], [x1 - radius, y1 - radius],
      ];
      if (x < x0 + radius && y < y0 + radius) inside = dist(x, y, corners[0]) <= radius;
      else if (x > x1 - radius && y < y0 + radius) inside = dist(x, y, corners[1]) <= radius;
      else if (x < x0 + radius && y > y1 - radius) inside = dist(x, y, corners[2]) <= radius;
      else if (x > x1 - radius && y > y1 - radius) inside = dist(x, y, corners[3]) <= radius;
      if (inside) setPx(c, x, y, color);
    }
  }
}
function dist(x, y, [cx, cy]) {
  return Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
}
function fillRect(c, x0, y0, x1, y1, color) {
  for (let y = Math.floor(y0); y < Math.ceil(y1); y++)
    for (let x = Math.floor(x0); x < Math.ceil(x1); x++)
      setPx(c, x, y, color);
}

// Draw a bold sans-serif "T" centered, sized relative to canvas
function drawT(c, color) {
  const s = c.size;
  // T occupies the central ~46% of the icon (safe zone for maskable)
  const topW = s * 0.46;       // width of the top bar
  const barH = s * 0.11;       // thickness of the top bar
  const stemW = s * 0.13;      // thickness of the vertical stem
  const totalH = s * 0.46;     // full height of the T
  const cx = s / 2;
  const top = (s - totalH) / 2;
  // top horizontal bar
  fillRect(c, cx - topW / 2, top, cx + topW / 2, top + barH, color);
  // vertical stem
  fillRect(c, cx - stemW / 2, top, cx + stemW / 2, top + totalH, color);
}

function buildIcon(size) {
  const c = makeCanvas(size);
  // background: full-bleed teal rounded square
  roundRect(c, 0, 0, size, size, size * 0.22, BG);
  drawT(c, WHITE);
  return encodePng(size, size, c.buf);
}

mkdirSync(PUBLIC, { recursive: true });
for (const size of [192, 512]) {
  const png = buildIcon(size);
  const file = join(PUBLIC, `pwa-${size}.png`);
  writeFileSync(file, png);
  console.log(`wrote ${file} (${png.length} bytes, ${size}x${size})`);
}

// 生成桌面外壳的图标：把游戏的主菜单符号直接画成 PNG，再包成 Windows 的 ICO。
// 不依赖任何图形库 —— 纯数学 + Node 自带的 zlib。
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SIZE = 256;
const SS = 3; // 超采样倍数，用来抗锯齿

const BG = [9, 31, 38];
const INK = [211, 255, 135];

function roundedRectCoverage(x, y, size, radius) {
  const inset = size * 0.055;
  const left = inset, right = size - inset, top = inset, bottom = size - inset;
  if (x < left || x > right || y < top || y > bottom) return 0;
  const cx = Math.min(Math.max(x, left + radius), right - radius);
  const cy = Math.min(Math.max(y, top + radius), bottom - radius);
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= radius * radius ? 1 : 0;
}

function ringCoverage(x, y, size) {
  const c = size / 2;
  const dx = x - c, dy = y - c;
  const r = Math.hypot(dx, dy);
  const outer = size * 0.335, inner = size * 0.283;
  if (r <= outer && r >= inner) return 1;
  if (r < size * 0.082) return 1;
  // 四条刻度
  const tick = size * 0.055;
  const onVertical = Math.abs(dx) <= tick && r >= size * 0.335 && r <= size * 0.44;
  const onHorizontal = Math.abs(dy) <= tick && r >= size * 0.335 && r <= size * 0.44;
  return onVertical || onHorizontal ? 1 : 0;
}

const pixels = Buffer.alloc(SIZE * SIZE * 4);
for (let py = 0; py < SIZE; py++) {
  for (let px = 0; px < SIZE; px++) {
    let bgHits = 0, inkHits = 0;
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const x = px + (sx + 0.5) / SS, y = py + (sy + 0.5) / SS;
        if (roundedRectCoverage(x, y, SIZE, SIZE * 0.22)) bgHits++;
        if (ringCoverage(x, y, SIZE)) inkHits++;
      }
    }
    const samples = SS * SS;
    const bgA = bgHits / samples, inkA = inkHits / samples;
    const offset = (py * SIZE + px) * 4;
    // 先铺底色，再把符号叠上去
    let r = BG[0], g = BG[1], b = BG[2];
    const mix = inkA * (1 - bgA * 0.15);
    r = Math.round(r * (1 - mix) + INK[0] * mix);
    g = Math.round(g * (1 - mix) + INK[1] * mix);
    b = Math.round(b * (1 - mix) + INK[2] * mix);
    pixels[offset] = r;
    pixels[offset + 1] = g;
    pixels[offset + 2] = b;
    pixels[offset + 3] = Math.round(255 * bgA);
  }
}

// 极简 PNG 编码：IHDR + IDAT + IEND
function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([length, body, crc]);
}

const crcTable = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = -1;
  for (let i = 0; i < buffer.length; i++) c = crcTable[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  return c ^ -1;
}

function encodePng(rgba, size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const png = encodePng(pixels, SIZE);
fs.mkdirSync(path.join(root, 'build'), { recursive: true });
fs.writeFileSync(path.join(root, 'build', 'icon.png'), png);

// Windows ICO：Vista 以后允许直接塞 PNG
const icoHeader = Buffer.alloc(6);
icoHeader.writeUInt16LE(0, 0);
icoHeader.writeUInt16LE(1, 2);
icoHeader.writeUInt16LE(1, 4);
const icoEntry = Buffer.alloc(16);
icoEntry[0] = SIZE === 256 ? 0 : SIZE;
icoEntry[1] = SIZE === 256 ? 0 : SIZE;
icoEntry[2] = 0;
icoEntry[3] = 0;
icoEntry.writeUInt16LE(1, 4);
icoEntry.writeUInt16LE(32, 6);
icoEntry.writeUInt32LE(png.length, 8);
icoEntry.writeUInt32LE(22, 12);
fs.writeFileSync(path.join(root, 'build', 'icon.ico'), Buffer.concat([icoHeader, icoEntry, png]));
console.log('icon written:', path.join(root, 'build', 'icon.ico'));

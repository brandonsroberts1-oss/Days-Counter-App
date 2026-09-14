/**
 * Generates the app's PNG icons with no dependencies.
 * Draws a warm gradient tile with a tally-mark glyph, supersampled 4x for
 * smooth edges, then encodes to PNG by hand (zlib + CRC32).
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const OUT = new URL('../assets/icons/', import.meta.url);
mkdirSync(OUT, { recursive: true });

// ---------- tiny PNG encoder ----------
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
function encodePNG(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // colour type RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- geometry ----------
// Signed distance to a rounded rect centred at (cx,cy), rotated by `rot` radians.
function sdRoundRect(px, py, cx, cy, w, h, r, rot = 0) {
  let dx = px - cx, dy = py - cy;
  if (rot) {
    const c = Math.cos(-rot), s = Math.sin(-rot);
    [dx, dy] = [dx * c - dy * s, dx * s + dy * c];
  }
  const qx = Math.abs(dx) - (w / 2 - r);
  const qy = Math.abs(dy) - (h / 2 - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

// Warm ember gradient, top-left to bottom-right.
const G0 = hex('#F2A65A'), G1 = hex('#D1582A'), G2 = hex('#A8371B');
const INK = hex('#FFF7EE');

function draw(size, { bleed = false } = {}) {
  const px = Buffer.alloc(size * size * 4);
  const SS = 4;                       // supersample factor
  const S = size;
  const tileR = bleed ? 0 : S * 0.225; // maskable icons are full-bleed
  const scale = bleed ? 0.62 : 0.78;   // keep the glyph inside the safe zone

  // tally glyph: four uprights + one diagonal stroke
  const gw = S * scale, gh = S * scale;
  const cx = S / 2, cy = S / 2;
  const barW = gw * 0.115, barH = gh * 0.66, gap = gw * 0.085;
  const totalW = barW * 4 + gap * 3;
  const bars = [];
  for (let i = 0; i < 4; i++) {
    bars.push({ x: cx - totalW / 2 + barW / 2 + i * (barW + gap), y: cy, w: barW, h: barH, r: barW / 2, rot: 0 });
  }
  const diag = { x: cx, y: cy, w: barW, h: totalW * 1.24, r: barW / 2, rot: -Math.PI / 3.1 };

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let acc = [0, 0, 0], alpha = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const fx = x + (sx + 0.5) / SS, fy = y + (sy + 0.5) / SS;
          const inTile = bleed ? true : sdRoundRect(fx, fy, cx, cy, S, S, tileR) <= 0;
          if (!inTile) continue;
          // gradient background
          const t = Math.min(1, Math.max(0, (fx / S) * 0.5 + (fy / S) * 0.5));
          let col = t < 0.55 ? mix(G0, G1, t / 0.55) : mix(G1, G2, (t - 0.55) / 0.45);
          // glyph on top
          let inGlyph = sdRoundRect(fx, fy, diag.x, diag.y, diag.w, diag.h, diag.r, diag.rot) <= 0;
          if (!inGlyph) {
            for (const b of bars) {
              if (sdRoundRect(fx, fy, b.x, b.y, b.w, b.h, b.r, b.rot) <= 0) { inGlyph = true; break; }
            }
          }
          if (inGlyph) col = INK;
          acc = [acc[0] + col[0], acc[1] + col[1], acc[2] + col[2]];
          alpha++;
        }
      }
      const n = SS * SS;
      const i = (y * S + x) * 4;
      if (alpha === 0) { px[i] = px[i + 1] = px[i + 2] = px[i + 3] = 0; continue; }
      px[i] = Math.round(acc[0] / alpha);
      px[i + 1] = Math.round(acc[1] / alpha);
      px[i + 2] = Math.round(acc[2] / alpha);
      px[i + 3] = Math.round((alpha / n) * 255);
    }
  }
  return encodePNG(S, S, px);
}

const files = [
  ['icon-192.png', 192, {}],
  ['icon-512.png', 512, {}],
  ['icon-maskable-512.png', 512, { bleed: true }],
  ['apple-touch-icon.png', 180, { bleed: true }],
];
for (const [name, size, opts] of files) {
  writeFileSync(new URL(name, OUT), draw(size, opts));
  console.log('wrote', name, size + 'px');
}

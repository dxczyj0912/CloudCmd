/* ==========================================================================
   tools/android/icons.js · 生成 API 26 以下的 PNG 兜底图标
   --------------------------------------------------------------------------
   Android 8.0（API 26）起用"自适应图标"（XML 矢量，见 res/mipmap-anydpi-v26/），
   但 minSdk 24 还要给 7.x 准备传统 PNG。

   为什么用代码画、而不是往仓库里塞图片：
     · 项目从第一天起就没有二进制资源，图标也不该破例
     · 图标本身很简单（圆角方块/圆 + 白云 + 一个 ">"），画出来只要几十行
     · 颜色改了不用重导图片，改一个常量就行

   PNG 编码是手写的（IHDR + IDAT + IEND，zlib 用 Node 自带的），
   所以这里不需要任何图像库。用 3x3 超采样做抗锯齿。
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

/* 与 res/values/colors.xml、站点 --accent 保持一致 */
const BRAND = [0x2F, 0x6B, 0xFF];
const WHITE = [0xFF, 0xFF, 0xFF];

/* ---------- PNG 编码 ---------- */
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
/** rgba：长度 w*h*4 的 Uint8Array */
function encodePNG(w, h, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;    /* bit depth */
  ihdr[9] = 6;    /* color type: RGBA */
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;                       /* filter: none */
    Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4)
      .copy(raw, y * (w * 4 + 1) + 1);
  }
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ---------- 几何（都在 24x24 的坐标系里描述，再按尺寸缩放） ---------- */
/** 圆角方形 */
function inRoundedSquare(x, y, r) {
  const ax = Math.abs(x - 12), ay = Math.abs(y - 12);
  if (ax > 12 || ay > 12) return false;
  const cx = ax - (12 - r), cy = ay - (12 - r);
  if (cx <= 0 || cy <= 0) return true;
  return cx * cx + cy * cy <= r * r;
}
function inCircle(x, y) {
  const dx = x - 12, dy = y - 12;
  return dx * dx + dy * dy <= 12 * 12;
}
/** 白云：三个圆 + 一个底边矩形的并集（和 res/drawable/ic_launcher_foreground.xml 同一朵云） */
function inCloud(x, y) {
  if ((x - 8.5) ** 2 + (y - 14.0) ** 2 <= 4.6 ** 2) return true;   /* 左团 */
  if ((x - 12.0) ** 2 + (y - 10.4) ** 2 <= 5.6 ** 2) return true;  /* 顶团 */
  if ((x - 16.2) ** 2 + (y - 12.6) ** 2 <= 4.0 ** 2) return true;  /* 右团 */
  if (x >= 4.6 && x <= 19.6 && y >= 13.5 && y <= 18.4) return true; /* 底边 */
  return false;
}
/** 终端提示符 ">"：两条边组成的箭头。
    必须**整条落在云里面** —— 早先的坐标有一截伸到云外，蓝底上直接看不见，
    剩下的部分看着像个多余的缺口。现在三个端点都在云内：
    左上 (10.6,13.0) 在顶部圆里，尖角 (13.0,15.4) 与右下 (10.6,17.8) 在底边矩形里。 */
function inChevron(x, y) {
  const tipX = 12.9, tipY = 15.3;
  const topX = 11.3, topY = 13.5;
  const botX = 11.3, botY = 17.1;
  const t = 0.82;                     /* 线宽（24 坐标系里）——
                                         太粗会让 48px 的小图标糊成一团，
                                         这个粗细在 48px 上约 1.6px，仍然看得清是一个 ">"。 */
  function distToSeg(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const len2 = dx * dx + dy * dy || 1;
    let u = ((px - x1) * dx + (py - y1) * dy) / len2;
    u = Math.max(0, Math.min(1, u));
    const qx = x1 + u * dx, qy = y1 + u * dy;
    return Math.sqrt((px - qx) ** 2 + (py - qy) ** 2);
  }
  return distToSeg(x, y, topX, topY, tipX, tipY) <= t ||
    distToSeg(x, y, tipX, tipY, botX, botY) <= t;
}

/* ---------- 渲染 ---------- */
const SS = 3;   /* 3x3 超采样抗锯齿 */

function render(size, shape) {
  const out = new Uint8Array(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          /* 像素中心映射回 24x24 坐标系 */
          const u = (px + (sx + 0.5) / SS) / size * 24;
          const v = (py + (sy + 0.5) / SS) / size * 24;
          const inside = shape === 'round' ? inCircle(u, v) : inRoundedSquare(u, v, 5.2);
          let col = null;
          if (inside) {
            if (inCloud(u, v)) col = inChevron(u, v) ? BRAND : WHITE;
            else if (inChevron(u, v)) col = WHITE;
            else col = BRAND;
          }
          if (col) { r += col[0]; g += col[1]; b += col[2]; a += 255; }
        }
      }
      const n = SS * SS;
      const i = (py * size + px) * 4;
      if (a === 0) { out[i] = out[i + 1] = out[i + 2] = out[i + 3] = 0; continue; }
      /* 颜色按"被覆盖的采样点"求平均；alpha 单独给出覆盖率 */
      const cover = a / n;
      const cnt = a / 255;
      out[i] = Math.round(r / cnt);
      out[i + 1] = Math.round(g / cnt);
      out[i + 2] = Math.round(b / cnt);
      out[i + 3] = Math.round(cover);
    }
  }
  return out;
}

const DENSITIES = [
  ['mdpi', 48],
  ['hdpi', 72],
  ['xhdpi', 96],
  ['xxhdpi', 144],
  ['xxxhdpi', 192],
];

/**
 * 在 resDir 下生成各密度档的 ic_launcher.png 与 ic_launcher_round.png。
 * @returns {number} 生成的文件数
 */
function generate(resDir) {
  let n = 0;
  for (const [dpi, size] of DENSITIES) {
    const dir = path.join(resDir, 'mipmap-' + dpi);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'ic_launcher.png'), encodePNG(size, size, render(size, 'square')));
    fs.writeFileSync(path.join(dir, 'ic_launcher_round.png'), encodePNG(size, size, render(size, 'round')));
    n += 2;
  }
  return n;
}

module.exports = { generate, encodePNG, render };

/* ==========================================================================
   tools/android/zip.js · 极简 ZIP 读写（只为打 APK 用）
   --------------------------------------------------------------------------
   为什么需要它：APK 就是一个 ZIP。用 aapt2 link 产出的是"有资源、有 assets、
   但没有代码"的 APK，还需要把 d8 编出来的 classes.dex 放进去。

   为什么不用 `jar uf`：JDK 的 jar 工具会把整个包**重新压缩**，而
   Android 11+（targetSdk 30+）要求 `resources.arsc` 必须是**未压缩**且 4 字节对齐的。
   jar 一旦把它 deflate 掉，APK 在真机上会直接装不上（而且报错很含糊）。
   与其赌 jar 的行为，不如自己按条目**原样搬运**：读进来什么压缩方式，写出去还是什么。

   为什么不引 npm 的 archiver/jszip：整个项目零依赖，构建脚本也不该破例。

   ZIP 格式要点（都踩过）：
     · 数据起始位置必须从**本地头**读 nameLen/extraLen —— 中央目录里那份长度
       和本地头可能不一样，用错了会读到错误偏移
     · EOCD 要从文件末尾往前扫签名，因为后面可能跟着注释
     · 目录条目的名字以 `/` 结尾，且通常不压缩
   ========================================================================== */
'use strict';

const fs = require('fs');
const zlib = require('zlib');

/* CRC32：Node 22+ 自带 zlib.crc32，老版本用查表兜底 */
const CRC_TABLE = (function () {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  if (typeof zlib.crc32 === 'function') return zlib.crc32(buf) >>> 0;
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

/** 读一个 ZIP，返回 [{name, method, data(Buffer, 已解压), isDir, externalAttrs, dostime, dosdate}] */
function readZip(file) {
  const buf = fs.readFileSync(file);
  /* 从尾部往前找 EOCD（签名 0x06054b50），最多找 64KB 注释 */
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65558); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd === -1) throw new Error('不是有效的 ZIP（找不到 EOCD）：' + file);

  const total = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const entries = [];

  for (let i = 0; i < total; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('中央目录签名不对 @' + p);
    const flags = buf.readUInt16LE(p + 8);
    const method = buf.readUInt16LE(p + 10);
    const dostime = buf.readUInt16LE(p + 12);
    const dosdate = buf.readUInt16LE(p + 14);
    const crc = buf.readUInt32LE(p + 16);
    const compSize = buf.readUInt32LE(p + 20);
    const uncompSize = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const externalAttrs = buf.readUInt32LE(p + 38);
    const localOff = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);

    /* 数据起点必须看**本地头**的长度字段 */
    if (buf.readUInt32LE(localOff) !== 0x04034b50) throw new Error('本地头签名不对：' + name);
    const lNameLen = buf.readUInt16LE(localOff + 26);
    const lExtraLen = buf.readUInt16LE(localOff + 28);
    const dataStart = localOff + 30 + lNameLen + lExtraLen;
    const raw = buf.slice(dataStart, dataStart + compSize);

    let data = raw;
    if (method === 8) data = zlib.inflateRawSync(raw);
    else if (method !== 0) throw new Error('不支持的压缩方式 ' + method + '：' + name);
    if (method === 0 && uncompSize !== 0 && data.length !== uncompSize) {
      /* 有些写入器在 STORED 下把 uncompSize 留 0，这里只在长度对不上时才当异常 */
      if (data.length !== compSize) throw new Error('STORED 条目长度异常：' + name);
    }
    if (method === 8 && data.length !== uncompSize) throw new Error('解压长度不符：' + name);
    if (crc32(data) !== crc) throw new Error('CRC 校验失败：' + name);

    entries.push({
      name, method, data, flags: flags & 0x08 ? 0 : flags,
      dostime, dosdate, externalAttrs,
      isDir: name.endsWith('/'),
    });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/**
 * 写一个 ZIP。
 * @param {string} file 输出路径
 * @param {Array} entries [{name, data, store?, dosdate, dostime, externalAttrs}]
 *        store=true 的条目**不压缩**（resources.arsc 必须如此）
 */
function writeZip(file, entries) {
  const chunks = [];
  const central = [];
  let offset = 0;
  const now = new Date();
  const dosTime = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xFFFF;
  const dosDate = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xFFFF;

  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, 'utf8');
    const raw = e.data;
    /* 空内容或目录一律 STORED；其余按调用方要求 */
    const wantStore = e.store || raw.length === 0 || e.name.endsWith('/');
    const body = wantStore ? raw : zlib.deflateRawSync(raw, { level: 9 });
    const method = wantStore ? 0 : 8;
    const crc = crc32(raw);
    const time = e.dostime || dosTime;
    const date = e.dosdate || dosDate;

    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);              /* version needed */
    lh.writeUInt16LE(0, 6);               /* flags */
    lh.writeUInt16LE(method, 8);
    lh.writeUInt16LE(time, 10);
    lh.writeUInt16LE(date, 12);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(body.length, 18);
    lh.writeUInt32LE(raw.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26);
    lh.writeUInt16LE(0, 28);
    chunks.push(lh, nameBuf, body);

    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);              /* version made by */
    ch.writeUInt16LE(20, 6);              /* version needed */
    ch.writeUInt16LE(0, 8);
    ch.writeUInt16LE(method, 10);
    ch.writeUInt16LE(time, 12);
    ch.writeUInt16LE(date, 14);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(body.length, 20);
    ch.writeUInt32LE(raw.length, 24);
    ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt16LE(0, 30);              /* extra */
    ch.writeUInt16LE(0, 32);              /* comment */
    ch.writeUInt16LE(0, 34);              /* disk */
    ch.writeUInt16LE(0, 36);              /* internal attrs */
    ch.writeUInt32LE(e.externalAttrs !== undefined
      ? e.externalAttrs
      : (e.name.endsWith('/') ? 0x41ED0010 : 0x81A40000), 38);
    ch.writeUInt32LE(offset, 42);
    central.push(ch, nameBuf);

    offset += lh.length + nameBuf.length + body.length;
  }

  const cd = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  fs.writeFileSync(file, Buffer.concat([Buffer.concat(chunks), cd, eocd]));
}

module.exports = { readZip, writeZip, crc32 };

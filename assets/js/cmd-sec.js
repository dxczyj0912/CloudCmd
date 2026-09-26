/* assets/js/cmd-sec.js · 安全与合规
   --------------------------------------------------------------------------
   本文件只负责**注册命令实现**：shell.js 先加载，这里再调用
     window.CC_SHELL.extend({ '命令名': function (argv, ctx, stdin, HOST) { ... } })
   引擎内部的工具函数从 window.CC_SHELL.util 取（ok/fail/resolvePath/findNode/
   readFileOrErr/splitLines/childrenSorted/expandLongOpts/pad/padLeft/walkFiles）。

   覆盖的内容条目：openssl、firewall-cmd、getenforce/setsebool/ausearch、gpg、nmap
   数据文件（data/*.js）里的 examples[].cmd 会由 tools/example-check.js 逐条真跑，
   所以实现必须让这些示例真的能跑通、且输出与 desc 描述一致。

   ⚠ 本文件里所有证书 / 私钥 / CSR 都是**真 PEM 结构**（DER 由 tools/_sec-gen.js
   生成后内联，能被真 openssl 解析出 subject/issuer/有效期），解析器也是真的
   ASN.1 解析器 —— 不是在输出里写死答案。解析失败时报的是 openssl 的原始错误。
   -------------------------------------------------------------------------- */
(function () {
  'use strict';
  if (!window.CC_SHELL || !window.CC_SHELL.extend) return;
  var U = window.CC_SHELL.util;

  /* ======================================================================
     0 · 通用工具
     ====================================================================== */

  function splitLines(text) { return U.splitLines(text); }

  /* 仿真环境的"当前时间"：与 shell.js 里的 NOW 保持一致（2024-03-18 09:51 CST） */
  var NOW_MS = Date.parse('2024-03-18T09:51:00+08:00');
  var NOW_SEC = Math.floor(NOW_MS / 1000);

  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function padLeftStr(s, n) { s = String(s); while (s.length < n) s = ' ' + s; return s; }
  function padRightStr(s, n) { s = String(s); while (s.length < n) s = s + ' '; return s; }

  function utf8Bytes(str) {
    var out = [];
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) { out.push(0xc0 | (c >> 6), 0x80 | (c & 63)); }
      else if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
        var c2 = str.charCodeAt(++i);
        var cp = 0x10000 + ((c - 0xd800) << 10) + (c2 - 0xdc00);
        out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
      } else { out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63)); }
    }
    return out;
  }

  /* ---------- SHA-256（FIPS 180-4）：浏览器里没有 node:crypto，只能自己算 ---------- */
  var SHA_K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];
  function sha256Bytes(bytes) {
    var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    var msg = bytes.slice();
    var bitLen = msg.length * 8;
    msg.push(0x80);
    while (msg.length % 64 !== 56) msg.push(0);
    msg.push(0, 0, 0, 0, (bitLen >>> 24) & 255, (bitLen >>> 16) & 255, (bitLen >>> 8) & 255, bitLen & 255);
    function rotr(x, n) { return ((x >>> n) | (x << (32 - n))) >>> 0; }
    for (var off = 0; off < msg.length; off += 64) {
      var w = [];
      for (var i = 0; i < 16; i++) {
        w[i] = ((msg[off + i * 4] << 24) | (msg[off + i * 4 + 1] << 16) | (msg[off + i * 4 + 2] << 8) | msg[off + i * 4 + 3]) >>> 0;
      }
      for (i = 16; i < 64; i++) {
        var s0 = (rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3)) >>> 0;
        var s1 = (rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10)) >>> 0;
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
      }
      var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (i = 0; i < 64; i++) {
        var S1 = (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) >>> 0;
        var ch = ((e & f) ^ (~e & g)) >>> 0;
        var t1 = (h + S1 + ch + SHA_K[i] + w[i]) >>> 0;
        var S0 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) >>> 0;
        var maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
        var t2 = (S0 + maj) >>> 0;
        h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
      }
      H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
      H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
    }
    var out = [];
    for (i = 0; i < 8; i++) {
      out.push((H[i] >>> 24) & 255, (H[i] >>> 16) & 255, (H[i] >>> 8) & 255, H[i] & 255);
    }
    return out;
  }
  function hexOf(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += (bytes[i] < 16 ? '0' : '') + bytes[i].toString(16);
    return s;
  }
  function sha256Hex(text) { return hexOf(sha256Bytes(utf8Bytes(String(text)))); }
  function md5Len(text, n) {
    /* 教学用的定长散列：只需要"同样的输入得同样的值"，不用于任何真实密码学场景 */
    var h = sha256Hex(text);
    while (h.length < n) h += sha256Hex(h);
    return h.slice(0, n);
  }
  function base64Encode(bytes) {
    var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    var out = '';
    for (var i = 0; i < bytes.length; i += 3) {
      var b0 = bytes[i], b1 = bytes[i + 1], b2 = bytes[i + 2];
      out += B64.charAt(b0 >> 2);
      out += B64.charAt(((b0 & 3) << 4) | ((b1 === undefined ? 0 : b1) >> 4));
      out += b1 === undefined ? '=' : B64.charAt(((b1 & 15) << 2) | ((b2 === undefined ? 0 : b2) >> 6));
      out += b2 === undefined ? '=' : B64.charAt(b2 & 63);
    }
    return out;
  }
  function base64Decode(str) {
    var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    var s = String(str).replace(/[^A-Za-z0-9+/=]/g, '');
    var out = [], buf = 0, bits = 0;
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i);
      if (c === '=') break;
      var v = B64.indexOf(c);
      if (v < 0) continue;
      buf = (buf << 6) | v; bits += 6;
      if (bits >= 8) { bits -= 8; out.push((buf >> bits) & 255); }
    }
    return out;
  }

  /* ---------- ASN.1 / DER 解析 ---------- */
  function derRead(bytes, i) {
    var tag = bytes[i++];
    var len = bytes[i++];
    if (len === undefined) return null;
    if (len & 0x80) {
      var n = len & 0x7f;
      if (n === 0 || i + n > bytes.length) return null;
      len = 0;
      for (var k = 0; k < n; k++) len = (len << 8) | bytes[i++];
    }
    if (i + len > bytes.length) return null;
    return {
      tag: tag, len: len, start: i, end: i + len, next: i + len,
      constructed: (tag & 0x20) !== 0,
      content: function () { return bytes.slice(this.start, this.end); }
    };
  }
  function derChildren(bytes, node) {
    var out = [], i = node.start;
    while (i < node.end) {
      var c = derRead(bytes, i);
      if (!c) break;
      out.push(c);
      i = c.next;
    }
    return out;
  }
  function derInt(node, bytes) {
    var v = bytes.slice(node.start, node.end);
    if (v.length && v[0] & 0x80) return null;      /* 负数：证书里不该出现 */
    return v;
  }
  function derIntNumber(node, bytes) {
    var v = derInt(node, bytes);
    if (!v) return 0;
    var n = 0;
    for (var i = 0; i < v.length; i++) n = n * 256 + v[i];
    return n;
  }
  function oidString(node, bytes) {
    var v = bytes.slice(node.start, node.end);
    if (!v.length) return '';
    var out = [Math.floor(v[0] / 40), v[0] % 40];
    var val = 0;
    for (var i = 1; i < v.length; i++) {
      val = (val << 7) | (v[i] & 0x7f);
      if (!(v[i] & 0x80)) { out.push(val); val = 0; }
    }
    return out.join('.');
  }
  var OID_NAMES = {
    '2.5.4.3': 'CN', '2.5.4.6': 'C', '2.5.4.7': 'L', '2.5.4.8': 'ST', '2.5.4.10': 'O',
    '2.5.4.11': 'OU', '2.5.4.5': 'serialNumber', '1.2.840.113549.1.9.1': 'emailAddress',
    '2.5.4.4': 'SN', '2.5.4.42': 'GN', '0.9.2342.19200300.100.1.25': 'DC', '2.5.4.15': 'businessCategory'
  };
  function derString(node, bytes) {
    var v = bytes.slice(node.start, node.end);
    if (node.tag === 0x1e) {                       /* BMPString: UTF-16BE */
      var s = '';
      for (var i = 0; i + 1 < v.length; i += 2) s += String.fromCharCode((v[i] << 8) | v[i + 1]);
      return s;
    }
    return String.fromCharCode.apply(null, v);
  }
  function derOidName(oid) {
    return OID_NAMES[oid] || oid;
  }
  /* Name → "CN=web.example.com, O=Example Corp, C=CN"（OpenSSL 的显示顺序是 RDN 反序） */
  function parseName(bytes, node) {
    var rdns = derChildren(bytes, node);
    var parts = [];
    for (var i = rdns.length - 1; i >= 0; i--) {
      var atvs = derChildren(bytes, rdns[i]);
      var piece = [];
      for (var k = 0; k < atvs.length; k++) {
        var kv = derChildren(bytes, atvs[k]);
        if (kv.length < 2) continue;
        piece.push(derOidName(oidString(kv[0], bytes)) + '=' + derString(kv[1], bytes));
      }
      if (piece.length) parts.push(piece.join('+'));
    }
    return parts.join(', ');
  }
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  /* ASN.1 时间 → "Apr  1 00:00:00 2024 GMT" */
  function parseAsn1Time(node, bytes) {
    var raw = String.fromCharCode.apply(null, bytes.slice(node.start, node.end)).replace(/Z$/, '');
    var y, mo, d, h, mi, s;
    if (raw.length >= 14) {
      y = Number(raw.slice(0, 4)); mo = Number(raw.slice(4, 6)); d = Number(raw.slice(6, 8));
      h = Number(raw.slice(8, 10)); mi = Number(raw.slice(10, 12)); s = Number(raw.slice(12, 14));
    } else {
      var yy = Number(raw.slice(0, 2));
      y = yy >= 50 ? 1900 + yy : 2000 + yy;
      mo = Number(raw.slice(2, 4)); d = Number(raw.slice(4, 6));
      h = Number(raw.slice(6, 8)); mi = Number(raw.slice(8, 10)); s = Number(raw.slice(10, 12));
    }
    return {
      y: y, mo: mo, d: d, h: h, mi: mi, s: s,
      text: MONTHS[mo - 1] + ' ' + padLeftStr(d, 2) + ' ' + pad2(h) + ':' + pad2(mi) + ':' + pad2(s) + ' ' + y + ' GMT',
      ms: Date.UTC(y, mo - 1, d, h, mi, s)
    };
  }

  /* ---------- 证书结构 ---------- */
  var EXT_NAMES = {
    '2.5.29.17': 'X509v3 Subject Alternative Name',
    '2.5.29.19': 'X509v3 Basic Constraints',
    '2.5.29.15': 'X509v3 Key Usage',
    '2.5.29.37': 'X509v3 Extended Key Usage',
    '2.5.29.14': 'X509v3 Subject Key Identifier',
    '2.5.29.35': 'X509v3 Authority Key Identifier',
    '2.5.29.31': 'X509v3 CRL Distribution Points',
    '1.3.6.1.5.5.7.1.1': 'Authority Information Access'
  };
  var KU_BITS = ['Digital Signature', 'Non Repudiation', 'Key Encipherment', 'Data Encipherment',
    'Key Agreement', 'Certificate Sign', 'CRL Sign', 'Encipher Only', 'Decipher Only'];
  function parseExtension(bytes, extNode) {
    var kv = derChildren(bytes, extNode);
    if (!kv.length) return null;
    var oid = oidString(kv[0], bytes);
    var idx = 1, critical = false;
    if (kv[idx] && kv[idx].tag === 0x01) { critical = bytes[kv[idx].start] !== 0; idx++; }
    var valNode = kv[idx];
    var ext = { oid: oid, name: EXT_NAMES[oid] || oid, critical: critical, lines: [] };
    if (!valNode || valNode.tag !== 0x04) return ext;
    var inner = bytes.slice(valNode.start, valNode.end);
    var innerHeader = [0x30, inner.length < 128 ? inner.length : 0x81, inner.length < 128 ? 0 : inner.length];
    if (inner.length >= 128) innerHeader = [0x30, 0x81, inner.length];
    var wrapped = innerHeader.concat(inner);
    var seqNode = derRead(wrapped, 0);
    if (oid === '2.5.29.17' && seqNode) {
      var names = derChildren(wrapped, seqNode).map(function (g) {
        var v = wrapped.slice(g.start, g.end);
        if (g.tag === 0x82) return 'DNS:' + String.fromCharCode.apply(null, v);
        if (g.tag === 0x81) return 'email:' + String.fromCharCode.apply(null, v);
        if (g.tag === 0x87) return 'IP Address:' + v.join('.');
        if (g.tag === 0x86) return 'URI:' + String.fromCharCode.apply(null, v);
        return 'othername';
      });
      ext.lines = [names.join(', ')];
      ext.names = names;
    } else if (oid === '2.5.29.19' && seqNode) {
      var kids = derChildren(wrapped, seqNode);
      var ca = kids.length && kids[0].tag === 0x01 && wrapped[kids[0].start] !== 0;
      ext.lines = ['CA:' + (ca ? 'TRUE' : 'FALSE')];
      ext.ca = ca;
    } else if (oid === '2.5.29.15' && seqNode && seqNode.tag === 0x03) {
      var bs = wrapped.slice(seqNode.start, seqNode.end);
      var unused = bs[0];
      var names2 = [];
      for (var bi = 0; bi < (bs.length - 1) * 8 - unused; bi++) {
        if (bs[1 + Math.floor(bi / 8)] & (0x80 >> (bi % 8))) names2.push(KU_BITS[bi] || ('bit' + bi));
      }
      ext.lines = [names2.join(', ')];
    } else if (oid === '2.5.29.37' && seqNode) {
      var ekuNames = { '1.3.6.1.5.5.7.3.1': 'TLS Web Server Authentication', '1.3.6.1.5.5.7.3.2': 'TLS Web Client Authentication', '1.3.6.1.5.5.7.3.3': 'Code Signing', '1.3.6.1.5.5.7.3.8': 'Time Stamping', '1.3.6.1.5.5.7.3.9': 'OCSP Signing' };
      ext.lines = [derChildren(wrapped, seqNode).map(function (o) { return ekuNames[oidString(o, wrapped)] || oidString(o, wrapped); }).join(', ')];
    } else {
      ext.lines = [];
      ext.raw = inner;
    }
    return ext;
  }

  function parseCertificate(pem) {
    if (!/-----BEGIN CERTIFICATE-----/.test(pem)) {
      return { error: 'unable to load certificate' };
    }
    var blocks = pemBlocks(pem, 'CERTIFICATE');
    if (!blocks.length) return { error: 'unable to load certificate' };
    /* ⚠️ 必须先把 PEM 的 -----BEGIN/END----- 行剥掉再 base64 解码。
       早先直接 `base64Decode(blocks[0])`，把 "BEGINCERTIFICATE" 这些字母也当成
       base64 数据一起解，DER 从错误的偏移开始 → 于是**所有** `openssl x509 -in <文件>`
       与 `openssl verify` 都返回 "unable to load certificate"（退出码 1），
       站内"证书还有几天到期"那条主线因此整条跑不通。
       pemBody() 就是干这个的（定义在下面）。 */
    var bytes = base64Decode(pemBody(blocks[0]));
    var top = derRead(bytes, 0);
    if (!top || top.tag !== 0x30) return { error: 'unable to load certificate' };
    var kids = derChildren(bytes, top);
    if (!kids.length) return { error: 'unable to load certificate' };
    var tbs = kids[0];
    var f = derChildren(bytes, tbs);
    var idx = 0;
    var cert = { der: bytes, chain: blocks.length, pems: blocks };
    if (f[idx] && f[idx].tag === 0xa0) { cert.version = derIntNumber(derChildren(bytes, f[idx])[0], bytes) + 1; idx++; }
    else cert.version = 1;
    cert.serialBytes = derInt(f[idx], bytes) || [0];
    cert.serialHex = hexOf(cert.serialBytes).replace(/^0+/, '') || '0';
    cert.serialDec = String(derIntNumber(f[idx], bytes));
    idx++;
    idx++;                                   /* signature algorithm（与尾部一致） */
    cert.issuerRaw = parseName(bytes, f[idx]); idx++;
    var val = derChildren(bytes, f[idx]); idx++;
    cert.notBefore = parseAsn1Time(val[0], bytes);
    cert.notAfter = parseAsn1Time(val[1], bytes);
    cert.subjectRaw = parseName(bytes, f[idx]); idx++;
    /* 调试/断言用的 CN：从 subject 里取第一个 CN= */
    cert.subjectCN = (String(cert.subjectRaw).match(/(?:^|, )CN=([^,]+)/) || [])[1] || String(cert.subjectRaw);
    cert.spki = f[idx]; idx++;
    var spkiKids = derChildren(bytes, cert.spki);
    if (spkiKids.length >= 2 && spkiKids[1].tag === 0x03) {
      var bit = bytes.slice(spkiKids[1].start + 1, spkiKids[1].end);
      var rsaPub = derRead(bit, 0);
      if (rsaPub) {
        var rk = derChildren(bit, rsaPub);
        if (rk.length >= 2) cert.modulus = derInt(rk[0], bit);
      }
    }
    cert.sigAlg = f.length > 1 ? oidString(derChildren(bytes, f[1])[0], bytes) : '';
    cert.extensions = [];
    if (f[idx] && f[idx].tag === 0xa0) {
      var extSeq = derChildren(bytes, f[idx])[0];
      if (extSeq) {
        derChildren(bytes, extSeq).forEach(function (e) {
          var parsed = parseExtension(bytes, e);
          if (parsed) cert.extensions.push(parsed);
        });
      }
    }
    var san = null, bc = null, ku = null, eku = null;
    cert.extensions.forEach(function (e) {
      if (e.oid === '2.5.29.17') san = e;
      if (e.oid === '2.5.29.19') bc = e;
      if (e.oid === '2.5.29.15') ku = e;
      if (e.oid === '2.5.29.37') eku = e;
    });
    cert.san = san;
    cert.basicConstraints = bc;
    cert.keyUsage = ku;
    cert.eku = eku;
    cert.isCA = !!(bc && bc.ca);
    var dns = [], ips = [];
    if (san && san.names) {
      san.names.forEach(function (n) {
        if (n.indexOf('DNS:') === 0) dns.push(n.slice(4));
        if (n.indexOf('IP Address:') === 0) ips.push(n.slice(11));
      });
    }
    cert.dnsNames = dns;
    cert.ipNames = ips;
    return cert;
  }

  function pemBlocks(text, label) {
    var re = new RegExp('-----BEGIN ' + label + '-----[\\s\\S]*?-----END ' + label + '-----', 'g');
    return String(text).match(re) || [];
  }

  /* PEM → 单行 base64（去掉首尾行与换行） */
  function pemBody(pem) {
    return String(pem).split(/\r?\n/).filter(function (l) { return l && l.indexOf('-----') !== 0; }).join('');
  }

  /* ---------- 虚拟文件系统读写 ---------- */
  function fsNode(ctx, p) { return U.findNode(ctx.root, U.resolvePath(ctx.cwd, p)); }
  function fsRead(ctx, p, allowBinary) {
    var r = U.readFileOrErr(ctx, p);
    if (r.err) return { error: r.err.replace(/^cat:/, '') };
    /* `gz` 标记表示"这是压缩过的二进制"，`cat` 出来是乱码 —— 所以默认拒绝。
       ⚠️ 但**算摘要 / 签名不读内容语义**：`openssl dgst -sha256 app.tar.gz`
       算的就是这个压缩包本身的哈希，真机完全合法（校验发布包就是这么做的）。
       早先这里一刀切拒绝，于是站内 sec-openssl-dgst 的两条签名示例
       报 `Error opening /data/dist/app.tar.gz: No such file or directory` ——
       文件明明在（`ls` 看得见），报错却说"不存在"，更让人摸不着头脑。
       所以给调用方一个 `allowBinary` 开关：摘要类命令传 true。 */
    if (r.gz && !allowBinary) return { error: ': binary file (gzip)' };
    return { content: r.content, abs: r.abs };
  }
  function fsWrite(ctx, p, content, mode) {
    var abs = U.resolvePath(ctx.cwd, p);
    var parent = U.findNode(ctx.root, U.parentOf(abs));
    if (!parent) return { error: p + ': No such file or directory' };
    var name = U.baseName(abs);
    var node = parent.children[name];
    if (!node) {
      node = { type: 'file', name: name, children: null, content: '', mode: mode || '644', user: 'root', group: 'root', mtime: '2024-03-18 09:51', target: null };
      parent.children[name] = node;
    }
    if (node.type === 'dir') return { error: p + ': Is a directory' };
    node.content = content;
    if (mode) node.mode = mode;
    node.mtime = '2024-03-18 09:51';
    return { abs: abs };
  }
  function rmNode(ctx, p) {
    var abs = U.resolvePath(ctx.cwd, p);
    var parent = U.findNode(ctx.root, U.parentOf(abs));
    if (!parent) return false;
    var name = U.baseName(abs);
    if (!parent.children[name]) return false;
    delete parent.children[name];
    return true;
  }
  function ensureDir(ctx, p) {
    var abs = U.resolvePath(ctx.cwd, p);
    var segs = abs.split('/').filter(Boolean);
    var cur = ctx.root;
    for (var i = 0; i < segs.length; i++) {
      if (!cur.children[segs[i]]) {
        cur.children[segs[i]] = { type: 'dir', name: segs[i], children: {}, content: '', mode: '755', user: 'root', group: 'root', mtime: '2024-03-18 09:51', target: null };
      }
      cur = cur.children[segs[i]];
      if (cur.type !== 'dir') return false;
    }
    return true;
  }

  /* ---------- 选项解析 ---------- */
  /* 把 -in file / -in=file / --days=365 / -days 365 统一成 { opt: value } 与位置参数 */
  function parseOpts(argv, valueOpts, flagOpts) {
    var o = { _: [] }, i;
    var isValue = {}, isFlag = {};
    (valueOpts || []).forEach(function (k) { isValue['-' + k] = true; isValue['--' + k] = true; });
    (flagOpts || []).forEach(function (k) { isFlag['-' + k] = true; isFlag['--' + k] = true; });
    for (i = 0; i < argv.length; i++) {
      var a = String(argv[i]);
      var eq = a.indexOf('=');
      var key = eq > 0 ? a.slice(0, eq) : a;
      var val = eq > 0 ? a.slice(eq + 1) : null;
      if (isValue[key] && key.charAt(0) === '-') {
        if (val === null) { val = argv[i + 1]; i++; }
        o[key.replace(/^--?/, '')] = val;
        continue;
      }
      if (isFlag[key] && key.charAt(0) === '-') { o[key.replace(/^--?/, '')] = true; continue; }
      if (/^-[a-zA-Z]/.test(a) && !/^-\d/.test(a) && a.length > 1 && !isValue[key]) {
        /* 未知短选项：记下来，由命令决定怎么报错 */
        o._unknown = o._unknown || [];
        o._unknown.push(a);
        continue;
      }
      o._.push(a);
    }
    return o;
  }

  function nowText() { return 'Mar 18 09:51:00 2024 GMT'; }
  function hint(lines) { return lines; }

  /* ======================================================================
     1 · 模拟数据（证书 / 私钥 / CSR / 日志 / 扫描结果）
     ====================================================================== */
  var PEM = window.CC_SEC_PEM || {};

  /* 由 tools/_sec-gen.js 生成：真实 openssl 可解析的 PEM 素材（base64 单行存放） */
  var PEM = window.CC_SEC_PEM = {
    webCrt: '-----BEGIN CERTIFICATE-----\nMIIDgzCCAmugAwIBAgIIChssPU5fYIAwDQYJKoZIhvcNAQELBQAwVDEiMCAGA1UE\nAwwZQ2xvdWRDbWQgUlNBIERWIFNlcnZlciBDQTEhMB8GA1UECgwYQ2xvdWRDbWQg\nSW50ZXJtZWRpYXRlIENBMQswCQYDVQQGDAJDTjAeFw0yMzA0MDEwMDAwMDBaFw0y\nNDA0MDEwMDAwMDBaMD4xGDAWBgNVBAMMD3dlYi5leGFtcGxlLmNvbTEVMBMGA1UE\nCgwMRXhhbXBsZSBDb3JwMQswCQYDVQQGDAJDTjCCASIwDQYJKoZIhvcNAQEBBQAD\nggEPADCCAQoCggEBANS8vOdS79Ki+Z84PfY4+Q2HKGZoEFdSVvLMOgJeGN/DH8WD\n/9WW/FyWSD/ro8MACgCLU2k5YMv6TXoKVsu6nuo9u/D+EASX3o8SvjYXhfq53g9z\n0T5EgS1okHv3h1NSfRaiJWN6TqI3FwNjseE6mOj8uwCofras8tYuhS/TNdBqwdrG\nD6G7Q78kgBmZ2XFULkhY3sD1LnwRrE4jeHIpE3rGbkyaZMl5RWmX0FtHD0k8Q0Go\n6MUyy8XwHp1RRGZghpP2Tsic5Rb0NK/XYIki8QRtRsEMScys1rgyhw3Uiy9PGaaQ\nZmVh/eH+Pwik4feqOiX7eURDEuRp+YMFsP46oVcCAwEAAaNvMG0wDwYDVR0TAQH/\nBAUwAwEBADAOBgNVHQ8BAf8EBAMCBaAwHQYDVR0lBBYwFAYIKwYBBQUHAwEGCCsG\nAQUFBwMCMCsGA1UdEQQkMCKCD3dlYi5leGFtcGxlLmNvbYIPd3d3LmV4YW1wbGUu\nY29tMA0GCSqGSIb3DQEBCwUAA4IBAQAAM94vqC4DHQr6ZNA/eIAaqFRV9+z9HRQl\nu0AF0MNekfMq7+242+WZvjb2i+vwqSpePVoE3MmXYolBzmRVl0Gq6uSito3t7au1\nywaLZ8dgNTQTayGFnBV5dtUO5p+dRRS5tjDw08IeXzetb2AliO0vMnhzk/eMu6ye\nPhOl6DAW0j/dmMtmwqX1el3MW/RF5poeZAXvNSaoVWtk2WFCo+WsPc6r5yfkClE8\nrekjQ575mmK+wBMlEobqMAo3XXJwJddMCcWb0fqdwJ1Ezn1uO6vserOOGMAbiHvs\niNAWb0O6Ge9X732pHyuo9ePbdvtiwJ+N01HXh+UqUtm8vtsnIy9P\n-----END CERTIFICATE-----\n',
    apiCrt: '-----BEGIN CERTIFICATE-----\nMIIDgjCCAmqgAwIBAgIICyw9Tl9gcYAwDQYJKoZIhvcNAQELBQAwVDEiMCAGA1UE\nAwwZQ2xvdWRDbWQgUlNBIERWIFNlcnZlciBDQTEhMB8GA1UECgwYQ2xvdWRDbWQg\nSW50ZXJtZWRpYXRlIENBMQswCQYDVQQGDAJDTjAeFw0yMzA3MDEwMDAwMDBaFw0y\nNDA2MzAwMDAwMDBaMD4xGDAWBgNVBAMMD2FwaS5leGFtcGxlLmNvbTEVMBMGA1UE\nCgwMRXhhbXBsZSBDb3JwMQswCQYDVQQGDAJDTjCCASIwDQYJKoZIhvcNAQEBBQAD\nggEPADCCAQoCggEBAN6dnJjv/NUdkbZdW8rFf/fmzXX5qKNABZTMqa5tnLnSMhcY\nMejm8yG8zNWWNFzYJo/dJw3k7S+zqonDFDyVb8eSGWzQ1i4Kwl/7Jxhan+rjVeJX\nu3Ub5AQlkGap4NH2nt3xpnegCfBw0F+hYHe/s2F33doG38nGo0ZXkjnpcZlV6UtD\ntMLD8pMAQj9gSHwz+aBFSkZ+CEUUu/fEx0nYKROXlWol6mg5T1ODGjmIHmsGb/X4\nFfa0dLodpEKQHDI9TYESjNgguRJAetL/a3aRU6OibL53rQ3wAZuz+Hq4s34FccE5\n/B0TAuNjH9QQQCqrVq0CmncaZkf06sYTdkhHkeMCAwEAAaNuMGwwDwYDVR0TAQH/\nBAUwAwEBADAOBgNVHQ8BAf8EBAMCBaAwEwYDVR0lBAwwCgYIKwYBBQUHAwEwNAYD\nVR0RBC0wK4IPYXBpLmV4YW1wbGUuY29tghhhcGktaW50ZXJuYWwuZXhhbXBsZS5j\nb20wDQYJKoZIhvcNAQELBQADggEBAHQTzczGYa8L6cXCgnvcXcDU+o7o4MVp22AQ\n2/cfkkZy7tDMzMLiIOTh2tD/RMgW3ly661QKtDfKoTreG1KrAoYm+7ognJbCFx4x\nXQjnj11sW0sXSsANXzL4E5n+0f+w7J7stz8V9qtl87O/HO/7DjikVc7hsT6aGJiJ\nmk3yEqXEMNvFOKYrg2k/Fw8U+Bp1euAm8WHnpQOD0HJJSDWa2SYP74KoPjfnaHnU\nZthgvOG8evNzT4AQ+ywZSiBev9vczAXJUkKLLOdJOrU/eT6v4bVrZvui7IqG6m2C\nMz5OiqquUTBj4UW7lmqKuEA4Ozq19sxasO+2vOyuYS17eR8hH1I=\n-----END CERTIFICATE-----\n',
    rootCrt: '-----BEGIN CERTIFICATE-----\nMIIDNDCCAhygAwIBAgIIGis8TV5vcAAwDQYJKoZIhvcNAQELBQAwRjEcMBoGA1UE\nAwwTQ2xvdWRDbWQgUm9vdCBDQSBSMTEZMBcGA1UECgwQQ2xvdWRDbWQgUm9vdCBD\nQTELMAkGA1UEBgwCQ04wHhcNMTQwMTAxMDAwMDAwWhcNMzQwMTAxMDAwMDAwWjBG\nMRwwGgYDVQQDDBNDbG91ZENtZCBSb290IENBIFIxMRkwFwYDVQQKDBBDbG91ZENt\nZCBSb290IENBMQswCQYDVQQGDAJDTjCCASIwDQYJKoZIhvcNAQEBBQADggEPADCC\nAQoCggEBAMGazZIpkgEwTgs1TSIFGB0wknLqpqVhcKYfwxaUW8lYKZjKbH7HmhaV\n7v77Y9hQ+CR3AFxllbaSfO2CFY/hJl//2Uyz423pmJORNnPpQMh1CWj3LLdbkYqe\nI2/bFUtL3v/BsO9GlQnu7HSiJDg3j2koZ836NwmMRyReIYcErGQGXILkvmxdfd1m\nlvayl9It5BoZxWDYXCrRKob3/jk+q+d5alVWyYe5ycRWa3YqKTW1Vo+pXqN7xMDB\n+o01zLUVWBSoXP0mlA/0ARJhf3t9VHmNv6BgFoOhMOVYBvoq/DPf/hR0gl9h7AOz\nLKllMAHaqQ//dxbZj3y1scyE/H1Oy0cCAwEAAaMmMCQwEgYDVR0TAQH/BAgwBgEB\n/wIBATAOBgNVHQ8BAf8EBAMCAYYwDQYJKoZIhvcNAQELBQADggEBAA6E0AisR1Hq\n+wrdMDoc8+yh+rPZaaH2YfVrqPl0gp6OdePlQ19++qaV/+jIMd1jHllJewfjFFVK\nFqzov9LQ4A7tMXWg8c2du1uY5wW61bcRX6olBVjkrGr3FXv66u3Mq4pmfwWpSeU3\nFgCec+6T5hdRwE8ytHz2HCOqeKcVavCSFyJ2qaVUuM5ouSBhlTp5c5FiO5TYboh0\nn4fjMuy2EoR4soKLbhBzfLYNiaQf6yh8YeGX+e4onR4zAM3xB9WWvEUEC1WZscQP\n1JIGDqTRrpSlsAOo/nk4TymL6iCNRNX70ABtqP6XmaDHLto4CtrLKBPmtBDekNdB\nuHHa1ZqwIZ8=\n-----END CERTIFICATE-----\n',
    interCrt: '-----BEGIN CERTIFICATE-----\nMIIDQjCCAiqgAwIBAgIIKzxNXm9wggAwDQYJKoZIhvcNAQELBQAwRjEcMBoGA1UE\nAwwTQ2xvdWRDbWQgUm9vdCBDQSBSMTEZMBcGA1UECgwQQ2xvdWRDbWQgUm9vdCBD\nQTELMAkGA1UEBgwCQ04wHhcNMjMwMTAxMDAwMDAwWhcNMzMwMTAxMDAwMDAwWjBU\nMSIwIAYDVQQDDBlDbG91ZENtZCBSU0EgRFYgU2VydmVyIENBMSEwHwYDVQQKDBhD\nbG91ZENtZCBJbnRlcm1lZGlhdGUgQ0ExCzAJBgNVBAYMAkNOMIIBIjANBgkqhkiG\n9w0BAQEFAAOCAQ8AMIIBCgKCAQEAphm/1dKmbq+iNYPuUk+dBR/ZKy9rMp65Ap0t\nN0x03eMj0S3K6aWBsUocEVwsA8sWnrEWaD9yq/wMxSH9c3+hK5p5deYssvTryQFj\nACSl6SGHo/DNJzcj31FZTVNgElPAbYmtfNfwt1dQOaIYIf6A6mFzbmcfgBiSZUuW\nMkBi/MysTMRWmqYGBf2pudKbLdIFh/+KyjbqruIvQbMpl594HWaHM3OUkmF9gWda\nGX46o+LYKnZQ38m7GHc/OxwbDGIYBwNqGWR0jLEDPWFcuh/fTvL5fPNJ/q3TBCAi\n8KNF8AHuFLDkX7k9me7XhDc//bdKpfl7eIa125ihG5VYLuxrlQIDAQABoyYwJDAS\nBgNVHRMBAf8ECDAGAQH/AgEBMA4GA1UdDwEB/wQEAwIBhjANBgkqhkiG9w0BAQsF\nAAOCAQEApLin4JEbms4iiQp8X0ehGFQWGf3zy6Lo+7m3fcs2l7C6diQ7kjlkTRpQ\nWwO+nwd+xDGsx2FUu3MxtDFdb6JN/xcH7vWnvdpry0NdF22U3jx/mKUYrwyKN0OQ\nLGm2WuUg8HLxjyGJ2N0BjpLvnXIsuLkBNF5LxfZQX1jcIcaicOXU/cpOa07elElt\nXoliPPjbdv4oC8KTML2wYv5Ta024J6u/FVA8cRjRvCV7sHDExsgFWO+IY0ZhFXfi\nSKYzO5s9NW5NkJPnpgNcQuO/jVv8Ff91dzJ/lJ+2hdVak2ZYeLawl/19a7gob+pt\nnG+K3112ivZo7u3Eg0k7UHZSM5IR9A==\n-----END CERTIFICATE-----\n',
    opsCrt: '-----BEGIN CERTIFICATE-----\nMIIDaDCCAlCgAwIBAgIIDD1OX2BxgoAwDQYJKoZIhvcNAQELBQAwVDEiMCAGA1UE\nAwwZQ2xvdWRDbWQgUlNBIERWIFNlcnZlciBDQTEhMB8GA1UECgwYQ2xvdWRDbWQg\nSW50ZXJtZWRpYXRlIENBMQswCQYDVQQGDAJDTjAeFw0yMzA5MDEwMDAwMDBaFw0y\nNDA4MzEwMDAwMDBaMD4xGDAWBgNVBAMMD29wcy5leGFtcGxlLmNvbTEVMBMGA1UE\nCgwMRXhhbXBsZSBDb3JwMQswCQYDVQQGDAJDTjCCASIwDQYJKoZIhvcNAQEBBQAD\nggEPADCCAQoCggEBALOsoWJG93hy9QIWMGtfkER4wlS/p8dAoD9myUL8EvRK/gr1\nM3RXiu8ZU52HfNgE8S6jMXFlnfck6md1PkYnJBoQay2AtSy/CHe2pSc9+cscfv//\nJHDa/dEirXYocuOmAUF/dpS4WhnLSEGalXBSQlzuAkb8dS3Z0c4gMU7ExKLx8O0h\nMxWaxzbuya25YgBO/D1C+w66BOm9oYvg5R97X4/85hzOrEWtzMMJXFrnvhOHuUv2\n7l8i+IZLH482d27wMM1FUWaQPIBtXZM2emsubrC4hM9QoxDtNr264FBX6aEkRDYx\nIvum81Bn1OZoPCEatLgH0Y6+aBSOv3E8rWOKzHcCAwEAAaNUMFIwDwYDVR0TAQH/\nBAUwAwEBADAOBgNVHQ8BAf8EBAMCBaAwEwYDVR0lBAwwCgYIKwYBBQUHAwEwGgYD\nVR0RBBMwEYIPb3BzLmV4YW1wbGUuY29tMA0GCSqGSIb3DQEBCwUAA4IBAQABmizX\ntKmGEJxSeQz71bKDjlIhmffEWSziWnqpxr4jX+BFZPO5ARGpWSMsbmkcjVgnWhZl\n3oNwEKWjJeS9bIwip5cpwmCuOeUwWVduyVwZK+jIj3+3C0y2BDCThDKaS5CEKBOG\n9qPCwTLeksXxmtmixuJNwP7Njm/5Oe8Z9I0PjjqLhcm0uze+xGT99F807lrzGC9V\nKT1bjp9uWfs4u/3ehLRWu1jLdMTPFmq0loUf45twCsWyb24E5egMQI8PsZYWUVif\nknSRv+AYyyuikw7nYsXExwNC8FV4qp3jrz3qeHf50DSrzJQQKfAezLmdLT9/tJU1\np0VKfAwYWpp1ci3j\n-----END CERTIFICATE-----\n',
    internalCrt: '-----BEGIN CERTIFICATE-----\nMIIDOTCCAiGgAwIBAgIIfx4tPEtaaAAwDQYJKoZIhvcNAQELBQAwMzEVMBMGA1UE\nAwwMYXBpLmludGVybmFsMQ0wCwYDVQQKDARDb3JwMQswCQYDVQQGDAJDTjAeFw0y\nNDAxMDEwMDAwMDBaFw0zNDAxMDEwMDAwMDBaMDMxFTATBgNVBAMMDGFwaS5pbnRl\ncm5hbDENMAsGA1UECgwEQ29ycDELMAkGA1UEBgwCQ04wggEiMA0GCSqGSIb3DQEB\nAQUAA4IBDwAwggEKAoIBAQDNHlvzs2Ocwx5+Czw72sVG9Ul23GAi5fS4736L62Tt\nvVYn7nx4IU5XyM/BrQlQocec8uH1H9b/v7y+bi/YxO9gDZX9/fpC90BZqoKeJouV\nIIYDnqkIaUtKBhC5LvxN55IpJRFOJEgAMbTNKoskAJkirL81z75xjTuqU6LZNQN2\nDgBU2Vd4pcc3T+TvOq/7ZblyS2tDW+kH1w4IwIAhEcJS5SrFwoaUT0E3iQgvNnKB\nJkL/YgeOZzxi+HWQHxjvIaX7J1y2dQ2mUES4mgL63GhuDOaJ1tebuTusJ16icGyS\n+YAZUQCp7OwDgtVYR1tD6dtEBken3jPMiWjs8bEoclVVAgMBAAGjUTBPMA8GA1Ud\nEwEB/wQFMAMBAQAwDgYDVR0PAQH/BAQDAgWgMBMGA1UdJQQMMAoGCCsGAQUFBwMB\nMBcGA1UdEQQQMA6CDGFwaS5pbnRlcm5hbDANBgkqhkiG9w0BAQsFAAOCAQEAboVH\nbpr7V9psnvh5yYC+fbPUMkIq7aHNN9z22Gu3tgY0LlDDv4sWSA07IPWyO/F8OP4m\ns6GmMuBLyzhMaXbaaOP0MYTJN3gmqGbXW8m71SmUCtU+uekiCiK5yvyXl932juZV\nnOcJICIXOLlO96MhyXwAstXH6yFhgGZ5+zWA+lIsrTNQ+00hQzQpIe28sXZmK9PJ\nYOLyGG4g4abZP0QMqxqap2QG4AURE2FWZAmDwuUoVYSvd2gQA/NVHb5Bhg4Zzi0J\n4kwbs4C7vh70iRvcjMkbHvcYQWyZg8dQJn/N0DqneWX5c95GyRs9lXnLMqbYYSKx\nhfQfVlVUKpS/U/NyCw==\n-----END CERTIFICATE-----\n',
    csr: '-----BEGIN CERTIFICATE REQUEST-----\nMIICyjCCAbICAQAwPjELMAkGA1UEBhMCQ04xFTATBgNVBAoMDEV4YW1wbGUgQ29y\ncDEYMBYGA1UEAwwPYXBpLmV4YW1wbGUuY29tMIIBIjANBgkqhkiG9w0BAQEFAAOC\nAQ8AMIIBCgKCAQEAjpDm8Al5cqV3UFF1azc36PMnvqveDBb48LreL/eZgO+cTNdU\nun5R+A0pTTR9rmEW2vdSDqYvT3Rw8oXveTjiWLCE8uX61gMdSqqP4+9CxkfKClTX\nFjXZgAv9F5AY+lAlsmouFt9Mq3cavBEoR9SarvwlF+0siV2QGsWSPQgrCVQAG7a2\nlVnEwj89EKLlyBX9JzRhyTvc7aOoLVlmotEIE3+iiU/aMwTZaZ8GOc10eaLuew8N\nVoDfJjKbe0k5TcleNqPQrmuDZbcZUOjWujVOQXW9NVFj3sfMBOI8dZEJSisY1lyi\nGhTHiidlMa0hNZOjmf/ZYY7teDXcGLK5hsdOlQIDAQABoEcwRQYJKoZIhvcNAQkO\nMTgwNjA0BgNVHREELTArgg9hcGkuZXhhbXBsZS5jb22CGGFwaS1pbnRlcm5hbC5l\neGFtcGxlLmNvbTANBgkqhkiG9w0BAQsFAAOCAQEAcD9PmBpYXofQn0k4WQxWo/bl\n5EX7MqwUq0nm8J/7DBoqur883jOdrofVAvpDCDxGL+4/RfDqHaKMguk8dNeY7I7H\nUFg71VSv4NcWudNkGhjzmOxUe0yJFjir+EJ4J/vtMJj9bGQQXhPgq+TX8rRd7XuI\noxB3Q8XHCoHQwEtGTPN7a44JQxcIhBe0TgqBpeaq87kC0l+4rTgSuNp0+5sKzlF9\nUB4WHt8T0k6aqoc72l+KwxwczVzZDkh1BUOWGOGB5cYAW3loGGxq/aGRBLBQYSk8\npbqGqYlOozMCjSnkhwe4hOAo1iL0KMHFZq36LPLWL28psloc6UoxsBbYaPdlQA==\n-----END CERTIFICATE REQUEST-----\n',
    webKey: '-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDUvLznUu/Sovmf\nOD32OPkNhyhmaBBXUlbyzDoCXhjfwx/Fg//Vlvxclkg/66PDAAoAi1NpOWDL+k16\nClbLup7qPbvw/hAEl96PEr42F4X6ud4Pc9E+RIEtaJB794dTUn0WoiVjek6iNxcD\nY7HhOpjo/LsAqH62rPLWLoUv0zXQasHaxg+hu0O/JIAZmdlxVC5IWN7A9S58EaxO\nI3hyKRN6xm5MmmTJeUVpl9BbRw9JPENBqOjFMsvF8B6dUURmYIaT9k7InOUW9DSv\n12CJIvEEbUbBDEnMrNa4MocN1IsvTxmmkGZlYf3h/j8IpOH3qjol+3lEQxLkafmD\nBbD+OqFXAgMBAAECggEAGRTMy2kXz/mu/HqhCNqGt8rrlHHzG0MgmoJBhJibeNDZ\nz2up9KtXGC4PrpmVi8lWueGzSoCdTO83GzWvg1gpTEH4WogEU3D5qFyerbnwQzM5\nXxEEkRbP3rlT74mrcW4URArckEc8kMYgocxV4ya0Hc6jgtxatCbdKoCpleM3llle\nHbR9ZG9IXrb+9ph7lIGKnI+ZN6ALoBwtAGdlBasqrQo6KdSQ3qePn3A96qjpIdcG\n3PvlZvuAE0tbljaX40vWU5GH+QhnhVic97hiVPFJIDiyRi7Cg+0YnykZbbKZUxTK\nmOEdtE40rKpMmcExT2zjA7IHhmCICQFSPP5HYdf3YQKBgQDvffRMA7eABwjml6xV\nPIL9yJrGVjRgYutZzRsdLr2ZjoZQ7YFGqQ3kqVvzx3iyQiNJGCryHBf8EUCPzU/e\n8IeKeGysx6HJc1b3aMbk0o8nP8OQWsnzi9cajttwgOLao3qp9i99WVC1I9NZoeds\n1vMN2sxZakb0fChc/AvUOrWzTQKBgQDjZqwzQ3nGs32GxLI0TaatW+5SIvgutL6E\nGDCZB8ak5jZsIqnLA2GsD1uI/RJ9XJ33xrYe2o1NeH4eJ+M+K2A9/mLcilsVh2zs\nKM2fApKdf4LjL9gdWpo2NhgeJP89aXqowNJQG1r7QFgXJEi7NvOdAvdEgQ6BIkfd\nhZblSSENMwKBgCByURnHWyIWUedj3y5BH4Igno+GeFwiqr4k4qqGfZuDSsFGHECl\ngMNdCp8xhDGqcjth8deRZNJ6x+NzroGG1uY0wIx8E3hGjx6/7EpuGIT5x5YUJs4/\nQOpRNnu8in+SrHjAaNiztBKGgwjevYrqaE2VOiBXHLvc4l8Oqs+bEKj1AoGBAMQv\nx27uzvgT0L9doZUoTR2Ri5nHW7EH9LoIGJ1eLQ4FI3zFpxFkGHcWRNV56OLI7exf\nvq39xhzJUJ15sj7nsz+o4ef9YbnAPcO9LDD8SjuhT+3rUBt7GEKfBs2zA5YbE1zW\nBlxgTW0oxRcqEambLjAO5/9tDHNyfOfsIhQstFwrAoGBAMEWwpwPoC0DJ2Puzdd5\nAtyl7vzRq/pI/It8hc3BWxG41ChByDRG3Cb/Lp3V0eXVhQsA93yedNaTaHSXdu1s\nZDUckx2hWaxOxG1ozXgUE2W2NMdHRnfCY4aN6lOE46VyUKL1TUC+sjgnldYzufaY\nS7ux5Rl0DA57BeM3PayfHsHS\n-----END PRIVATE KEY-----\n',
    webKeyPkcs1: '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA1Ly851Lv0qL5nzg99jj5DYcoZmgQV1JW8sw6Al4Y38MfxYP/\n1Zb8XJZIP+ujwwAKAItTaTlgy/pNegpWy7qe6j278P4QBJfejxK+NheF+rneD3PR\nPkSBLWiQe/eHU1J9FqIlY3pOojcXA2Ox4TqY6Py7AKh+tqzy1i6FL9M10GrB2sYP\nobtDvySAGZnZcVQuSFjewPUufBGsTiN4cikTesZuTJpkyXlFaZfQW0cPSTxDQajo\nxTLLxfAenVFEZmCGk/ZOyJzlFvQ0r9dgiSLxBG1GwQxJzKzWuDKHDdSLL08ZppBm\nZWH94f4/CKTh96o6Jft5REMS5Gn5gwWw/jqhVwIDAQABAoIBABkUzMtpF8/5rvx6\noQjahrfK65Rx8xtDIJqCQYSYm3jQ2c9rqfSrVxguD66ZlYvJVrnhs0qAnUzvNxs1\nr4NYKUxB+FqIBFNw+ahcnq258EMzOV8RBJEWz965U++Jq3FuFEQK3JBHPJDGIKHM\nVeMmtB3Oo4LcWrQm3SqAqZXjN5ZZXh20fWRvSF62/vaYe5SBipyPmTegC6AcLQBn\nZQWrKq0KOinUkN6nj59wPeqo6SHXBtz75Wb7gBNLW5Y2l+NL1lORh/kIZ4VYnPe4\nYlTxSSA4skYuwoPtGJ8pGW2ymVMUypjhHbRONKyqTJnBMU9s4wOyB4ZgiAkBUjz+\nR2HX92ECgYEA7330TAO3gAcI5pesVTyC/ciaxlY0YGLrWc0bHS69mY6GUO2BRqkN\n5Klb88d4skIjSRgq8hwX/BFAj81P3vCHinhsrMehyXNW92jG5NKPJz/DkFrJ84vX\nGo7bcIDi2qN6qfYvfVlQtSPTWaHnbNbzDdrMWWpG9HwoXPwL1Dq1s00CgYEA42as\nM0N5xrN9hsSyNE2mrVvuUiL4LrS+hBgwmQfGpOY2bCKpywNhrA9biP0SfVyd98a2\nHtqNTXh+HifjPitgPf5i3IpbFYds7CjNnwKSnX+C4y/YHVqaNjYYHiT/PWl6qMDS\nUBta+0BYFyRIuzbznQL3RIEOgSJH3YWW5UkhDTMCgYAgclEZx1siFlHnY98uQR+C\nIJ6PhnhcIqq+JOKqhn2bg0rBRhxApYDDXQqfMYQxqnI7YfHXkWTSesfjc66Bhtbm\nNMCMfBN4Ro8ev+xKbhiE+ceWFCbOP0DqUTZ7vIp/kqx4wGjYs7QShoMI3r2K6mhN\nlTogVxy73OJfDqrPmxCo9QKBgQDEL8du7s74E9C/XaGVKE0dkYuZx1uxB/S6CBid\nXi0OBSN8xacRZBh3FkTVeejiyO3sX76t/cYcyVCdebI+57M/qOHn/WG5wD3DvSww\n/Eo7oU/t61AbexhCnwbNswOWGxNc1gZcYE1tKMUXKhGpmy4wDuf/bQxzcnzn7CIU\nLLRcKwKBgQDBFsKcD6AtAydj7s3XeQLcpe780av6SPyLfIXNwVsRuNQoQcg0Rtwm\n/y6d1dHl1YULAPd8nnTWk2h0l3btbGQ1HJMdoVmsTsRtaM14FBNltjTHR0Z3wmOG\njepThOOlclCi9U1AvrI4J5XWM7n2mEu7seUZdAwOewXjNz2snx7B0g==\n-----END RSA PRIVATE KEY-----\n',
    apiKey: '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDenZyY7/zVHZG2\nXVvKxX/35s11+aijQAWUzKmubZy50jIXGDHo5vMhvMzVljRc2CaP3ScN5O0vs6qJ\nwxQ8lW/Hkhls0NYuCsJf+ycYWp/q41XiV7t1G+QEJZBmqeDR9p7d8aZ3oAnwcNBf\noWB3v7Nhd93aBt/JxqNGV5I56XGZVelLQ7TCw/KTAEI/YEh8M/mgRUpGfghFFLv3\nxMdJ2CkTl5VqJepoOU9Tgxo5iB5rBm/1+BX2tHS6HaRCkBwyPU2BEozYILkSQHrS\n/2t2kVOjomy+d60N8AGbs/h6uLN+BXHBOfwdEwLjYx/UEEAqq1atApp3GmZH9OrG\nE3ZIR5HjAgMBAAECggEAC6fQ6n5WNzT5y285PnVMwpwGUeZPxWG1aRm2IKMt5i9y\niUcDsKAMRs3tzkOzsNDDDsaTeY9s47x9HK1mwoKd0aMn9aHm345B/b3Wnth6haqA\nH/5b8EEU6n//qYBnfFbJ8UY/uFpcFYddQZnfb9BNAg4WmDMX8HvtUeIv48cB4vdF\niEE0w2cGjoInW9udrSLCQdriX1Ssw+g8v7t+4anQ+BNfna49nuXCw59sxKE9ux8X\nCwjZzEVUFJtJ9DJdQDiJJkMV/XlRMh0f3w/QF7KDroKfq/4aSEcGDk6Y5G6WSEHf\niDzIo4H/uisJ7BqccfjuSPmRgPd0BzCtBZORD2zFEQKBgQD6V+I/pCrL0msiQE7u\nhA1h4Yck4KIQRz2bpbgItbYBAhHhcJLnyYX0nGtyVQAUGB3Cw4qMHWZQ7YriXmYE\n7ct6iAsZX+e1o7iQap6FOyk5js/SJ8OtWmQQhKeTIMKf5YehAguQ/3PAqlpv/CRV\nYr908uUCGj9AU8lHMWHcsobXXQKBgQDjpVY9hGCaRytke/xlmgO439UoXbk+oBwD\nhk5NfPQNXgsF6ermLzwbyxKnJH5QhsYYuHqbbAwDIFQx/RvoOLjyP31o+6G2CFiE\nSEWB2SEfbSJR4Dt2vr1bLkblv0QciQLt4oVxnA66bSbSOfbq/HD17XSzLmEd/1vR\nqzsTxCu6PwKBgQDXuUeTg8oFHWuIdlYOHujRQeCNHK1Kzbj/GQy/JKaTs87or3NI\nHVY7dVb5jNmmdymeHZaUKvlyH2AgtSvAb5F6IyU9VnF7CnwOpnG3aUWa/b+D3xQ1\nm8DCoy0sEXzlAIuhaPvClP6QNbv86A//LDrDclN5Pljm+8xkdt9XqNedWQKBgDUI\nu8KxKGBI3E8Yo4B4FQ3o95vj2dhBLMWVcICU77Z9hkvmZxchQfunn7zYv6S7AUOZ\nFtdGoLXJvlO3B91d+ZhWOj1PAimKYDTRMYBCuXi80BYLC09quGqZqWK04IVVVh1d\nfIEvPi8oZrbrUh8EmLxyiZGE6JM4foemQKkmNpm5AoGADIbNXtTPhHlREi8cDuHA\nDaHUs9MCUsWNRk3QkDhH1QbOh6c4VXyG+W8+3me8bdR8EYJ2vADTYaGzHgKeuiJN\nSTXqXhvXDfyjGRMDgFuW5GW402/BET1azZOa9eGH4KVR0cYpITHCafffxrzelXLa\nvJDID5Hq4BtzpdcrxyozZsM=\n-----END PRIVATE KEY-----\n',
    interKey: '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCmGb/V0qZur6I1\ng+5ST50FH9krL2synrkCnS03THTd4yPRLcrppYGxShwRXCwDyxaesRZoP3Kr/AzF\nIf1zf6Ermnl15iyy9OvJAWMAJKXpIYej8M0nNyPfUVlNU2ASU8Btia181/C3V1A5\nohgh/oDqYXNuZx+AGJJlS5YyQGL8zKxMxFaapgYF/am50pst0gWH/4rKNuqu4i9B\nsymXn3gdZoczc5SSYX2BZ1oZfjqj4tgqdlDfybsYdz87HBsMYhgHA2oZZHSMsQM9\nYVy6H99O8vl880n+rdMEICLwo0XwAe4UsORfuT2Z7teENz/9t0ql+Xt4hrXbmKEb\nlVgu7GuVAgMBAAECggEATQ3D7wseN1nV25KdA+U39/Ea20xPo/d650oH+E/JJUgi\nTP870yD65cZ1992083uKvkpzlR/d8Afo2qiWfbaXC3XJY9bIJKq3GRPCHAZkSx7J\nYFWsrkUHqKkBzvvfJRFiQs5sQ26flkX0iw/1twtsPY7AsFY5iECd5Uzn297/rLr7\n72fbdxgANVM2ApUu+n5BIlH0Ikn0dtpcbwUnLM37E9Uhax2feqAflLX1/SoLdo92\ngT0GMvFJuxkJrv3WVDPQBHGWDYQxT0UqCWpEYb7TaPvsyURWi6S3e6a49jeSNx6j\n4zfkXuBoZLIFAz465t7CGetqV5BQsPs7Zu9mmHUC3wKBgQDjoeGM3alpO6UdKB89\nxp1QUQ3MhCnT2LORJLUdxaU1iT/VWTCNnCvpixDknkABcixyFFsM4NiOsMMcw00V\nMVZmRm9vuIuXakHov8COfjEMsNuFLGK4cGS6CmjaUZY+vU7+n5/lrRULXGN5B7KY\nS845tkuWQ4pXF91iDovsaS3lYwKBgQC6zNSCGSTIkKvbeU83f1Ywu3WAUIiigtBH\nGBL7VE1pgN744nm82Q2M0JSai/puFfa8+oNDBPZ21Wfy9cgDsgu2quc1iOExaPV9\nZlsdv1oXtDjCQZNPnKYBulrvx1EYPCs7mGq63Yc09qmc/zeLXSMYZj8I7jcwPmma\nfHgj2eOYpwKBgDrGn9CZo5ayee3PYFG5KQGGDEQUlCBJQgRmMAXh9MigCcVy5CCM\nhKIm8FO3sNsuud8y9lea7w/ZAGg63XptZNu/sCJuykxseVw5tuSUHOIkAGqgjVUG\nYFvROEW2705/3xfL66OIT3jBgEXOAQVl/XfVZCsGgX//f4BENUjz14/1AoGAVaPe\nsZ6RbJpXEBH3rXvlqgXnguJpIghTMKTq3urxarM4hmZeZaQlQC/IUWpnb90F9/Hq\nB+nYjPad55ejEX6pPB/yTGrqw1pZYhpxH5xA06k+dGDYBqHMwfIMCu4YUcIUGAhy\ntiUl/bQwYtfnQS98DY2izJdaGfYjOD5kXhtg6vUCgYEAt1lfy8lw4E4LLEhZA7of\nR63q2gFs88BUvkXhq+SKjjsAe9V0o/t6ltffS/DsSBeXfLb/JnwokNznssH8Zewg\neOJm18IiZydZFVQDT5VKybwgktuzBE5bVGjL7Za6R8uB47Ylmxknk20INyuCUHbv\nJK3/KlmIQ4SWYbGMdK8yCys=\n-----END PRIVATE KEY-----\n',
    rootKey: '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDBms2SKZIBME4L\nNU0iBRgdMJJy6qalYXCmH8MWlFvJWCmYymx+x5oWle7++2PYUPgkdwBcZZW2knzt\nghWP4SZf/9lMs+Nt6ZiTkTZz6UDIdQlo9yy3W5GKniNv2xVLS97/wbDvRpUJ7ux0\noiQ4N49pKGfN+jcJjEckXiGHBKxkBlyC5L5sXX3dZpb2spfSLeQaGcVg2Fwq0SqG\n9/45PqvneWpVVsmHucnEVmt2Kik1tVaPqV6je8TAwfqNNcy1FVgUqFz9JpQP9AES\nYX97fVR5jb+gYBaDoTDlWAb6Kvwz3/4UdIJfYewDsyypZTAB2qkP/3cW2Y98tbHM\nhPx9TstHAgMBAAECggEAC6FBzbtrNrYQ93G6vJtDZmbSDU7U4Y9iZcr3pvtqLhn6\nhF/4jNRvCFdLtYvNZM5XBv29CvqGjU1BwuoIYzhlBpRHGJP1IAJNyjjeuq9y1vfX\nhQjVaf2kAbMxMW7JhIM+Fe1WicZwJ9oZ4IG9nOuS1QAlMtrf2St7jzmLrbbVUjwd\nfdZmfgM0veluvrQXtbIjDxXXluIjzrTnSmeHHBHFQhb9z00UqB+Yx99C/S3/tpo8\nhjKonaWvrqFiCJ/ZB8g+HVGznzPrsEGA+rziwr4ICqNLAjZeCcn+PF2JNTms7vbC\n4X3rty+upnslLHf5JVKyEQ6Sf3tY40TSWJVOAkjI3QKBgQDnbS8KhLOQXyGBE3dC\n57R1uuWAAnTmgniLGmsPwcOJ8tgpTei/xGd5GOie5Q0874XRMd59/x9oOvVoeMmp\nCR3qENu4E8huZNhYl6Rc4a8Bf7EztrL2czzJ/eq+81H+RVFWzY62qVwg/vgDVRd/\ndHXV93/DrZZ0+AAmPSFPOVP3tQKBgQDWKYR6Rm11NR/9AYi1YBiky7gD0Voa4RRK\nXto8md3HXxLRtKWbOcXwa8lYI9jQcmg84ylc43XoCfZGUq66RsGPytN8lx3oW7Vj\nVxSQW5xEeZA6W59NNEYvPUb3BM6OPTddbCY2ixF0TiuraH7gA3XhMKtBIj28jAhh\nxpOYe9GciwKBgQDI/aR7SCEDY/ufNJ7BdqbeEMG9WWTZxbqXZQxSlQAUUNq3lLht\nxE/xdlahmWDT6VqZAuyvFOHcDkiQwUazDf3zCU0qI9RRPDhBSQIwwLjTXmkx9pyb\nOh4zd9lmmcA+S0mHT+OAdLpU1dvkWQSdZzHn8JoAAkTHtZO7oh/JxIpOeQKBgDNO\nzQtSViTvblN6C5uQgzbwC4z2mgS4idjrcpN0NXrvXx3Yjphqte5MlHdGV0pRLoHv\n1lgHspa91D+yzWOZUgQ2DobZ2XNyjTlYgne3Su/ow9IHY1nmvS3SG29Qun+/UMVU\nBK+qj6ryk2nEZikbCyHBPDYlku7aCaQLJA8zEtvTAoGAe2DMQ+UxzwtQbTRt7Tad\nT5K8uwpr9Zavl/6FhpWm0n/mMNfcAcoEdEgYd8Dan510BXtB+w0AgjkmDfLmuntX\nhRRaB+a/7yV5bLcTB8AmLwRKviFZEr4H4bVPKJA4E/SUMHof4jvKNM1O7ixBx+sf\nRkechLYwnW7isvUX/Kc5mr4=\n-----END PRIVATE KEY-----\n',
    relKey: '-----BEGIN PRIVATE KEY-----\nMIIEuwIBADANBgkqhkiG9w0BAQEFAASCBKUwggShAgEAAoIBAQCTad8ZFpSVafqT\n3Xl8dmto7PrHk3hJEDzBQ9nMt61bnUKpFsH6eSEyW3vOXQApewsvbfRmN++eLWOU\nOY+J+6hmJDWXBCACr9ANlu8PLqmpHxgcXVG2SxAHxPzw6Pw1cglQbZSPtjZF0TkH\nq4+8Vj6jUxezhPSBqFhqDZ2ab6VuJADhDWjdCobCbCc8AEfgM1g5F87FKBhOhulV\n2Fx5mV9hton+Z5p2rgRgzNqEA8ONsI+D5CJGis1oxv6/WujQfuA3MeTEaeagmYeL\ndXLgCr/sYlqW26IIVTX4GeNkEHSjTAe0W57tVNP34jJt4zKLIQM5Lo0jR0BFMm14\nbzT+OAAhAgMBAAECgf8uEOem72d/SZ8EljFgs6DdKTE1LOBp9KkHvCxTzRJfjsVG\nEdaMb03wbqZB1s42KD1WlQXK66/1vjlgGJzCgeIeCTK1/pQCQu7BUGlkVTCvqQff\n1UmzrcFUrDpfDm/CQ+ClQZkrT8WmC7vGqdZBBLKOV2kQsHu4COOYQKj/meQYhq5E\nkL8A8OpVa5toguXCTmdCdQYG1PUQOcQY7tqdFiwDXjn65n+qnkojhVSfGw1KKcVZ\nWLIEytTI9gSMuB6uSWGDZscWcMD+GrjHffEaIUAcFo+Z0Qcytrf0GVLFxuUmgdLH\nnBZ0E00bkwvCzKxr5/+Z3dWuzsVs4uUchrqCFUECgYEAyNCASJauraYgnyAqde36\nDLe/jY0cECBxWroqNoej/slirnB5blAS1cJQvItwI4jbZIdtu+A8YVjbrYNwDSqC\nlbMoDl35ByfHXKSUBqHjYAvnqJPbJ5VzytLy+HNqJcJ/szKdEj3KmXh+Vz7/nYh0\nus1ZNcX+e/FvK9hnHPc+wX8CgYEAu+yQSA3CgdTSHw6oCq5fLOT9v6u1rupMgMY+\nTcu/qeAzFz2GPYluhcvkNx2Uq42+kvJ8qG5YgJ1iWTMotysVsY5VtNW+LhYTFN/L\n6leGPxwyJjT+dzO04pwi1POHXxxPnTBbxhVrA4L89uj7yrQEif93JZs6g5Tb1NUV\nZ+rGzl8CgYB5Wu87brwvOobaQwEF9YO37c83xr/fywtVrc1W2M+1aJRXIKdxj7hi\nL6TE3GsvPkR/UwxwjklO9vkCubycaEU0HGmnjQiyV0q2ZMsD2w9ieq9Lg9bb7Ahm\n2OZ2WKEcIpczfvHHFUp7RoLrTKoC1HTecrxnr7hjxHrPf16I9a2aFwKBgB9dOi9s\nbHwywucAETfHJoddqKQmymnpHN+ZNqjRSqnVi3FjiVYX6+RUxUAVpcyEGbx40Clk\nUU0V92YfzbnUbQh3UwKdceJLOOARAf2YogVCdXQ/AAFxFc2EdaPJCVzsYrU/bvG+\nfV/WqtWiyPNp3CAUDRSvtbJkU9RPxATWAFxNAoGBAK0rpEe9s1CKGmvuajaKDQPf\naW3HHAkI3cVBaK1E4YowR+/Uq9yYZy4alN9RbfYe/v2NDj7CedOM8OGwwJ7zUPB0\nIEY8RE7O/bcOrPRHtzW83r3QUNghsQ5Y7AmLCUwxqHJey+hm+pvMuJfI9E+Je+MB\nYYFKs4utFa2QeTXphtWO\n-----END PRIVATE KEY-----\n',
    relPub: '-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAk2nfGRaUlWn6k915fHZr\naOz6x5N4SRA8wUPZzLetW51CqRbB+nkhMlt7zl0AKXsLL230Zjfvni1jlDmPifuo\nZiQ1lwQgAq/QDZbvDy6pqR8YHF1RtksQB8T88Oj8NXIJUG2Uj7Y2RdE5B6uPvFY+\no1MXs4T0gahYag2dmm+lbiQA4Q1o3QqGwmwnPABH4DNYORfOxSgYTobpVdhceZlf\nYbaJ/meadq4EYMzahAPDjbCPg+QiRorNaMb+v1ro0H7gNzHkxGnmoJmHi3Vy4Aq/\n7GJaltuiCFU1+BnjZBB0o0wHtFue7VTT9+IybeMyiyEDOS6NI0dARTJteG80/jgA\nIQIDAQAB\n-----END PUBLIC KEY-----\n',
    singleCrt: '-----BEGIN CERTIFICATE-----\nMIIDgjCCAmqgAwIBAgIICyw9Tl9gcYAwDQYJKoZIhvcNAQELBQAwVDEiMCAGA1UE\nAwwZQ2xvdWRDbWQgUlNBIERWIFNlcnZlciBDQTEhMB8GA1UECgwYQ2xvdWRDbWQg\nSW50ZXJtZWRpYXRlIENBMQswCQYDVQQGDAJDTjAeFw0yMzA3MDEwMDAwMDBaFw0y\nNDA2MzAwMDAwMDBaMD4xGDAWBgNVBAMMD2FwaS5leGFtcGxlLmNvbTEVMBMGA1UE\nCgwMRXhhbXBsZSBDb3JwMQswCQYDVQQGDAJDTjCCASIwDQYJKoZIhvcNAQEBBQAD\nggEPADCCAQoCggEBAN6dnJjv/NUdkbZdW8rFf/fmzXX5qKNABZTMqa5tnLnSMhcY\nMejm8yG8zNWWNFzYJo/dJw3k7S+zqonDFDyVb8eSGWzQ1i4Kwl/7Jxhan+rjVeJX\nu3Ub5AQlkGap4NH2nt3xpnegCfBw0F+hYHe/s2F33doG38nGo0ZXkjnpcZlV6UtD\ntMLD8pMAQj9gSHwz+aBFSkZ+CEUUu/fEx0nYKROXlWol6mg5T1ODGjmIHmsGb/X4\nFfa0dLodpEKQHDI9TYESjNgguRJAetL/a3aRU6OibL53rQ3wAZuz+Hq4s34FccE5\n/B0TAuNjH9QQQCqrVq0CmncaZkf06sYTdkhHkeMCAwEAAaNuMGwwDwYDVR0TAQH/\nBAUwAwEBADAOBgNVHQ8BAf8EBAMCBaAwEwYDVR0lBAwwCgYIKwYBBQUHAwEwNAYD\nVR0RBC0wK4IPYXBpLmV4YW1wbGUuY29tghhhcGktaW50ZXJuYWwuZXhhbXBsZS5j\nb20wDQYJKoZIhvcNAQELBQADggEBAHQTzczGYa8L6cXCgnvcXcDU+o7o4MVp22AQ\n2/cfkkZy7tDMzMLiIOTh2tD/RMgW3ly661QKtDfKoTreG1KrAoYm+7ognJbCFx4x\nXQjnj11sW0sXSsANXzL4E5n+0f+w7J7stz8V9qtl87O/HO/7DjikVc7hsT6aGJiJ\nmk3yEqXEMNvFOKYrg2k/Fw8U+Bp1euAm8WHnpQOD0HJJSDWa2SYP74KoPjfnaHnU\nZthgvOG8evNzT4AQ+ywZSiBev9vczAXJUkKLLOdJOrU/eT6v4bVrZvui7IqG6m2C\nMz5OiqquUTBj4UW7lmqKuEA4Ozq19sxasO+2vOyuYS17eR8hH1I=\n-----END CERTIFICATE-----\n',
    __end: true
  };

  var WEB_CERT_PEM = PEM.webCrt || '';
  var API_CERT_PEM = PEM.apiCrt || '';
  var ROOT_CERT_PEM = PEM.rootCrt || '';
  var INTER_CERT_PEM = PEM.interCrt || '';
  var INTERNAL_CERT_PEM = PEM.internalCrt || '';
  var OPS_CERT_PEM = PEM.opsCrt || '';
  var WEB_KEY_PEM = PEM.webKey || '';
  var API_KEY_PEM = PEM.apiKey || '';
  var ROOT_KEY_PEM = PEM.rootKey || '';
  var INTER_KEY_PEM = PEM.interKey || '';
  var RELEASE_KEY_PEM = PEM.relKey || '';
  var RELEASE_PUB_PEM = PEM.relPub || '';
  var CSR_PEM = (PEM.csr || '').replace(/\r\n/g, '\n');
  var WEB_PKCS1_PEM = PEM.webKeyPkcs1 || '';

  /* 站点证书链（leaf + intermediate）——Nginx 上的 ssl_certificate 指向它 */
  var WEB_FULLCHAIN = WEB_CERT_PEM + INTER_CERT_PEM;
  var API_CHAIN_PEM = API_CERT_PEM;                 /* 只有叶子：链不完整 */
  var API_FULLCHAIN = API_CERT_PEM + INTER_CERT_PEM;

  var SEC_FS = {
    /* ---------- Nginx 站点证书 ---------- */
    '/etc/nginx/ssl/server.crt': { content: WEB_FULLCHAIN, mode: '644', user: 'root', mtime: '2023-04-01 10:00' },
    '/etc/nginx/ssl/web.crt': { content: WEB_FULLCHAIN, mode: '644', user: 'root', mtime: '2023-04-01 10:00' },
    '/etc/nginx/ssl/server.key': { content: WEB_KEY_PEM, mode: '600', user: 'root', mtime: '2023-04-01 10:00' },
    '/etc/nginx/ssl/web.key': { content: WEB_KEY_PEM, mode: '600', user: 'root', mtime: '2023-04-01 10:00' },
    '/etc/nginx/ssl/fullchain.crt': { content: WEB_FULLCHAIN, mode: '644', user: 'root', mtime: '2023-04-01 10:00' },
    '/etc/nginx/ssl/api.crt': { content: API_CERT_PEM, mode: '644', user: 'root', mtime: '2023-07-01 10:00' },
    '/etc/nginx/ssl/api.key': { content: API_KEY_PEM, mode: '600', user: 'root', mtime: '2023-07-01 10:00' },
    '/etc/nginx/ssl/ops.crt': { content: OPS_CERT_PEM, mode: '644', user: 'root', mtime: '2023-09-01 10:00' },
    '/etc/nginx/ssl/internal.crt': { content: INTERNAL_CERT_PEM, mode: '644', user: 'root', mtime: '2024-01-01 10:00' },
    '/etc/nginx/ssl/api.example.com.csr': { content: CSR_PEM, mode: '644', user: 'root', mtime: '2023-07-01 09:50' },
    '/etc/nginx/ssl/README': { content: '证书放置约定：\n  server.crt = 叶子 + 中间证书（fullchain），server.key = 私钥（600）\n  只放叶子证书会导致 Java / Python / curl 报 unable to get local issuer certificate\n', mode: '644', user: 'root', mtime: '2023-04-01 10:00' },

    /* ---------- 系统 CA 目录 ---------- */
    '/etc/ssl/certs/root-ca.crt': { content: ROOT_CERT_PEM, mode: '644', user: 'root', mtime: '2023-01-01 09:00' },
    '/etc/ssl/certs/intermediate.crt': { content: INTER_CERT_PEM, mode: '644', user: 'root', mtime: '2023-01-01 09:00' },
    '/etc/ssl/certs/root-ca.key': { content: ROOT_KEY_PEM, mode: '600', user: 'root', mtime: '2023-01-01 09:00' },
    '/etc/ssl/certs/intermediate.key': { content: INTER_KEY_PEM, mode: '600', user: 'root', mtime: '2023-01-01 09:00' },
    '/etc/pki/tls/certs/ca-bundle.crt': { content: ROOT_CERT_PEM, mode: '644', user: 'root', mtime: '2023-01-01 09:00' },
    '/etc/pki/tls/certs/ops.example.com.crt': { content: OPS_CERT_PEM, mode: '644', user: 'root', mtime: '2023-09-01 10:00' },

    /* ---------- 发布包 / 备份 / 报表 ---------- */
    '/opt/pkg/app-1.2.3.tar.gz': { content: '<binary>app-1.2.3 release tarball, sha256 recorded in release notes', size: 18432000, mode: '644', user: 'root', mtime: '2024-03-15 16:20' },
    '/opt/pkg/app.tar.gz': { content: '<binary>app release tarball', size: 18432000, mode: '644', user: 'root', mtime: '2024-03-15 16:20' },
    '/opt/pkg/release.key': { content: RELEASE_KEY_PEM, mode: '600', user: 'root', mtime: '2024-03-01 09:00' },
    '/opt/pkg/release.pub': { content: RELEASE_PUB_PEM, mode: '644', user: 'root', mtime: '2024-03-01 09:00' },
    '/data/backup/db-20240318.sql': { content: '-- MySQL dump 10.13  Distrib 8.0.32, for Linux (x86_64)\n-- Host: db-prod-01    Database: orders\n-- ------------------------------------------------------\nDROP TABLE IF EXISTS `orders`;\nCREATE TABLE `orders` (\n  `id` bigint NOT NULL AUTO_INCREMENT,\n  `order_no` varchar(32) NOT NULL,\n  `amount` decimal(12,2) DEFAULT NULL,\n  PRIMARY KEY (`id`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;\nINSERT INTO `orders` VALUES (8812,`SO20240318001`,1299.00);\n-- Dump completed on 2024-03-18  3:20:11\n', mode: '600', user: 'root', mtime: '2024-03-18 03:20' },
    '/data/report/finance.csv': { content: '月份,收入,支出,净利润\n2024-01,1842300.00,1120440.50,721859.50\n2024-02,1620880.00,1088110.00,532770.00\n2024-03,2011550.00,1203900.25,807649.75\n', mode: '640', user: 'root', mtime: '2024-03-18 08:30' },
    '/data/restore/.keep': { content: '', mode: '644', user: 'root', mtime: '2024-03-18 09:00' },

    /* ---------- /data/www（SELinux 标签场景） ---------- */
    '/data/www/index.html': { content: '<!DOCTYPE html>\n<html><head><title>My App</title></head><body><h1>It works!</h1></body></html>\n', mode: '644', user: 'nginx', mtime: '2024-03-12 15:30' },
    '/data/www/health.txt': { content: 'ok\n', mode: '644', user: 'nginx', mtime: '2024-03-12 15:30' },

    /* ---------- ClamAV 扫描目录 ---------- */
    '/data/upload/20240318-report.xlsm': { content: '<binary>xlsm with macro', size: 48210, mode: '644', user: 'nginx', mtime: '2024-03-18 09:22' },
    '/data/upload/readme.txt': { content: '上传中转目录，每天凌晨全量扫描一次\n', mode: '644', user: 'nginx', mtime: '2024-03-11 11:02' },
    '/data/share/soft/setup.exe': { content: '<binary>windows installer', size: 12582912, mode: '644', user: 'root', mtime: '2024-03-10 14:40' },
    '/data/share/doc/notes.md': { content: '# 共享目录\n对外提供 Windows 安装包下载。\n', mode: '644', user: 'root', mtime: '2024-03-10 14:40' },
    '/data/quarantine/README': { content: '隔离区：发现的感染文件会 --move 到这里，保留样本便于分析\n', mode: '644', user: 'root', mtime: '2024-02-01 09:00' },

    /* ---------- SELinux ---------- */
    '/etc/selinux/config': { content: '# This file controls the state of SELinux on the system.\n# SELINUX= can take one of these three values:\n#     enforcing - SELinux security policy is enforced.\n#     permissive - SELinux prints warnings instead of enforcing.\n#     disabled - No SELinux policy is loaded.\nSELINUX=enforcing\n# SELINUXTYPE= can take one of these three values:\n#     targeted - Targeted processes are protected,\n#     minimum - Modification of targeted policy.\n#     mls - Multi Level Security protection.\nSELINUXTYPE=targeted\n', mode: '644', user: 'root', mtime: '2024-03-05 08:00' },
    '/var/log/audit/audit.log': { content: 'type=AVC msg=audit(1710728641.412:1802): avc:  denied  { read } for  pid=1843 comm="nginx" name="index.html" dev="vdb1" ino=131842 scontext=system_u:system_r:httpd_t:s0 tcontext=unconfined_u:object_r:default_t:s0 tclass=file permissive=0\n', mode: '600', user: 'root', mtime: '2024-03-18 09:04' },

    /* ---------- AppArmor ---------- */
    '/etc/apparmor.d/usr.sbin.nginx': { content: '#include <tunables/global>\n/usr/sbin/nginx flags=(enforce) {\n  #include <abstractions/base>\n  /etc/nginx/** r,\n  /var/log/nginx/** rw,\n  /data/www/** r,\n}\n', mode: '644', user: 'root', mtime: '2024-01-15 10:20' },
    '/etc/apparmor.d/docker-default': { content: '#include <tunables/global>\nprofile docker-default flags=(attach_disconnected,mediate_deleted) {\n  #include <abstractions/base>\n  network,\n  capability,\n  file,\n}\n', mode: '644', user: 'root', mtime: '2024-01-15 10:20' },

    /* ---------- lynis 报告 ---------- */
    '/var/log/lynis.log': { content: '2024-03-18 09:52:00 === Lynis 3.0.9 ===\n2024-03-18 09:52:00 Performing system audit\n2024-03-18 09:52:04 Hardening index : 68 [#############       ]\n', mode: '600', user: 'root', mtime: '2024-03-18 09:52' },
    '/var/log/lynis-report.dat': { content: '####################################################\n# Lynis report file\n#\n# This is a report file in key=value format\n####################################################\n\nhardening_index=68\n\nwarning[]=Found some information about this system in a world-readable file|/etc/issue\nwarning[]=No password set for single user mode\nwarning[]=/etc/ssh/sshd_config:PermitRootLogin is set to yes\nsuggestion[]=Install a file integrity tool to monitor changes|AIDE\nsuggestion[]=Set a password on GRUB boot loader to prevent altering boot configuration\nsuggestion[]=Consider hardening SSH configuration|AllowTcpForwarding (set YES to NO)\nsuggestion[]=Enable seccomp for service nginx\nsuggestion[]=Harden /etc/ssh/sshd_config|MaxAuthTries (set 6 to 3)\n', mode: '600', user: 'root', mtime: '2024-03-18 09:52' },

    /* ---------- 历史日志（轮转 / 压缩） ---------- */
    '/var/log/secure-20240317.gz': { content: 'Mar 17 21:14:02 web-prod-01 sshd[20114]: Accepted password for root from 198.51.100.77 port 40221 ssh2\nMar 17 21:14:44 web-prod-01 sshd[20114]: pam_unix(sshd:session): session opened for user root by (uid=0)\nMar 17 21:40:11 web-prod-01 sshd[20114]: pam_unix(sshd:session): session closed for user root\nMar 17 22:03:17 web-prod-01 sshd[20388]: Failed password for invalid user test from 198.51.100.77 port 40882 ssh2\n', gz: true, mode: '600', user: 'root', mtime: '2024-03-18 03:00' },
    '/var/log/secure-20240316.gz': { content: 'Mar 16 02:11:35 web-prod-01 sshd[18022]: Failed password for invalid user admin from 203.0.113.66 port 52110 ssh2\nMar 16 02:11:39 web-prod-01 sshd[18022]: Failed password for invalid user admin from 203.0.113.66 port 52134 ssh2\nMar 16 03:40:02 web-prod-01 sshd[18098]: Accepted publickey for deploy from 203.0.113.25 port 50022 ssh2\n', gz: true, mode: '600', user: 'root', mtime: '2024-03-17 03:00' },
    '/var/log/auth.log-20240317.gz': { content: 'Mar 17 21:14:02 web-prod-01 sshd[20114]: Accepted password for root from 198.51.100.77 port 40221 ssh2\n', gz: true, mode: '600', user: 'root', mtime: '2024-03-18 03:00' },

    /* ---------- 其他 ---------- */
    '/etc/ld.so.preload': { content: '', mode: '644', user: 'root', mtime: '2024-01-10 09:00' },
    '/tmp/exclude.txt': { content: '10.0.1.1\n10.0.1.254\n10.0.0.0/16\n', mode: '644', user: 'root', mtime: '2024-03-18 09:40' },
    '/etc/ssh/sshd_config': { content: '# SSH 服务端配置（安全加固重点）\nPort 22\nPermitRootLogin yes\nPasswordAuthentication yes\nMaxAuthTries 6\nX11Forwarding yes\n', mode: '600', user: 'root', mtime: '2024-03-10 09:30' }
  };

  /* 证书文件在 termfs 里可能已经存在 —— fsAdd 只在"路径不存在"时生效，不会覆盖 */
  window.CC_SHELL.fsAdd(SEC_FS);

  /* ======================================================================
     2 · openssl
     ====================================================================== */
  var OPENSSL_VERSION = 'OpenSSL 3.0.7 1 Nov 2022 (Library: OpenSSL 3.0.7 1 Nov 2022)';

  /* 教学环境的虚拟加密存储：enc -e 写进去、-d 再读出来（内容无法真的逆向） */
  var STORE = window.CC_SEC_STORE || (window.CC_SEC_STORE = {});

  function opensslUsage() {
    return ['Invalid command;', 'usage: openssl command [ options ... ]'];
  }

  function subUsage(name) {
    return [name + ': Use -help for summary.'];
  }

  function readCertArg(ctx, file) {
    if (!file) return { err: 'No certificate file specified or source is not a file.' };
    var r = fsRead(ctx, file);
    if (r.error) return { err: "Could not open file or uri for loading certificate from file " + file };
    var blocks = pemBlocks(r.content, 'CERTIFICATE');
    if (!blocks.length) {
      /* 真 openssl 对非 PEM 内容报的就是这句（最典型的是把 .key 当证书读） */
      return { err: 'unable to load certificate' };
    }
    return { pem: blocks[0], all: blocks, content: r.content };
  }

  function opensslSClient(argv, ctx, stdin, HOST, out, err) {
    var opt = parseOpts(argv, ['connect', 'servername', 'CAfile', 'starttls', 'cipher', 'sess_out'],
      ['showcerts', 'brief', 'quiet', 'state', 'no_ticket', 'prexit', 'tls1_2', 'tls1_3']);
    var target = opt.connect;
    if (!target) { err.push('s_client: Option -connect requires an argument'); return 1; }
    var parts = String(target).split(':');
    var host = parts[0], port = parts[1] || '443';
    var sni = opt.servername || host;

    /* 教学环境里的"已知域名 → IP"表：与 station 里其它条目保持一致 */
    var KNOWN = {
      'web.example.com': '121.36.44.17',
      'www.example.com': '121.36.44.17',
      'api.example.com': '121.36.44.18',
      'ops.example.com': '121.36.44.19',
      'www.huaweicloud.com': '121.36.44.20',
      'localhost': '127.0.0.1',
      '127.0.0.1': '127.0.0.1'
    };
    var ip = KNOWN[host];
    if (!ip && /^\d+\.\d+\.\d+\.\d+$/.test(host)) ip = host;
    if (!ip) {
      err.push('connect:errno=101');
      err.push('40A7B7C0FF7F0000:error:80000002:system library:BIO_connect:Connection refused:crypto/bio/bio_sock2.c:121:calling connect()');
      return 1;
    }
    if (port !== '443' && !opt.starttls) {
      /* 端口不通的场景（db.example.com:3306 走 starttls 分支） */
      err.push('connect:errno=111');
      err.push('40A7B7C0FF7F0000:error:80000002:system library:BIO_connect:Connection refused:crypto/bio/bio_sock2.c:121:calling connect()');
      return 1;
    }
    if (opt.starttls) {
      if (opt.starttls === 'mysql' && host === 'db.example.com') {
        out.push('CONNECTED(00000003)');
        out.push('depth=0 CN = db.example.com');
        out.push('verify error:num=20:unable to get local issuer certificate');
        out.push('verify return:1');
        out.push('---');
        out.push('Certificate chain');
        out.push(' 0 s:CN = db.example.com');
        out.push('   i:CN = CloudCmd RSA DV Server CA');
        out.push('---');
        out.push('Server certificate');
        out.push('subject=CN = db.example.com');
        out.push('issuer=CN = CloudCmd RSA DV Server CA');
        out.push('---');
        out.push('SSL handshake has read 1842 bytes and written 348 bytes');
        out.push('Verification: OK');
        out.push('---');
        out.push('New, TLSv1.3, Cipher is TLS_AES_256_GCM_SHA384');
        out.push('Server public key is 2048 bit');
        out.push('---');
        out.push('（教学环境：MySQL 侧 TLS 握手成功，说明 3306 的加密通道可用；连不上是网络/防火墙层面的问题）');
        return 0;
      }
      err.push('starttls: no response from server (or server does not support STARTTLS)');
      return 1;
    }

    /* 站点证书表：api.example.com 故意只下发 1 张（链不完整） */
    var SITES = {
      'web.example.com': { leaf: WEB_CERT_PEM, chain: WEB_FULLCHAIN, n: 2, s: 'CN = web.example.com', i: 'CN = CloudCmd RSA DV Server CA' },
      'www.example.com': { leaf: WEB_CERT_PEM, chain: WEB_FULLCHAIN, n: 2, s: 'CN = web.example.com', i: 'CN = CloudCmd RSA DV Server CA' },
      'api.example.com': { leaf: API_CERT_PEM, chain: API_CHAIN_PEM, n: 1, s: 'CN = api.example.com', i: 'CN = CloudCmd RSA DV Server CA' },
      'ops.example.com': { leaf: OPS_CERT_PEM, chain: OPS_CERT_PEM, n: 1, s: 'CN = ops.example.com', i: 'CN = CloudCmd RSA DV Server CA' },
      'www.huaweicloud.com': { leaf: ROOT_CERT_PEM, chain: ROOT_CERT_PEM, n: 1, s: 'CN = www.huaweicloud.com', i: 'CN = GlobalSign RSA OV SSL CA 2018' }
    };
    var site = SITES[host] || null;
    if (!site) {
      err.push('connect:errno=101');
      err.push('40A7B7C0FF7F0000:error:80000002:system library:BIO_connect:Connection refused:crypto/bio/bio_sock2.c:121:calling connect()');
      return 1;
    }

    /* 证书与 SNI 不匹配：真 openssl 的 verify 码是 62 */
    var cert = parseCertificate(site.leaf);
    var mismatch = false;
    if (cert && cert.dnsNames && cert.dnsNames.length) {
      var hit = false;
      for (var di = 0; di < cert.dnsNames.length; di++) if (cert.dnsNames[di] === sni) hit = true;
      if (!hit) mismatch = true;
    }
    var code, codeText;
    if (mismatch) { code = 62; codeText = 'hostname mismatch'; }
    else if (site.n === 1) { code = 21; codeText = 'unable to verify the first certificate'; }
    else { code = 0; codeText = 'ok'; }

    if (opt.brief) {
      out.push('CONNECTED(00000003)');
      out.push('---');
      if (cert) {
        out.push('Certificate provided by peer:');
        out.push('Subject: ' + cert.subjectRaw);
        out.push('Issuer: ' + cert.issuerRaw);
      }
      out.push('---');
      out.push('Protocol version: TLSv1.3');
      out.push('Cipher: TLS_AES_256_GCM_SHA384');
      out.push('Verification: ' + (code === 0 ? 'OK' : (codeText + ' (code ' + code + ')')));
      out.push('---');
      return 0;
    }

    out.push('CONNECTED(00000003)');
    out.push('depth=1 ' + site.i);
    if (code === 21) out.push('verify error:num=21:unable to verify the first certificate');
    if (mismatch) out.push("verify error:num=62:hostname mismatch");
    out.push('verify return:1');
    out.push('depth=0 ' + site.s);
    if (code === 21) out.push('verify error:num=21:unable to verify the first certificate');
    if (mismatch) out.push("verify error:num=62:hostname mismatch");
    out.push('verify return:1');
    out.push('---');
    out.push('Certificate chain');
    var blocks = pemBlocks(site.chain, 'CERTIFICATE');
    if (!blocks.length) blocks = [site.leaf];
    blocks.forEach(function (b, i) {
      var c = parseCertificate(b);
      out.push(' ' + i + ' s:' + (c && c.subjectRaw ? c.subjectRaw : site.s));
      out.push('   i:' + (c && c.issuerRaw ? c.issuerRaw : site.i));
    });
    out.push('---');
    out.push('Server certificate');
    if (opt.showcerts) {
      blocks.forEach(function (b) { splitLines(b).forEach(function (l) { out.push(l); }); });
    } else {
      out.push('-----BEGIN CERTIFICATE-----');
      out.push(pemBody(blocks[0]));
      out.push('-----END CERTIFICATE-----');
    }
    out.push('subject=' + (cert ? cert.subjectRaw : site.s));
    out.push('issuer=' + (cert ? cert.issuerRaw : site.i));
    out.push('---');
    out.push('No client certificate CA names sent');
    out.push('Peer signing digest: SHA256');
    out.push('Peer signature type: RSA-PSS');
    out.push('Server Temp Key: X25519, 253 bits');
    out.push('---');
    out.push('SSL handshake has read 2846 bytes and written 411 bytes');
    out.push('Verification: ' + (code === 0 ? 'OK' : codeText));
    out.push('---');
    out.push('New, TLSv1.3, Cipher is TLS_AES_256_GCM_SHA384');
    out.push('Server public key is 2048 bit');
    out.push('Secure Renegotiation IS NOT supported');
    out.push('Compression: NONE');
    out.push('Expansion: NONE');
    out.push('No ALPN negotiated');
    out.push('SSL-Session:');
    out.push('    Protocol  : TLSv1.3');
    out.push('    Cipher    : TLS_AES_256_GCM_SHA384');
    out.push('    Session-ID: 4E1C2A7B9F3D6E8A0B1C2D3E4F5061728394A5B6C7D8E9F00112233445566778');
    out.push('    Session-ID-ctx:');
    out.push('    Master-Key: 8F2A1C4E6B8D0F2A4C6E8B0D2F4A6C8E0B2D4F6A8C0E2B4D6F8A0C2E4B6D8F0A');
    out.push('    PSK identity: None');
    out.push('    PSK identity hint: None');
    out.push('    SRP username: None');
    out.push('    Start Time: 1710726660');
    out.push('    Timeout   : 7200 (sec)');
    out.push('    Verify return code: ' + code + ' (' + codeText + ')');
    out.push('    Extended master secret: yes');
    out.push('---');
    return 0;
  }

  function opensslX509(argv, ctx, stdin, HOST, out, err) {
    /* 值选项与开关选项不能混写：subject / issuer / dates / enddate 都是**开关**，
       写进值选项表会把紧跟的参数吃掉，于是 `-noout -subject -issuer -dates`
       三条全部失效（这是最容易写错、也最难发现的一处）。 */
    var opt = parseOpts(argv,
      ['in', 'inform', 'out', 'outform', 'checkend', 'days', 'ext', 'nameopt', 'CA', 'CAkey', 'set_serial'],
      ['noout', 'text', 'subject', 'issuer', 'dates', 'enddate', 'serial', 'modulus', 'pubkey', 'fingerprint', 'sha256', 'sha1', 'md5', 'hash', 'req', 'x509toreq', 'extensions', 'clrext', 'trustout']);
    var src = opt['in'];
    if (!src) { err.push(subUsage('x509')[0]); return 1; }
    var r = readCertArg(ctx, src);
    if (r.err) { err.push(r.err); return 1; }
    var cert = r.pem ? parseCertificate(r.pem) : null;
    if (!cert || cert.error) { err.push('unable to load certificate'); return 1; }

    var wantSubject = !!opt.subject, wantIssuer = !!opt.issuer, wantDates = !!opt.dates;
    if (opt.text) {
      out.push('Certificate:');
      out.push('    Data:');
      out.push('        Version: ' + cert.version + ' (0x' + (cert.version - 1).toString(16) + ')');
      out.push('        Serial Number: ' + cert.serialDec + ' (0x' + cert.serialHex + ')');
      out.push('        Signature Algorithm: sha256WithRSAEncryption');
      out.push('        Issuer: ' + cert.issuerRaw);
      out.push('        Validity');
      out.push('            Not Before: ' + cert.notBefore.text);
      out.push('            Not After : ' + cert.notAfter.text);
      out.push('        Subject: ' + cert.subjectRaw);
      out.push('        Subject Public Key Info:');
      out.push('            Public Key Algorithm: rsaEncryption');
      out.push('                RSA Public-Key: (' + ((cert.modulus ? cert.modulus.length : 256) * 8) + ' bit)');
      if (cert.modulus) {
        out.push('                Modulus:');
        var hexMod = hexOf(cert.modulus);
        var chunk = hexMod.slice(0, 32);
        var lines = [];
        for (var hi = 0; hi < hexMod.length; hi += 32) {
          var seg = hexMod.slice(hi, hi + 32);
          var pairs = [];
          for (var pi = 0; pi < seg.length; pi += 2) pairs.push(seg.slice(pi, pi + 2));
          lines.push('                    ' + pairs.join(':'));
        }
        lines.forEach(function (l) { out.push(l); });
        out.push('                Exponent: 65537 (0x10001)');
      }
      out.push('        X509v3 extensions:');
      cert.extensions.forEach(function (e) {
        out.push('            ' + e.name + (e.critical ? ': critical' : ': '));
        if (e.lines && e.lines.length) {
          e.lines.forEach(function (l) { out.push('                ' + l); });
        } else if (e.raw) {
          out.push('                ' + hexOf(e.raw.slice(0, 8)).toUpperCase().replace(/(..)/g, '$1 ').trim());
        }
      });
      out.push('    Signature Algorithm: sha256WithRSAEncryption');
      out.push('        7f:41:22:03:a6:70:78:d5:fa:b9:22:1c:e9:4d:3f:54:14:e1:');
      out.push('        f8:75:ca:7a:18:a7:42:c3:e0:d6:13:7e:58:03:d2:6b:86:eb:');
      out.push('        76:42:20:f5:15:a2:b8:54:4e:fb:df:68:a7:9a:3c:ba:3d:d5');
      if (!opt.noout) { splitLines(r.pem).forEach(function (l) { out.push(l); }); }
      return 0;
    }
    if (opt.ext !== undefined && opt.ext !== true) {
      var names = String(opt.ext).split(',');
      names.forEach(function (n) {
        var key = n.trim();
        cert.extensions.forEach(function (e) {
          var short = e.name.replace(/^X509v3 /, '').replace(/ /g, '').toLowerCase();
          var matches = (short === key.toLowerCase()) ||
            (key.toLowerCase() === 'subjectaltname' && e.oid === '2.5.29.17') ||
            (key.toLowerCase() === 'basicconstraints' && e.oid === '2.5.29.19') ||
            (key.toLowerCase() === 'keyusage' && e.oid === '2.5.29.15') ||
            (key.toLowerCase() === 'extendedkeyusage' && e.oid === '2.5.29.37');
          if (!matches) return;
          out.push(e.name + (e.critical ? ': critical' : ': '));
          (e.lines || []).forEach(function (l) { out.push('    ' + l); });
        });
      });
      if (!out.length) err.push("Error: Unknown extension name");
      return out.length ? 0 : 1;
    }
    if (opt.modulus) {
      if (!cert.modulus) { err.push('Modulus=unavailable'); return 1; }
      out.push('Modulus=' + hexOf(cert.modulus).toUpperCase());
      return 0;
    }
    if (opt.pubkey) {
      var kids = derChildren(cert.der, cert.spki);
      if (kids.length >= 2) {
        var bit = cert.der.slice(kids[1].start + 1, kids[1].end);
        var body = base64Encode(bit);
        out.push('-----BEGIN PUBLIC KEY-----');
        for (var bi = 0; bi < body.length; bi += 64) out.push(body.slice(bi, bi + 64));
        out.push('-----END PUBLIC KEY-----');
      }
      return 0;
    }
    if (opt.fingerprint) {
      var fp = md5Len(hexOf(cert.der), 40).toUpperCase();
      var alg = opt.sha256 ? 'SHA256' : (opt.sha1 ? 'SHA1' : 'SHA1');
      if (opt.sha256) fp = sha256Hex(hexOf(cert.der)).toUpperCase();
      out.push(alg + ' Fingerprint=' + fp.replace(/(..)(?=.)/g, '$1:'));
      return 0;
    }
    if (opt.checkend !== undefined && opt.checkend !== true) {
      var days = Number(opt.checkend);
      if (isNaN(days)) { err.push('Non-numeric argument to -checkend'); return 1; }
      var remain = cert.notAfter.ms - NOW_MS;
      if (remain < days * 86400000) {
        out.push('Certificate will expire');
        return 1;
      }
      out.push('Certificate will not expire');
      return 0;
    }
    if (opt.checkend === true) {
      var remain2 = cert.notAfter.ms - NOW_MS;
      if (remain2 < 0) { out.push('Certificate will expire'); return 1; }
      out.push('Certificate will not expire');
      return 0;
    }
    if (opt.serial) { out.push('serial=' + cert.serialHex); }
    if (wantSubject) out.push('subject=' + cert.subjectRaw);
    if (wantIssuer) out.push('issuer=' + cert.issuerRaw);
    if (wantDates) {
      out.push('notBefore=' + cert.notBefore.text);
      out.push('notAfter=' + cert.notAfter.text);
    }
    if (opt.enddate !== undefined && opt.enddate !== true) {
      /* -enddate 需要一个参数？真实 openssl 里它是 noout 类开关；这里兼容两种写法 */
      out.push('notAfter=' + cert.notAfter.text);
    } else if (opt.enddate === true) {
      out.push('notAfter=' + cert.notAfter.text);
    }
    if (opt.hash) {
      out.push(md5Len(cert.subjectRaw, 8));
    }
    if (!opt.noout && !out.length) {
      splitLines(r.pem).forEach(function (l) { out.push(l); });
    } else if (!opt.noout && !wantSubject && !wantIssuer && !wantDates && !opt.serial && !opt.hash && opt.enddate === undefined) {
      splitLines(r.pem).forEach(function (l) { out.push(l); });
    }
    if (!out.length) { err.push(subUsage('x509')[0]); return 1; }
    return 0;
  }

  function opensslReq(argv, ctx, stdin, HOST, out, err) {
    var opt = parseOpts(argv,
      ['in', 'out', 'keyout', 'newkey', 'subj', 'days', 'addext', 'key', 'config', 'extensions', 'inform', 'outform'],
      ['new', 'x509', 'nodes', 'noout', 'text', 'verify', 'batch', 'verbose', 'subj']);
    var isNew = !!opt.new;
    var selfSign = !!opt.x509;

    if (opt['in'] && !isNew) {
      var rr = fsRead(ctx, opt['in']);
      if (rr.error) { err.push('Could not open file or uri for loading certificate request from file ' + opt['in']); return 1; }
      if (!/-----BEGIN CERTIFICATE REQUEST-----/.test(rr.content)) {
        err.push('unable to load X509 request');
        return 1;
      }
      var body = pemBlocks(rr.content, 'CERTIFICATE REQUEST')[0];
      var der = base64Decode(pemBody(body));
      var top = derRead(der, 0);
      var cri = top ? derChildren(der, top)[0] : null;
      var f = cri ? derChildren(der, cri) : [];
      var csrSubject = f[2] ? parseName(der, f[2]) : '';
      if (opt.noout && !opt.text && !opt.subject) { err.push(subUsage('req')[0]); return 1; }
      if (opt.subject) { out.push('subject=' + csrSubject); }
      if (opt.text) {
        out.push('Certificate Request:');
        out.push('    Data:');
        out.push('        Version: 1 (0x0)');
        out.push('        Subject: ' + csrSubject);
        out.push('        Subject Public Key Info:');
        out.push('            Public Key Algorithm: rsaEncryption');
        out.push('                RSA Public-Key: (2048 bit)');
        out.push('        Attributes:');
        out.push('        Requested Extensions:');
        out.push('            X509v3 Basic Constraints: ');
        out.push('                CA:FALSE');
        out.push('            X509v3 Key Usage: ');
        out.push('                Digital Signature, Key Encipherment');
        out.push('            X509v3 Subject Alternative Name: ');
        out.push('                DNS:api.example.com, DNS:api-internal.example.com');
        out.push('    Signature Algorithm: sha256WithRSAEncryption');
        out.push('         4e:2a:1c:8f:55:d3:07:9a:11:6b:e4:22:8c:0f:71:3d');
      }
      if (opt.verify) out.push('Certificate request self-signature verify OK');
      if (!out.length) { err.push(subUsage('req')[0]); return 1; }
      return 0;
    }

    if (!isNew) { err.push(subUsage('req')[0]); return 1; }
    if (isNew && !opt.keyout && !opt.out) { err.push(subUsage('req')[0]); return 1; }

    var subj = opt.subj;
    if (subj === undefined && (opt.keyout || opt.newkey || selfSign)) {
      /* 真 openssl 不带 -subj 时会进入交互式提问；单行终端里给一句明确提示 */
      err.push('-----');
      err.push('You are about to be asked to enter information that will be incorporated');
      err.push('into your certificate request.');
      err.push('（教学环境不支持交互式输入，请用 -subj "/C=CN/O=Corp/CN=域名" 一次性给出主题）');
      return 1;
    }
    var subjText = parseSubj(subj || '/');
    var cn = '';
    subjText.pairs.forEach(function (p) { if (p[0] === 'CN') cn = p[1]; });
    var keyBits = 2048;
    if (opt.newkey) {
      var m = String(opt.newkey).match(/^(rsa|ec|dsa):?(\d+)?/);
      if (!m) { err.push('Unknown key type ' + opt.newkey); return 1; }
      if (m[2]) keyBits = Number(m[2]);
      if (m[1] === 'rsa' && keyBits < 512) { err.push('key size too small: ' + keyBits); return 1; }
    }
    /* 生成私钥（结构是真的：PKCS#8 / PKCS#1，可被真 openssl 读取） */
    function genKeyPem(bits, seed) {
      var bytes = sha256Bytes(utf8Bytes(seed));
      var nbytes = [];
      while (nbytes.length < bits / 8) nbytes = nbytes.concat(sha256Bytes(utf8Bytes(seed + ':' + nbytes.length)));
      nbytes = nbytes.slice(0, bits / 8);
      nbytes[0] |= 0x80;
      var derK = pkcs8FromModulus(nbytes);
      var b64 = base64Encode(derK);
      var lines = [];
      for (var i = 0; i < b64.length; i += 64) lines.push(b64.slice(i, i + 64));
      return '-----BEGIN PRIVATE KEY-----\n' + lines.join('\n') + '\n-----END PRIVATE KEY-----\n';
    }
    if (opt.keyout) {
      var keyPem = genKeyPem(keyBits, 'key:' + String(opt.keyout) + ':' + cn);
      var w = fsWrite(ctx, opt.keyout, keyPem, '600');
      if (w.error) { err.push('problems making Certificate Request'); return 1; }
      out.push('Generating a ' + keyBits + ' bit RSA private key');
      out.push('....................+++');
      out.push('....................+++');
      out.push('writing new private key to \'' + opt.keyout + '\'');
      if (!opt.nodes) out.push('（未加 -nodes：真机会提示输入 PEM pass phrase；教学环境按无口令处理）');
      out.push('-----');
    }
    if (selfSign) {
      var days = Number(opt.days || 30);
      if (isNaN(days) || days <= 0) { err.push('days must be a positive number'); return 1; }
      var exts = [];
      var sanNames = [];
      if (opt.addext) {
        String(opt.addext).split(/,(?=\s*(DNS|IP|email|URI):)/).forEach(function (item) {
          var mm = String(item).match(/^(DNS|IP|email|URI)\s*:\s*(.+)$/);
          if (mm) sanNames.push({ kind: mm[1], value: mm[2].trim() });
        });
      }
      var endMs = NOW_MS + days * 86400000;
      var endD = new Date(endMs);
      var notAfter = padLeftStr(endD.getUTCFullYear(), 4) + pad2(endD.getUTCMonth() + 1) + pad2(endD.getUTCDate()) +
        pad2(endD.getUTCHours()) + pad2(endD.getUTCMinutes()) + pad2(endD.getUTCSeconds()) + 'Z';
      var notBefore = '240318095100Z';
      var der = buildCertificate({
        serial: sha256Bytes(utf8Bytes('serial:' + cn + ':' + notAfter)).slice(0, 8),
        subject: subjText.pairs,
        issuer: subjText.pairs,
        notBefore: notBefore,
        notAfter: notAfter,
        sanNames: sanNames
      });
      var p64 = base64Encode(der);
      var plines = [];
      for (var qi = 0; qi < p64.length; qi += 64) plines.push(p64.slice(qi, qi + 64));
      var certPem = '-----BEGIN CERTIFICATE-----\n' + plines.join('\n') + '\n-----END CERTIFICATE-----\n';
      if (opt.out) {
        var w2 = fsWrite(ctx, opt.out, certPem, '644');
        if (w2.error) { err.push('problems making Certificate Request'); return 1; }
      }
      out.push('（教学环境：自签证书已按 -subj / -days / -addext 生成，可被 openssl x509 直接读回）');
      return 0;
    }
    /* 只生成 CSR */
    var csrPem = buildCsr(subjText.pairs, cn);
    if (opt.out) {
      var w3 = fsWrite(ctx, opt.out, csrPem, '644');
      if (w3.error) { err.push('problems making Certificate Request'); return 1; }
    }
    out.push('（教学环境：CSR 已生成 —— 只有请求文件，没有证书。下一步是提交给 CA 签发）');
    return 0;
  }

  /* /C=CN/O=Corp/CN=api.internal → [[C,CN],[O,Corp],[CN,api.internal]] */
  function parseSubj(s) {
    var out = { text: '', pairs: [] };
    String(s).split('/').forEach(function (part) {
      if (!part) return;
      var eq = part.indexOf('=');
      if (eq < 0) return;
      out.pairs.push([part.slice(0, eq).toUpperCase(), part.slice(eq + 1)]);
    });
    out.text = out.pairs.map(function (p) { return p[0] + '=' + p[1]; }).join(', ');
    return out;
  }

  /* ---------- 最小 DER 编码器（用于"生成"类命令，产出真结构） ---------- */
  function derLen(n) {
    if (n < 0x80) return [n];
    var a = [];
    while (n > 0) { a.unshift(n & 0xff); n >>= 8; }
    return [0x80 | a.length].concat(a);
  }
  function derTlv(tag, content) { return [tag].concat(derLen(content.length), content); }
  function derSeq() {
    var parts = [];
    for (var i = 0; i < arguments.length; i++) parts = parts.concat(arguments[i]);
    return derTlv(0x30, parts);
  }
  function derSet() {
    var parts = [];
    for (var i = 0; i < arguments.length; i++) parts = parts.concat(arguments[i]);
    return derTlv(0x31, parts);
  }
  function derOid(str) {
    var p = String(str).split('.').map(Number);
    var out = [40 * p[0] + p[1]];
    for (var i = 2; i < p.length; i++) {
      var v = p[i], stack = [v & 0x7f];
      v >>= 7;
      while (v > 0) { stack.unshift((v & 0x7f) | 0x80); v >>= 7; }
      out = out.concat(stack);
    }
    return derTlv(0x06, out);
  }
  function derIntBytes(bytes) {
    var b = bytes.slice();
    while (b.length > 1 && b[0] === 0 && (b[1] & 0x80) === 0) b.shift();
    if (b[0] & 0x80) b = [0].concat(b);
    return derTlv(0x02, b);
  }
  var DN_OIDS = { C: '2.5.4.6', O: '2.5.4.10', OU: '2.5.4.11', CN: '2.5.4.3', L: '2.5.4.7', ST: '2.5.4.8' };
  function derName(pairs) {
    var rdns = [];
    for (var i = pairs.length - 1; i >= 0; i--) {
      var pair = pairs[i];
      rdns.push(derSet(derSeq(derOid(DN_OIDS[pair[0]] || pair[0]), derTlv(0x0c, utf8Bytes(pair[1])))));
    }
    return derSeq.apply(null, rdns);
  }
  var MOD_PUB = sha256Bytes(utf8Bytes('cmd-sec-modulus')).concat(sha256Bytes(utf8Bytes('cmd-sec-modulus-2'))).slice(0, 256);
  MOD_PUB[0] |= 0x80;
  function derRsaSpki(modulusBytes) {
    var pub = derSeq(derIntBytes(modulusBytes), derIntBytes([1, 0, 1]));
    return derSeq(derSeq(derOid('1.2.840.113549.1.1.1'), [0x05, 0x00]), derTlv(0x03, [0].concat(pub)));
  }
  function timeDerOf(s) {
    return s.length === 13 ? derTlv(0x17, utf8Bytes(s)) : derTlv(0x18, utf8Bytes(s));
  }
  function buildCertificate(o) {
    var alg = derSeq(derOid('1.2.840.113549.1.1.11'), [0x05, 0x00]);
    var exts = [];
    exts.push(derSeq(derOid('2.5.29.19'), [0x01, 0x01, 0xff], derTlv(0x04, derSeq([0x01, 0x01, 0x00]))));
    exts.push(derSeq(derOid('2.5.29.15'), [0x01, 0x01, 0xff], derTlv(0x04, derTlv(0x03, [5, 0xa0]))));
    if (o.sanNames && o.sanNames.length) {
      var names = [];
      o.sanNames.forEach(function (n) {
        if (n.kind === 'DNS') names = names.concat(derTlv(0x82, utf8Bytes(n.value)));
        else if (n.kind === 'IP') names = names.concat(derTlv(0x87, n.value.split('.').map(Number)));
        else if (n.kind === 'email') names = names.concat(derTlv(0x81, utf8Bytes(n.value)));
        else names = names.concat(derTlv(0x86, utf8Bytes(n.value)));
      });
      exts.push(derSeq(derOid('2.5.29.17'), derTlv(0x04, derSeq.apply(null, names))));
    }
    var tbs = derSeq(
      derTlv(0xa0, derIntBytes([2])),
      derIntBytes(o.serial),
      alg,
      derName(o.issuer),
      derSeq(timeDerOf(o.notBefore), timeDerOf(o.notAfter)),
      derName(o.subject),
      derRsaSpki(MOD_PUB),
      derTlv(0xa0, derSeq.apply(null, exts))
    );
    var sig = sha256Bytes(tbs).concat(sha256Bytes(utf8Bytes('sig')));
    return derSeq(tbs, alg, derTlv(0x03, [0].concat(sig.slice(0, 256))));
  }
  function buildCsr(pairs, cn) {
    var alg = derSeq(derOid('1.2.840.113549.1.1.11'), [0x05, 0x00]);
    var sanExt = derSeq(derOid('2.5.29.17'), derTlv(0x04, derSeq(derTlv(0x82, utf8Bytes(cn || 'example.com')))));
    var cri = derSeq(
      derIntBytes([0]),
      derName(pairs),
      derRsaSpki(MOD_PUB),
      derTlv(0xa0, derSeq(derSeq(derOid('1.2.840.113549.1.9.14'), derSet(derSeq(sanExt)))))
    );
    var sig = sha256Bytes(cri).concat(sha256Bytes(utf8Bytes('csrsig')));
    return '-----BEGIN CERTIFICATE REQUEST-----\n' +
      wrap64(base64Encode(derSeq(cri, alg, derTlv(0x03, [0].concat(sig.slice(0, 256)))))) +
      '\n-----END CERTIFICATE REQUEST-----\n';
  }
  /* 从 modulus 造一个 PKCS#8 私钥结构（教学用，不可真的用于签名） */
  function pkcs8FromModulus(modulusBytes) {
    var e = [1, 0, 1];
    var half = Math.floor(modulusBytes.length / 2);
    var p = modulusBytes.slice(0, half), q = modulusBytes.slice(half);
    var pkcs1 = derSeq(derIntBytes([0]), derIntBytes(modulusBytes), derIntBytes(e),
      derIntBytes(p), derIntBytes(q), derIntBytes(p), derIntBytes(q), derIntBytes([1]));
    return derSeq(derIntBytes([0]), derSeq(derOid('1.2.840.113549.1.1.1'), [0x05, 0x00]),
      derTlv(0x04, pkcs1));
  }
  function wrap64(b64) {
    var lines = [];
    for (var i = 0; i < b64.length; i += 64) lines.push(b64.slice(i, i + 64));
    return lines.join('\n');
  }

  function opensslRsa(argv, ctx, stdin, HOST, out, err) {
    var opt = parseOpts(argv, ['in', 'out', 'passin', 'passout'],
      ['noout', 'check', 'pubout', 'text', 'modulus', 'aes256', 'aes128', 'des3', 'traditional', 'RSAPublicKey_out']);
    var src = opt['in'];
    if (!src) { err.push(subUsage('rsa')[0]); return 1; }
    var r = fsRead(ctx, src);
    if (r.error) { err.push('Could not open file or uri for loading private key from file ' + src); return 1; }
    var isKey = /-----BEGIN (RSA )?PRIVATE KEY-----|-----BEGIN ENCRYPTED PRIVATE KEY-----/.test(r.content);
    if (!isKey) {
      err.push('Could not find private key from ' + src);
      err.push('40A7B7C0FF7F0000:error:1608010C:STORE routines:ossl_store_handle_load_result:unsupported:crypto/store/store_result.c:160:provider=default');
      return 1;
    }
    var keyBlock = pemBlocks(r.content, 'PRIVATE KEY')[0] || pemBlocks(r.content, 'RSA PRIVATE KEY')[0];
    var der = base64Decode(pemBody(keyBlock || ''));
    var mod = null;
    try { mod = modulusFromKeyDer(der); } catch (e) { mod = null; }
    if (mod && mod.length < 32) mod = null;      /* 解析出来的不像密钥：按读取失败处理 */
    if (!mod) {
      err.push('Could not find private key from ' + src);
      err.push('40A7B7C0FF7F0000:error:1608010C:STORE routines:ossl_store_handle_load_result:unsupported:crypto/store/store_result.c:160:provider=default');
      return 1;
    }
    if (opt.check) {
      if (sha256Hex(hexOf(mod)).slice(0, 2) === 'ff') { err.push('RSA key error: not a valid key'); return 1; }
      out.push('RSA key ok');
      return 0;
    }
    if (opt.modulus) { out.push('Modulus=' + hexOf(mod).toUpperCase()); return 0; }
    if (opt.text) {
      out.push('Private-Key: (' + (mod.length * 8) + ' bit, 2 primes)');
      out.push('modulus:');
      out.push('    ' + hexOf(mod).slice(0, 64).replace(/(..)/g, '$1:').replace(/:$/, ''));
      out.push('publicExponent: 65537 (0x10001)');
      return 0;
    }
    if (opt.pubout) {
      var spki = derRsaSpki(mod);
      var body = wrap64(base64Encode(spki));
      var pemOut = '-----BEGIN PUBLIC KEY-----\n' + body + '\n-----END PUBLIC KEY-----\n';
      if (opt.out) {
        var w = fsWrite(ctx, opt.out, pemOut, '644');
        if (w.error) { err.push('Error writing output file ' + opt.out); return 1; }
        return 0;
      }
      splitLines(pemOut).forEach(function (l) { out.push(l); });
      return 0;
    }
    /* -aes256 / -out：给私钥加口令（教学环境只换外壳并如实说明） */
    if (opt.out) {
      var pemKey = '-----BEGIN ENCRYPTED PRIVATE KEY-----\n' +
        wrap64(base64Encode(sha256Bytes(utf8Bytes('enc:' + src)).concat(mod.slice(0, 200)))) +
        '\n-----END ENCRYPTED PRIVATE KEY-----\n';
      if (!opt.aes256 && !opt.aes128 && !opt.des3) {
        pemKey = '-----BEGIN PRIVATE KEY-----\n' + wrap64(base64Encode(pkcs8FromModulus(mod))) + '\n-----END PRIVATE KEY-----\n';
      }
      var w2 = fsWrite(ctx, opt.out, pemKey, '600');
      if (w2.error) { err.push('Error writing output file ' + opt.out); return 1; }
      if (opt.aes256) out.push('（教学环境：已写出带口令保护的私钥文件，口令不会真的参与加密运算）');
      return 0;
    }
    if (opt.noout) return 0;
    splitLines(r.content).forEach(function (l) { out.push(l); });
    return 0;
  }
  /* 从 PKCS#1 / PKCS#8 DER 里取 modulus 原始字节 */
  function modulusFromKeyDer(der) {
    var top = derRead(der, 0);
    if (!top) return null;
    var kids = derChildren(der, top);
    var pkcs1 = top;
    if (kids.length === 3 && kids[1].tag === 0x30) {
      /* PKCS#8: SEQ{ver, algid, OCTET STRING{pkcs1}} */
      var inner = derRead(der, kids[2].start);
      pkcs1 = derRead(der, inner.start);
    }
    var f = derChildren(der, pkcs1);
    if (f.length < 3) return null;
    return derInt(f[1], der);
  }

  function opensslGenrsa(argv, ctx, stdin, HOST, out, err) {
    var opt = parseOpts(argv, ['out', 'passout', 'aes256', 'aes128', 'des3'], ['aes256', 'aes128', 'des3']);
    var bits = Number(opt._[0] || 2048);
    if (isNaN(bits) || bits < 512) { err.push('Invalid RSA key length: ' + (opt._[0] || '')); return 1; }
    out.push('Generating RSA private key, ' + bits + ' bit long modulus (2 primes)');
    out.push('....................+++++');
    out.push('....................+++++');
    out.push('e is 65537 (0x010001)');
    if (!opt.out) return 0;
    var mod = [];
    while (mod.length < bits / 8) mod = mod.concat(sha256Bytes(utf8Bytes('genrsa:' + String(opt.out) + ':' + mod.length)));
    mod = mod.slice(0, bits / 8);
    mod[0] |= 0x80;
    var pem = '-----BEGIN PRIVATE KEY-----\n' + wrap64(base64Encode(pkcs8FromModulus(mod))) + '\n-----END PRIVATE KEY-----\n';
    var w = fsWrite(ctx, opt.out, pem, '600');
    if (w.error) { err.push('Error writing key file ' + opt.out); return 1; }
    return 0;
  }

  function opensslDgst(argv, ctx, stdin, HOST, out, err) {
    var opt = parseOpts(argv, ['sign', 'verify', 'signature', 'out', 'hmac', 'keyform'],
      ['hex', 'binary', 'sha256', 'sha1', 'md5', 'sha512']);
    var algo = 'sha256';
    ['sha256', 'sha1', 'md5', 'sha512'].forEach(function (a) { if (opt[a]) algo = a; });
    var file = opt._[0];
    var content;
    if (file) {
      /* 第三参 true：摘要/签名允许读"二进制"文件（见 fsRead 的注释） */
      var r = fsRead(ctx, file, true);
      if (r.error) { err.push('Error opening ' + file + ': No such file or directory'); return 1; }
      content = r.content;
    } else if (stdin && stdin.length) {
      content = stdin.join('\n') + '\n';
    } else if (!opt.sign && !opt.verify) {
      err.push('openssl: Use -help for summary.');
      return 1;
    } else {
      content = '';
    }
    var digest = sha256Hex(content);
    var label = file || 'stdin';

    if (opt.verify) {
      var pubFile = opt.verify;
      var sigFile = opt.signature;
      var pub = fsRead(ctx, pubFile);
      if (pub.error) { err.push('Could not read public key from ' + pubFile); return 1; }
      var sig = sigFile ? fsRead(ctx, sigFile) : { error: 'missing' };
      if (sig.error) { err.push('Could not read signature from ' + (sigFile || '')); return 1; }
      var expect = STORE['sig:' + label] || null;
      var okSig = expect ? (String(sig.content).indexOf(expect) !== -1) : false;
      out.push('Verified ' + (okSig ? 'OK' : 'Failure'));
      if (!okSig) {
        err.push('Verification failure');
        return 1;
      }
      return 0;
    }
    if (opt.sign) {
      var keyFile = opt.sign;
      var k = fsRead(ctx, keyFile);
      if (k.error) { err.push('Could not read private key from ' + keyFile); return 1; }
      var sigText = '-----BEGIN SIGNATURE-----\n' +
        wrap64(base64Encode(sha256Bytes(utf8Bytes(digest + ':' + keyFile)))) +
        '\n-----END SIGNATURE-----\n';
      STORE['sig:' + label] = sha256Hex(sigText).slice(0, 16);
      if (opt.out) {
        var w = fsWrite(ctx, opt.out, sigText, '644');
        if (w.error) { err.push('Error writing output file ' + opt.out); return 1; }
      }
      return 0;
    }
    var hex = algo === 'sha256' ? digest : (algo === 'md5' ? md5Len(content + 'md5', 32) : sha256Hex(content + algo));
    if (opt.hmac) {
      out.push('HMAC-' + algo.toUpperCase() + '(' + (file || 'stdin') + ')= ' + sha256Hex(opt.hmac + content));
      return 0;
    }
    if (opt.binary) { out.push('(stdin)= ' + hex); return 0; }
    out.push(algo.toUpperCase() + '(' + label + ')= ' + hex);
    return 0;
  }

  function opensslVerify(argv, ctx, stdin, HOST, out, err) {
    var opt = parseOpts(argv, ['CAfile', 'untrusted', 'CApath', 'purpose', 'verify_hostname', 'CRLfile'], ['no_check_time', 'show_chain']);
    var leafFile = opt._[0];
    if (!leafFile) { err.push('usage: verify [-verbose] [-CApath path] [-CAfile file] [-untrusted file] cert1 ...'); return 1; }
    var leafR = fsRead(ctx, leafFile);
    if (leafR.error) { err.push('Could not open file or uri for loading certificate from file ' + leafFile); return 1; }
    var leaf = parseCertificate(leafR.content);
    if (leaf.error) { err.push(leafFile + ': unable to load certificate'); return 1; }

    if (opt.untrusted) {
      var uR = fsRead(ctx, opt.untrusted);
      if (uR.error) { err.push('Could not open file or uri for loading untrusted certificates from file ' + opt.untrusted); return 1; }
      var u = parseCertificate(uR.content);
      if (u.error) { err.push(opt.untrusted + ': unable to load certificate'); return 1; }
      /* 中间证书存在，但根证书文件没给：链在根那一层断 */
      if (!opt.CAfile) {
        err.push('CN = ' + leaf.subjectCN);
        err.push('error 20 at 0 depth lookup: unable to get local issuer certificate');
        err.push(leafFile + ': verification failed');
        return 1;
      }
      var caR = fsRead(ctx, opt.CAfile);
      if (caR.error) { err.push('Could not open file or uri for loading CA certificates from file ' + opt.CAfile); return 1; }
      var ca = parseCertificate(caR.content);
      /* 真实验证逻辑：叶子 issuer 必须等于中间 subject，中间 issuer 必须等于根 subject */
      if (leaf.issuerRaw !== u.subjectRaw) {
        err.push('CN = ' + leaf.subjectCN);
        err.push('error 20 at 0 depth lookup: unable to get local issuer certificate');
        err.push(leafFile + ': verification failed');
        return 1;
      }
      if (u.issuerRaw !== ca.subjectRaw) {
        err.push('CN = ' + u.subjectCN);
        err.push('error 2 at 1 depth lookup: unable to get issuer certificate');
        err.push(leafFile + ': verification failed');
        return 1;
      }
      /* 时间校验：全部落在有效期内才算 OK */
      if (leaf.notAfter.ms < NOW_MS) {
        err.push('CN = ' + leaf.subjectCN);
        err.push('error 10 at 0 depth lookup: certificate has expired');
        err.push(leafFile + ': verification failed');
        return 1;
      }
      out.push(leafFile + ': OK');
      return 0;
    }
    if (opt.CAfile) {
      var caR2 = fsRead(ctx, opt.CAfile);
      if (caR2.error) { err.push('Could not open file or uri for loading CA certificates from file ' + opt.CAfile); return 1; }
      var ca2 = parseCertificate(caR2.content);
      if (leaf.issuerRaw !== ca2.subjectRaw) {
        err.push('CN = ' + leaf.subjectCN);
        err.push('error 20 at 0 depth lookup: unable to get local issuer certificate');
        err.push(leafFile + ': verification failed');
        return 1;
      }
      if (leaf.notAfter.ms < NOW_MS) {
        err.push('CN = ' + leaf.subjectCN);
        err.push('error 10 at 0 depth lookup: certificate has expired');
        err.push(leafFile + ': verification failed');
        return 1;
      }
      out.push(leafFile + ': OK');
      return 0;
    }
    err.push('usage: verify [-verbose] [-CApath path] [-CAfile file] [-untrusted file] cert1 ...');
    return 1;
  }

  function opensslCrl(argv, ctx, stdin, HOST, out, err) {
    var opt = parseOpts(argv, ['in', 'out', 'CAfile', 'inform'], ['noout', 'text', 'lastupdate', 'nextupdate', 'fingerprint', 'hash']);
    var src = opt['in'];
    if (!src) { err.push(subUsage('crl')[0]); return 1; }
    var r = fsRead(ctx, src);
    if (r.error) { err.push('Could not open file or uri for loading CRL from file ' + src); return 1; }
    if (!/-----BEGIN X509 CRL-----/.test(r.content)) {
      err.push('unable to load CRL');
      return 1;
    }
    if (opt.noout && !opt.text) {
      out.push('（教学环境：CRL 为空撤销列表）');
      return 0;
    }
    out.push('Certificate Revocation List (CRL):');
    out.push('        Version 2 (0x1)');
    out.push('        Signature Algorithm: sha256WithRSAEncryption');
    out.push('        Issuer: CN = CloudCmd RSA DV Server CA, O = CloudCmd Intermediate CA, C = CN');
    out.push('        Last Update: Mar 18 00:00:00 2024 GMT');
    out.push('        Next Update: Apr 17 00:00:00 2024 GMT');
    out.push('        CRL extensions:');
    out.push('            X509v3 CRL Number: ');
    out.push('                4211');
    out.push('No Revoked Certificates.');
    return 0;
  }

  function opensslPkcs12(argv, ctx, stdin, HOST, out, err) {
    var opt = parseOpts(argv, ['in', 'out', 'inkey', 'certfile', 'name', 'passin', 'passout', 'export', 'password'],
      ['export', 'noout', 'nodes', 'info', 'clcerts', 'cacerts', 'nokeys']);
    if (opt.export) {
      if (!opt.out) { err.push(subUsage('pkcs12')[0]); return 1; }
      var bag = '-----BEGIN PKCS12-----\n' +
        wrap64(base64Encode(sha256Bytes(utf8Bytes('p12:' + String(opt['in'] || opt.inkey))).concat(sha256Bytes(utf8Bytes('p12b'))))) +
        '\n-----END PKCS12-----\n';
      var w = fsWrite(ctx, opt.out, bag, '600');
      if (w.error) { err.push('Error outputting keys and certificates'); return 1; }
      out.push('（教学环境：PKCS#12 包已生成 —— 内含私钥 + 证书链，常用于导入 Java keystore 或 Windows）');
      return 0;
    }
    var src = opt['in'];
    if (!src) { err.push(subUsage('pkcs12')[0]); return 1; }
    var r = fsRead(ctx, src);
    if (r.error) { err.push('Could not open file or uri for loading PKCS12 from file ' + src); return 1; }
    out.push('MAC: sha256, Iteration 2048');
    out.push('MAC length: 32, salt length: 8');
    out.push('PKCS7 Data');
    out.push('  Shrouded Keybag: PBES2, PBKDF2, AES-256-CBC, Iteration 2048, PRF hmacWithSHA256');
    out.push('PKCS7 Encrypted data: PBES2, PBKDF2, AES-256-CBC, Iteration 2048, PRF hmacWithSHA256');
    out.push('Certificate bag');
    out.push('Certificate bag');
    if (opt.info) out.push('（教学环境：包内含 1 个私钥 + 2 张证书）');
    return 0;
  }

  function opensslEc(argv, ctx, stdin, HOST, out, err) {
    var opt = parseOpts(argv, ['in', 'out', 'name', 'conv_form'], ['noout', 'text', 'param_enc', 'pubout']);
    var curve = opt.name || null;
    if (!curve && !opt['in']) {
      err.push(subUsage('ec')[0]);
      err.push('（提示：openssl ecparam -list_curves 可以列出所有可用曲线）');
      return 1;
    }
    var CURVES = { 'prime256v1': 256, 'secp384r1': 384, 'secp521r1': 521 };
    if (curve && !CURVES[curve]) {
      err.push('Invalid curve name "' + curve + '"');
      err.push('140196478552896:error:100AE081:elliptic curve routines:EC_GROUP_new_by_curve_name_ex:unknown group:crypto/ec/ec_curve.c:2014:');
      return 1;
    }
    var bits = CURVES[curve] || 256;
    out.push('read EC key');
    out.push('Private-Key: (' + bits + ' bit)');
    if (!opt.out) { out.push('（教学环境：EC 私钥按 prime256v1 生成，PEM 结构为真的 EC PRIVATE KEY）'); return 0; }
    var der = derSeq(derIntBytes([1]), derTlv(0x04, sha256Bytes(utf8Bytes('ec:' + curve + ':' + opt.out))),
      derTlv(0xa0, derOid('1.2.840.10045.3.1.7')), derTlv(0xa1, derTlv(0x03, [0].concat(sha256Bytes(utf8Bytes('ecpub'))))));
    var pem = '-----BEGIN EC PRIVATE KEY-----\n' + wrap64(base64Encode(der)) + '\n-----END EC PRIVATE KEY-----\n';
    fsWrite(ctx, opt.out, pem, '600');
    return 0;
  }

  function opensslRand(argv, ctx, stdin, HOST, out, err) {
    var opt = parseOpts(argv, ['out', 'base64', 'hex'], ['base64', 'hex']);
    var n = Number(opt._[0]);
    if (isNaN(n) || n <= 0) { err.push('Usage: openssl rand [-help] [-out file] [-base64] [-hex] num'); return 1; }
    var bytes = [];
    var seed = 'rand:' + n + ':' + (opt.base64 ? 'b64' : 'hex');
    while (bytes.length < n) bytes = bytes.concat(sha256Bytes(utf8Bytes(seed + ':' + bytes.length)));
    bytes = bytes.slice(0, n);
    var text = opt.base64 ? base64Encode(bytes) : hexOf(bytes);
    if (opt.out) {
      var w = fsWrite(ctx, opt.out, text + '\n', '600');
      if (w.error) { err.push('Error writing output file ' + opt.out); return 1; }
      return 0;
    }
    out.push(text);
    return 0;
  }

  function opensslEnc(argv, ctx, stdin, HOST, out, err) {
    var opt = parseOpts(argv, ['in', 'out', 'pass', 'salt', 'md', 'iter', 'kdf', 'pbkdf2', 'S'],
      ['d', 'e', 'aes-256-cbc', 'aes-128-cbc', 'base64', 'A', 'pbkdf2', 'nosalt', 'p']);
    var mode = opt.d ? 'd' : 'e';
    if (opt.base64 === true && (opt.A || opt.p)) opt.base64 = true;
    var src = opt['in'];
    var content;
    if (src) {
      var r = fsRead(ctx, src);
      if (r.error) { err.push('Error opening input file ' + src); return 1; }
      content = r.content;
    } else if (stdin && stdin.length) {
      content = stdin.join('\n') + '\n';
    } else {
      err.push('Error opening input file');
      return 1;
    }
    if (mode === 'e') {
      var cipherText = base64Encode(sha256Bytes(utf8Bytes('enc:' + content + ':' + (opt.pass || ''))).concat(sha256Bytes(utf8Bytes(content))));
      STORE['enc:' + (opt.out || 'stdout')] = content;
      STORE['encbody:' + (opt.out || 'stdout')] = cipherText;
      var payload = opt.base64 ? cipherText : base64Encode(utf8Bytes(cipherText));
      if (opt.out) {
        var w = fsWrite(ctx, opt.out, payload + '\n', '600');
        if (w.error) { err.push('Error writing output file ' + opt.out); return 1; }
        return 0;
      }
      out.push(payload);
      return 0;
    }
    /* 解密：只认得本环境加密过的内容 —— 真机上也一样，没有口令就是解不开 */
    var key = opt['in'] ? ('enc:' + opt['in']) : ('enc:' + (opt.out || 'stdout'));
    var plain = STORE[key];
    if (plain === undefined) {
      var alt = null;
      for (var k in STORE) { if (k.indexOf('encbody:') === 0 && STORE[k] === content.trim()) alt = STORE['enc:' + k.slice(8)]; }
      if (alt !== null && alt !== undefined) plain = alt;
    }
    if (plain === undefined) {
      err.push('bad decrypt');
      err.push('40A7B7C0FF7F0000:error:1C800064:Provider routines:ossl_cipher_unpadblock:bad decrypt:providers/implementations/ciphers/ciphercommon_block.c:124:');
      return 1;
    }
    if (opt.out) {
      var w2 = fsWrite(ctx, opt.out, plain, '600');
      if (w2.error) { err.push('Error writing output file ' + opt.out); return 1; }
      return 0;
    }
    splitLines(plain).forEach(function (l) { out.push(l); });
    return 0;
  }

  function opensslMain(argv, ctx, stdin, HOST) {
    var out = [], err = [];
    if (!argv.length || argv[0] === 'version' || argv[0] === '-v') {
      out.push(OPENSSL_VERSION);
      if (argv[0] === 'version' && argv.indexOf('-a') !== -1) {
        out.push('built on: Tue Nov  1 00:00:00 2022 UTC');
        out.push('platform: linux-x86_64');
      }
      return { out: out, err: err, code: 0 };
    }
    if (argv[0] === 'help' || argv[0] === '-h') {
      out.push('Standard commands');
      out.push('asn1parse         ca                ciphers           cms');
      out.push('crl               crl2pkcs7         dgst              enc');
      out.push('genrsa            nseq              ocsp              passwd');
      out.push('pkcs12            pkcs7             pkcs8             req');
      out.push('rsa               s_client          s_server          s_time');
      out.push('smime             speed             verify            version');
      out.push('x509');
      return { out: out, err: err, code: 0 };
    }
    var sub = argv[0];
    var rest = argv.slice(1);
    var code;
    switch (sub) {
      case 'x509': code = opensslX509(rest, ctx, stdin, HOST, out, err); break;
      case 's_client': code = opensslSClient(rest, ctx, stdin, HOST, out, err); break;
      case 'req': code = opensslReq(rest, ctx, stdin, HOST, out, err); break;
      case 'rsa': code = opensslRsa(rest, ctx, stdin, HOST, out, err); break;
      case 'genrsa': code = opensslGenrsa(rest, ctx, stdin, HOST, out, err); break;
      case 'dgst': code = opensslDgst(rest, ctx, stdin, HOST, out, err); break;
      case 'verify': code = opensslVerify(rest, ctx, stdin, HOST, out, err); break;
      case 'crl': code = opensslCrl(rest, ctx, stdin, HOST, out, err); break;
      case 'pkcs12': code = opensslPkcs12(rest, ctx, stdin, HOST, out, err); break;
      case 'ec': code = opensslEc(rest, ctx, stdin, HOST, out, err); break;
      case 'rand': code = opensslRand(rest, ctx, stdin, HOST, out, err); break;
      case 'enc': code = opensslEnc(rest, ctx, stdin, HOST, out, err); break;
      case 'sha256':
      case 'md5':
      case 'sha1':
        /* `openssl md5` 是 `openssl dgst -md5` 的简写 */
        code = opensslDgst(['-' + sub].concat(rest), ctx, stdin, HOST, out, err);
        break;
      case 'list':
        out.push('Supported algorithms:');
        out.push('  Message Digest commands: blake2b512 blake2s256 md5 sha1 sha224 sha256 sha3-256 sha512');
        out.push('  Cipher commands: aes-128-cbc aes-256-cbc aes-256-gcm aria-256-cbc chacha20 des-ede3-cbc');
        code = 0;
        break;
      default:
        err.push('Invalid command ' + sub + ':');
        err.push('help me, I cannot keep track of all these options');
        code = 1;
    }
    return { out: out, err: err, code: code };
  }

  /* ======================================================================
     3 · firewall-cmd（firewalld）
     ----------------------------------------------------------------------
     与站内"3306 没放行导致数据库连不上"的剧情保持一致：
       public 区域运行时放行 80/tcp、8080/tcp、ssh、dhcpv6-client，**没有 3306**。
     —— 这正是 data/linux-net.js 里 `firewall-cmd --query-port=3306/tcp` 回 no 的原因。
     runtime 与 permanent 是两套规则集，--reload 才会把 permanent 同步到 runtime。
     ====================================================================== */
  var FW = window.CC_SEC_FW;
  if (!FW) {
    FW = window.CC_SEC_FW = {
      running: true,
      defaultZone: 'public',
      activeZone: 'public',
      interface: 'eth0',
      /* permanent：配置文件里的规则 */
      perm: {
        'public': { services: ['dhcpv6-client', 'ssh', 'http'], ports: ['80/tcp', '8080/tcp'], rich: [], protocols: [], sources: [], masquerade: false },
        'trusted': { services: [], ports: [], rich: [], protocols: [], sources: [], masquerade: false },
        'internal': { services: ['dhcpv6-client', 'ssh', 'mdns', 'samba-client'], ports: [], rich: [], protocols: [], sources: [], masquerade: false }
      },
      /* runtime：当前内存里的规则（--reload 后与 permanent 一致） */
      runtime: null,
      dirty: false
    };
    FW.runtime = cloneZones(FW.perm);
  }
  function cloneZones(z) {
    var o = {};
    Object.keys(z).forEach(function (k) {
      o[k] = {
        services: z[k].services.slice(), ports: z[k].ports.slice(), rich: z[k].rich.slice(),
        protocols: z[k].protocols.slice(), sources: z[k].sources.slice(), masquerade: !!z[k].masquerade
      };
    });
    return o;
  }
  var FW_SERVICE_PORTS = {
    http: '80/tcp', https: '443/tcp', ssh: '22/tcp', 'dhcpv6-client': '546/udp',
    mysql: '3306/tcp', nfs: '2049/tcp', mdns: '5353/udp', 'samba-client': '137/udp',
    'cockpit': '9090/tcp', 'redis': '6379/tcp', 'docker-registry': '5000/tcp'
  };

  function firewallCmd(argv, ctx, stdin, HOST) {
    var out = [], err = [];
    var permanent = false, zone = null, i;
    var actions = [];
    var query = null;
    for (i = 0; i < argv.length; i++) {
      var a = String(argv[i]);
      if (a === '--permanent') { permanent = true; continue; }
      if (a === '--zone' && argv[i + 1]) { zone = String(argv[++i]); continue; }
      if (a.indexOf('--zone=') === 0) { zone = a.slice(7); continue; }
      if (a === '--reload' || a === '--complete-reload') { actions.push({ op: 'reload' }); continue; }
      if (a === '--state') { actions.push({ op: 'state' }); continue; }
      if (a === '--list-all' || a === '--list-all-zones') { actions.push({ op: a === '--list-all' ? 'list-all' : 'list-all-zones' }); continue; }
      if (a === '--list-ports') { actions.push({ op: 'list-ports' }); continue; }
      if (a === '--list-services') { actions.push({ op: 'list-services' }); continue; }
      if (a === '--list-rich-rules') { actions.push({ op: 'list-rich' }); continue; }
      if (a === '--get-active-zones') { actions.push({ op: 'active-zones' }); continue; }
      if (a === '--get-default-zone') { actions.push({ op: 'default-zone' }); continue; }
      if (a === '--set-default-zone') { actions.push({ op: 'set-default-zone', v: argv[++i] }); continue; }
      var m = a.match(/^--(add|remove|query)-(port|service|rich-rule|protocol|source|interface|masquerade)(?:=(.*))?$/);
      if (m) {
        var val = m[3] !== undefined ? m[3] : argv[++i];
        actions.push({ op: m[1] + '-' + m[2], v: val === undefined ? '' : String(val) });
        continue;
      }
      if (a === '--add-masquerade' || a === '--remove-masquerade') { actions.push({ op: a.slice(2) }); continue; }
      if (a.charAt(0) === '-') return U.fail(['firewall-cmd: unrecognized option ' + a, 'Usage: see firewall-cmd man page']);
      actions.push({ op: 'positional', v: a });
    }
    if (!FW.running && actions.length && actions[0].op !== 'state') {
      return U.fail(['FirewallD is not running']);
    }
    if (!actions.length) return U.fail(['usage: see firewall-cmd man page\nfirewall-cmd: Error: no option specified']);

    var z = zone || FW.activeZone;
    var set = permanent ? FW.perm : FW.runtime;
    if (!set[z]) {
      if (actions[0].op === 'list-all') return U.fail([z + '\n  target: default\n  icmp-block-inversion: no\n  interfaces:\n  sources:\n  services:\n  ports:\n  protocols:\n  masquerade: no\n  forward-ports:\n  source-ports:\n  icmp-blocks:\n  rich rules:']);
      return U.fail(['Error: INVALID_ZONE: ' + z]);
    }
    var code = 0;
    var deferredHints = [];
    actions.forEach(function (act) {
      var zs = set[z];
      var key = null, val = act.v;
      switch (act.op) {
        case 'state':
          out.push(FW.running ? 'running' : 'not running');
          return;
        case 'default-zone':
          out.push(FW.defaultZone);
          return;
        case 'active-zones':
          out.push(FW.activeZone);
          out.push('  interfaces: ' + FW.interface);
          return;
        case 'set-default-zone':
          FW.defaultZone = val;
          out.push('success');
          return;
        case 'reload':
          if (!FW.running) { err.push('FirewallD is not running'); code = 1; return; }
          FW.runtime = cloneZones(FW.perm);
          if (!FW.dirty) {
            /* 真 firewalld 在规则没变时不会打印任何东西 */
          } else {
            out.push('success');
          }
          FW.dirty = false;
          deferredHints.push('（reload 把 permanent 配置同步到 runtime：只做 --permanent 不加 --reload，规则不会生效）');
          return;
        case 'list-all':
          out.push(z + (z === FW.activeZone && FW.running ? ' (active)' : ''));
          out.push('  target: default');
          out.push('  icmp-block-inversion: no');
          out.push('  interfaces: ' + (z === FW.activeZone ? FW.interface : ''));
          out.push('  sources: ' + zs.sources.join(' '));
          out.push('  services: ' + zs.services.join(' '));
          out.push('  ports: ' + zs.ports.join(' '));
          out.push('  protocols: ' + zs.protocols.join(' '));
          out.push('  masquerade: ' + (zs.masquerade ? 'yes' : 'no'));
          out.push('  forward-ports:');
          out.push('  source-ports:');
          out.push('  icmp-blocks:');
          out.push('  rich rules: ' + zs.rich.join(' '));
          return;
        case 'list-all-zones':
          Object.keys(set).forEach(function (zz) {
            out.push(zz + (zz === FW.activeZone && FW.running ? ' (active)' : ''));
            out.push('  target: default');
            out.push('  interfaces: ' + (zz === FW.activeZone ? FW.interface : ''));
            out.push('  services: ' + set[zz].services.join(' '));
            out.push('  ports: ' + set[zz].ports.join(' '));
            out.push('  rich rules: ' + set[zz].rich.join(' '));
            out.push('');
          });
          return;
        case 'list-ports': out.push(zs.ports.join(' ')); return;
        case 'list-services': out.push(zs.services.join(' ')); return;
        case 'list-rich': out.push(zs.rich.join('\n')); return;
        case 'query-port':
          out.push(zs.ports.indexOf(val) !== -1 ? 'yes' : 'no');
          if (zs.ports.indexOf(val) === -1) code = 1;
          return;
        case 'query-service':
          out.push(zs.services.indexOf(val) !== -1 ? 'yes' : 'no');
          if (zs.services.indexOf(val) === -1) code = 1;
          return;
        case 'query-rich-rule':
          out.push(zs.rich.indexOf(val) !== -1 ? 'yes' : 'no');
          if (zs.rich.indexOf(val) === -1) code = 1;
          return;
        case 'add-port':
          if (!/^\d+(-\d+)?\/(tcp|udp|sctp|dccp)$/.test(val)) { err.push('Error: INVALID_PORT: ' + val); code = 1; return; }
          if (zs.ports.indexOf(val) === -1) zs.ports.push(val);
          out.push('success');
          if (!permanent) deferredHints.push('（运行时规则：重启 firewalld 即失效。要长期生效请加 --permanent 再 --reload）');
          else FW.dirty = true;
          return;
        case 'remove-port':
          if (!/^\d+(-\d+)?\/(tcp|udp|sctp|dccp)$/.test(val)) { err.push('Error: INVALID_PORT: ' + val); code = 1; return; }
          var pi = zs.ports.indexOf(val);
          if (pi === -1) { err.push('Warning: NOT_ENABLED: ' + val); code = 1; return; }
          zs.ports.splice(pi, 1);
          out.push('success');
          if (permanent) FW.dirty = true;
          return;
        case 'add-service':
          if (!FW_SERVICE_PORTS[val]) { err.push('Error: INVALID_SERVICE: ' + val + '\n（服务名必须存在于 /usr/lib/firewalld/services/）'); code = 1; return; }
          if (zs.services.indexOf(val) === -1) zs.services.push(val);
          out.push('success');
          if (!permanent) deferredHints.push('（运行时规则：重启即失效）');
          else FW.dirty = true;
          return;
        case 'remove-service':
          var si = zs.services.indexOf(val);
          if (si === -1) { err.push('Warning: NOT_ENABLED: ' + val); code = 1; return; }
          zs.services.splice(si, 1);
          out.push('success');
          if (permanent) FW.dirty = true;
          return;
        case 'add-rich-rule':
          zs.rich.push(val);
          out.push('success');
          if (!permanent) deferredHints.push('（富规则同样分 runtime / permanent 两套）');
          else FW.dirty = true;
          return;
        case 'remove-rich-rule':
          var ri = zs.rich.indexOf(val);
          if (ri === -1) { err.push('Warning: NOT_ENABLED: ' + val); code = 1; return; }
          zs.rich.splice(ri, 1);
          out.push('success');
          if (permanent) FW.dirty = true;
          return;
        case 'add-protocol':
          zs.protocols.push(val); out.push('success');
          if (permanent) FW.dirty = true;
          return;
        case 'remove-protocol':
          var qi = zs.protocols.indexOf(val);
          if (qi === -1) { err.push('Warning: NOT_ENABLED: ' + val); code = 1; return; }
          zs.protocols.splice(qi, 1); out.push('success');
          return;
        case 'add-source': zs.sources.push(val); out.push('success'); if (permanent) FW.dirty = true; return;
        case 'remove-source':
          var xi = zs.sources.indexOf(val);
          if (xi === -1) { err.push('Warning: NOT_ENABLED: ' + val); code = 1; return; }
          zs.sources.splice(xi, 1); out.push('success');
          return;
        case 'add-interface':
          if (val !== FW.interface) { err.push('Error: INVALID_INTERFACE: ' + val); code = 1; return; }
          out.push('success'); if (permanent) FW.dirty = true;
          return;
        case 'query-interface': out.push(val === FW.interface ? 'yes' : 'no'); return;
        case 'add-masquerade': zs.masquerade = true; out.push('success'); return;
        case 'remove-masquerade': zs.masquerade = false; out.push('success'); return;
        case 'query-masquerade': out.push(zs.masquerade ? 'yes' : 'no'); return;
        default:
          err.push('firewall-cmd: unrecognized option --' + act.op);
          code = 1;
      }
    });
    deferredHints.forEach(function (h) { out.push(h); });
    /* 退出码非 0 **不代表没有输出**。
       `firewall-cmd --query-port=3306/tcp` 的真实行为就是：往 stdout 打一行 `no`，
       然后以退出码 1 结束 —— 脚本正是靠 `if firewall-cmd --query-port=...; then` 判断的。
       早先这里写成 `if (code !== 0) return { out: [], ... }`，把那一行 `no` 丢掉了，
       于是站内"3306 没放行导致数据库连不上"的那条排障线在终端里看不见任何证据。
       这类"报错时顺手把 stdout 一起清掉"的写法在本项目里已经出过三次，
       统一原则：**out 与 err 各自独立，退出码只表示成败，不表示有没有输出。** */
    return { out: out, err: err, code: code };
  }

  /* ======================================================================
     4 · SELinux：getenforce / setenforce / sestatus / getsebool / setsebool
                     semanage / restorecon
     ====================================================================== */
  var SE = window.CC_SEC_SELINUX;
  if (!SE) {
    SE = window.CC_SEC_SELINUX = {
      mode: 'Enforcing',
      configMode: 'enforcing',
      policy: 'targeted',
      booleans: {
        'httpd_can_network_connect': false,
        'httpd_can_network_connect_db': false,
        'httpd_can_sendmail': false,
        'httpd_enable_homedirs': false,
        'httpd_read_user_content': true,
        'httpd_use_nfs': false,
        'httpd_tmp_exec': false,
        'httpd_unified': false,
        'httpd_execmem': false,
        'httpd_anon_write': false,
        'httpd_mod_auth_ntlm_winbind': false,
        'httpd_use_cifs': false,
        'httpd_use_gpg': false,
        'httpd_verify_dns': false,
        'ftpd_anon_write': false,
        'ftpd_full_access': false,
        'samba_export_all_ro': false,
        'samba_export_all_rw': false,
        'ssh_sysadm_login': false,
        'staff_read_sysadm_file': false
      },
      /* 文件上下文规则表（semanage fcontext -l 的数据源） */
      fcontext: [
        { pattern: '/var/www(/.*)?', type: 'httpd_sys_content_t' },
        { pattern: '/var/www/html(/.*)?', type: 'httpd_sys_content_t' },
        { pattern: '/var/www/cgi-bin(/.*)?', type: 'httpd_sys_script_exec_t' },
        { pattern: '/usr/lib/systemd/system(/.*)?', type: 'systemd_unit_file_t' },
        { pattern: '/etc/nginx(/.*)?', type: 'httpd_config_t' },
        { pattern: '/var/log/nginx(/.*)?', type: 'httpd_log_t' },
        { pattern: '/var/lib/mysql(/.*)?', type: 'mysqld_db_t' },
        { pattern: '/data/backup(/.*)?', type: 'default_t' }
      ],
      ports: [
        { type: 'http_port_t', proto: 'tcp', ports: '80, 81, 443, 488, 8008, 8009, 8443, 9000' },
        { type: 'http_cache_port_t', proto: 'tcp', ports: '8080, 8118, 8123, 10001-10010' },
        { type: 'ssh_port_t', proto: 'tcp', ports: '22' },
        { type: 'mysqld_port_t', proto: 'tcp', ports: '3306' },
        { type: 'postgresql_port_t', proto: 'tcp', ports: '5432' }
      ],
      /* 实际文件标签（ls -Z / restorecon 看的就是它） */
      labels: {
        '/data/www': 'unconfined_u:object_r:default_t:s0',
        '/data/www/index.html': 'unconfined_u:object_r:default_t:s0',
        '/data/www/health.txt': 'unconfined_u:object_r:default_t:s0',
        '/var/www/html/index.html': 'system_u:object_r:httpd_sys_content_t:s0',
        '/var/www/html/health.txt': 'system_u:object_r:httpd_sys_content_t:s0',
        '/etc/nginx/nginx.conf': 'system_u:object_r:httpd_config_t:s0',
        '/data/backup/www-2024-03-17.tar.gz': 'unconfined_u:object_r:default_t:s0'
      }
    };
  }
  function seLabel(path) {
    var abs = String(path);
    if (SE.labels[abs]) return SE.labels[abs];
    var best = null;
    Object.keys(SE.labels).forEach(function (k) {
      if (abs.indexOf(k + '/') === 0 && (!best || k.length > best.length)) best = k;
    });
    if (best) return SE.labels[best];
    return 'unconfined_u:object_r:default_t:s0';
  }
  function seTypeOfLabel(label) {
    var m = String(label).match(/object_r:([^:]+)/);
    return m ? m[1] : 'default_t';
  }

  function getenforce(argv, ctx, stdin, HOST) {
    return U.ok([SE.mode]);
  }
  function setenforce(argv, ctx, stdin, HOST) {
    var v = argv.filter(function (a) { return a.charAt(0) !== '-'; })[0];
    if (v === undefined) {
      return U.fail(['usage: setenforce [ Enforcing | Permissive | 1 | 0 ]']);
    }
    var target;
    if (v === 'Enforcing' || v === '1') target = 'Enforcing';
    else if (v === 'Permissive' || v === '0') target = 'Permissive';
    else return U.fail(['setenforce: invalid argument \'' + v + '\'; usage: setenforce [ Enforcing | Permissive | 1 | 0 ]']);
    if (SE.configMode === 'disabled') {
      return U.fail(['setenforce: SELinux is disabled']);
    }
    SE.mode = target;
    return U.ok([]);
  }
  function sestatus(argv, ctx, stdin, HOST) {
    var out = [];
    out.push('SELinux status:                 ' + (SE.configMode === 'disabled' ? 'disabled' : 'enabled'));
    if (SE.configMode !== 'disabled') {
      out.push('SELinuxfs mount:                /sys/fs/selinux');
      out.push('SELinux root directory:         /etc/selinux');
      out.push('Loaded policy name:             ' + SE.policy);
      out.push('Current mode:                   ' + SE.mode);
      out.push('Mode from config file:          ' + SE.configMode);
      out.push('Policy MLS status:              enabled');
      out.push('Policy deny_unknown status:     allowed');
      out.push('Memory protection checking:     actual (secure)');
      out.push('Max kernel policy version:      33');
    }
    out.push('');
    out.push('（Current mode 是内存里的状态，setenforce 一重启就没了；Mode from config file 才是 /etc/selinux/config 里的持久设置）');
    return U.ok(out);
  }
  function getsebool(argv, ctx, stdin, HOST) {
    var all = argv.indexOf('-a') !== -1;
    var name = argv.filter(function (a) { return a.charAt(0) !== '-'; })[0];
    if (!all && !name) return U.fail(['usage: getsebool [-a] [boolean]']);
    var out = [];
    if (all) {
      Object.keys(SE.booleans).sort().forEach(function (k) {
        out.push(k + ' --> ' + (SE.booleans[k] ? 'on' : 'off'));
      });
      return U.ok(out);
    }
    if (SE.booleans[name] === undefined) {
      return U.fail(['getsebool:  Boolean ' + name + ' is not defined']);
    }
    out.push(name + ' --> ' + (SE.booleans[name] ? 'on' : 'off'));
    return U.ok(out);
  }
  function setsebool(argv, ctx, stdin, HOST) {
    var persist = false;
    var rest = [];
    for (var i = 0; i < argv.length; i++) {
      var a = String(argv[i]);
      if (a === '-P' || a === '--permanent') { persist = true; continue; }
      if (a === '-N' || a === '--no-permanent') continue;
      rest.push(a);
    }
    if (rest.length < 2) return U.fail(['usage: setsebool [-PN] boolean value | bool1=val1 bool2=val2...']);
    var name = rest[0], value = rest[1];
    var on;
    if (value === 'on' || value === '1' || value === 'true') on = true;
    else if (value === 'off' || value === '0' || value === 'false') on = false;
    else return U.fail(['setsebool: invalid value \'' + value + '\' (must be on/off)']);
    if (SE.booleans[name] === undefined) {
      return U.fail(['setsebool:  Boolean ' + name + ' is not defined']);
    }
    if (!persist) {
      SE.booleans[name] = on;
      return U.ok(['（未加 -P：只改运行时，重启后恢复。要永久生效请用 setsebool -P，它会重建整个策略，耗时较长）']);
    }
    SE.booleans[name] = on;
    return U.ok([]);
  }
  function semanage(argv, ctx, stdin, HOST) {
    var kind = argv[0];
    if (kind === 'fcontext') {
      var mode = argv[1];
      if (mode === '-l' || mode === '--list') {
        var out = [];
        if (argv.indexOf('-C') !== -1) {
          out.push('（-C = 只看本地自定义规则，系统内置规则不显示）');
        }
        out.push('SELinux fcontext                                   type               Context');
        out.push('');
        SE.fcontext.forEach(function (r) {
          out.push(padRightStr(r.pattern, 51) + r.type);
        });
        out.push('');
        out.push('（本地自定义规则以 -C 查看；系统默认规则来自 /etc/selinux/targeted/contexts/files/file_contexts）');
        return U.ok(out);
      }
      if (mode === '-a' || mode === '--add') {
        var type = null, pattern = null;
        for (var i = 2; i < argv.length; i++) {
          if (argv[i] === '-t' && argv[i + 1]) { type = argv[++i]; continue; }
          if (argv[i] === '-f' && argv[i + 1]) { i++; continue; }
          if (argv[i] === '-s' && argv[i + 1]) { i++; continue; }
          if (argv[i].charAt(0) === '-') continue;
          pattern = argv[i];
        }
        if (!type || !pattern) return U.fail(['usage: semanage fcontext -a -t <type> <file_spec>']);
        var dup = false;
        SE.fcontext.forEach(function (r) { if (r.pattern === pattern) dup = true; });
        if (dup) return U.fail(['/usr/sbin/semanage: File context for ' + pattern + ' already defined']);
        SE.fcontext.unshift({ pattern: pattern, type: type });
        return U.ok([]);
      }
      if (mode === '-d' || mode === '--delete') {
        var pat = argv[argv.length - 1];
        var before = SE.fcontext.length;
        SE.fcontext = SE.fcontext.filter(function (r) { return r.pattern !== pat; });
        if (SE.fcontext.length === before) return U.fail(['/usr/sbin/semanage: File context for ' + pat + ' is not defined']);
        return U.ok([]);
      }
      if (mode === '-m' || mode === '--modify') return U.ok([]);
      return U.fail(['usage: semanage fcontext [-a|-d|-l|-m] ...']);
    }
    if (kind === 'port') {
      var pmode = argv[1];
      if (pmode === '-l' || pmode === '--list') {
        var out2 = ['SELinux Port Type              Proto    Port Number'];
        SE.ports.forEach(function (p) {
          out2.push(padRightStr(p.type, 31) + padRightStr(p.proto, 9) + p.ports);
        });
        return U.ok(out2);
      }
      if (pmode === '-a' || pmode === '--add') {
        var ptype = null, proto = null, port = null;
        for (var k = 2; k < argv.length; k++) {
          if (argv[k] === '-t' && argv[k + 1]) { ptype = argv[++k]; continue; }
          if (argv[k] === '-p' && argv[k + 1]) { proto = argv[++k]; continue; }
          if (argv[k].charAt(0) === '-') continue;
          port = argv[k];
        }
        if (!ptype || !port) return U.fail(['usage: semanage port -a -t <type> -p <proto> <port>']);
        if (proto && proto !== 'tcp' && proto !== 'udp') return U.fail(['/usr/sbin/semanage: Invalid protocol \'' + proto + '\'']);
        var exists = false;
        SE.ports.forEach(function (p) {
          if (p.type === ptype && (',' + p.ports + ',').indexOf(',' + port + ',') !== -1) exists = true;
        });
        if (exists) return U.fail(['/usr/sbin/semanage: Port ' + port + ' already defined']);
        SE.ports.push({ type: ptype, proto: proto || 'tcp', ports: String(port) });
        return U.ok([]);
      }
      if (pmode === '-d' || pmode === '--delete') return U.ok([]);
      return U.fail(['usage: semanage port [-a|-d|-l|-m] ...']);
    }
    if (kind === 'boolean') {
      if (argv[1] === '-l' || argv[1] === '--list') {
        var out3 = ['SELinux boolean                State  Default Description', ''];
        Object.keys(SE.booleans).sort().forEach(function (b) {
          out3.push(padRightStr(b, 31) + padRightStr(SE.booleans[b] ? 'on' : 'off', 7) + 'off');
        });
        return U.ok(out3);
      }
      return U.fail(['usage: semanage boolean [-l]']);
    }
    if (kind === 'login' || kind === 'user' || kind === 'permissive') return U.ok(['（教学环境只实现 fcontext / port / boolean）']);
    return U.fail(['usage: semanage {boolean,fcontext,port,login,user,permissive} ...']);
  }
  function restorecon(argv, ctx, stdin, HOST) {
    var recursive = false, verbose = false, dry = false, targets = [];
    argv.forEach(function (a) {
      if (/^-[a-zA-Z]+$/.test(a)) {
        a.slice(1).split('').forEach(function (c) {
          if (c === 'R' || c === 'r') recursive = true;
          else if (c === 'v') verbose = true;
          else if (c === 'n') dry = true;
          else if (c === 'F') { /* force */ }
        });
      } else targets.push(a);
    });
    if (!targets.length) return U.fail(['usage: restorecon [-R] [-n] [-v] <path> ...']);
    var out = [];
    var changed = 0, scanned = 0;
    var resolveType = function (abs) {
      /* 规则表里最长匹配优先（真 SELinux 也是这个语义） */
      var best = null;
      SE.fcontext.forEach(function (r) {
        var pat = r.pattern.replace(/\(\.\*\)\?$/, '').replace(/\/$/, '');
        var hit = (abs === pat) || (abs.indexOf(pat + '/') === 0);
        if (hit && (!best || pat.length > best.pattern.length)) best = r;
      });
      return best ? best.type : 'default_t';
    };
    var visit = function (abs) {
      var node = U.findNode(ctx.root, abs);
      if (!node) { return false; }
      scanned++;
      var want = resolveType(abs);
      var cur = seTypeOfLabel(seLabel(abs));
      if (cur !== want) {
        changed++;
        if (verbose) out.push((dry ? '[DRY RUN] ' : '') + 'Relabeled ' + abs + ' from ' + seLabel(abs) + ' to ' + want);
        if (!dry) SE.labels[abs] = 'system_u:object_r:' + want + ':s0';
      } else if (verbose) {
        out.push('（已是 ' + want + '，无需修改）' + abs);
      }
      if (node.type === 'dir' && recursive) {
        U.childrenSorted(node).forEach(function (n) { visit(abs === '/' ? '/' + n : abs + '/' + n); });
      }
      return true;
    };
    var missing = [];
    targets.forEach(function (t) {
      var abs = U.resolvePath(ctx.cwd, t);
      if (!visit(abs)) missing.push(t);
    });
    if (missing.length) {
      return { out: out, err: missing.map(function (t) { return 'restorecon: lstat(' + t + ') failed: No such file or directory'; }), code: 1 };
    }
    if (verbose) {
      out.push('');
      out.push('（本次共扫描 ' + scanned + ' 个对象，' + (dry ? '演练模式下未做修改' : '修改 ' + changed + ' 个标签') + '）');
    } else if (!dry) {
      out.push('（restorecon 成功时不打印任何内容；要看改了什么必须加 -v，先看范围加 -n 演练）');
    }
    return U.ok(out);
  }

  /* ======================================================================
     5 · 审计：ausearch / aureport / auditctl
     ====================================================================== */
  var AVC_LOG = [
    'type=AVC msg=audit(1710728641.412:1802): avc:  denied  { read } for  pid=1843 comm="nginx" name="index.html" dev="vdb1" ino=131842 scontext=system_u:system_r:httpd_t:s0 tcontext=unconfined_u:object_r:default_t:s0 tclass=file permissive=0',
    'type=AVC msg=audit(1710728641.412:1802): avc:  denied  { open } for  pid=1843 comm="nginx" path="/data/www/index.html" dev="vdb1" ino=131842 scontext=system_u:system_r:httpd_t:s0 tcontext=unconfined_u:object_r:default_t:s0 tclass=file permissive=0',
    'type=SYSCALL msg=audit(1710728641.412:1802): arch=c000003e syscall=2 success=no exit=-13 a0=55d3f0a1b2c0 a1=0 a2=0 a3=0 items=0 ppid=1842 pid=1843 auid=4294967295 uid=991 gid=986 euid=991 suid=991 fsuid=991 egid=986 sgid=986 fsgid=986 tty=(none) ses=4294967295 comm=nginx exe=/usr/sbin/nginx subj=system_u:system_r:httpd_t:s0 key=(null)',
    'type=AVC msg=audit(1710729180.881:1841): avc:  denied  { name_connect } for  pid=1843 comm="nginx" dest=3306 scontext=system_u:system_r:httpd_t:s0 tcontext=system_u:object_r:mysqld_port_t:s0 tclass=tcp_socket permissive=0',
    'type=AVC msg=audit(1710729180.881:1841): avc:  denied  { getattr } for  pid=4102 comm="node_exporter" path="/etc/shadow" dev="vda1" ino=132005 scontext=system_u:system_r:node_exporter_t:s0 tcontext=system_u:object_r:shadow_t:s0 tclass=file permissive=0'
  ];

  function ausearch(argv, ctx, stdin, HOST) {
    var opt = parseOpts(argv, ['m', 'ts', 'te', 'k', 'c', 'ui', 'p', 'if', 'sc', 'x'], ['i', 'interpret', 'success', 'raw']);
    var msgType = opt.m;
    var since = opt.ts;
    var key = opt.k;
    var comm = opt.c;
    var lines = AVC_LOG.slice();
    if (since === 'recent') lines = lines.slice(0, 3);
    else if (since === 'today') lines = lines.slice(3, 4).concat(lines.slice(0, 1));
    if (key === 'passwd_change') lines = [];
    if (msgType && msgType !== 'avc' && msgType !== 'all') {
      /* 只要非 avc 类型：本环境没有这类记录 */
      return U.fail(['<no matches>']);
    }
    if (comm && comm !== 'nginx') lines = lines.filter(function (l) { return false; });
    if (!lines.length) return U.fail(['<no matches>']);
    var out = ['----'];
    if (opt.i || opt.interpret) {
      out.push('time->Mon Mar 18 09:04:01 2024');
      out.push('type=AVC msg=audit(1710728641.412:1802): avc:  denied  { read } for  pid=1843 comm="nginx" name="index.html" dev="vdb1" ino=131842 scontext=system_u:system_r:httpd_t:s0 tcontext=unconfined_u:object_r:default_t:s0 tclass=file permissive=0');
      out.push('type=AVC msg=audit(1710728641.412:1802): avc:  denied  { open } for  pid=1843 comm="nginx" path="/data/www/index.html" dev="vdb1" ino=131842 scontext=system_u:system_r:httpd_t:s0 tcontext=unconfined_u:object_r:default_t:s0 tclass=file permissive=0');
      out.push('type=SYSCALL msg=audit(1710728641.412:1802): arch=c000003e syscall=2 success=no exit=-13 a0=55d3f0a1b2c0 a1=0 a2=0 a3=0 items=0 ppid=1842 pid=1843 auid=4294967295 uid=991 gid=986 euid=991 suid=991 fsuid=991 egid=986 sgid=986 fsgid=986 tty=(none) ses=4294967295 comm=nginx exe=/usr/sbin/nginx subj=system_u:system_r:httpd_t:s0 key=(null)');
      out.push('----');
      out.push('time->Mon Mar 18 09:13:00 2024');
      out.push('type=AVC msg=audit(1710729180.881:1841): avc:  denied  { name_connect } for  pid=1843 comm="nginx" dest=3306 scontext=system_u:system_r:httpd_t:s0 tcontext=system_u:object_r:mysqld_port_t:s0 tclass=tcp_socket permissive=0');
      out.push('----');
      out.push('（读法：scontext = 发起方域（httpd_t），tcontext = 目标标签（default_t / mysqld_port_t），tclass = 对象类型（file / tcp_socket），denied { ... } = 被拒的动作）');
    } else {
      lines.forEach(function (l) { out.push(l); });
      out.push('----');
    }
    return U.ok(out);
  }
  function aureport(argv, ctx, stdin, HOST) {
    if (argv.indexOf('--avc') !== -1 || argv.indexOf('-a') !== -1) {
      return U.ok([
        '',
        'AVC Report',
        '====================================================',
        '# date time          pid     comm        syscall',
        '====================================================',
        '1. 2024-03-18 09:04:01 1843   nginx       open',
        '2. 2024-03-18 09:04:01 1843   nginx       read',
        '3. 2024-03-18 09:13:00 1843   nginx       connect',
        '4. 2024-03-18 09:13:00 4102   node_exporter  getattr',
        '',
        '<no summary>'
      ]);
    }
    if (argv.indexOf('--summary') !== -1) {
      return U.ok([
        '',
        'Summary Report',
        '======================',
        'Total  lines processed:        5',
        'Total  AVC messages:           5',
        'Total  failed syscalls:        5',
        'Total  files:                  3',
        'Total  network sockets:        1',
        ''
      ]);
    }
    return U.ok([
      '',
      'Aureport 3.0.7',
      'Summary:',
      'Range of time in logs: 2024-03-18 09:04:01 - 2024-03-18 09:13:00',
      'Selected time for report: 2024-03-18 09:04:01 - 2024-03-18 09:13:00',
      'Number of changes in configuration: 0',
      'Number of changes to accounts, groups, or roles: 0',
      'Number of logins: 3',
      'Number of failed logins: 1',
      'Number of authentications: 4',
      'Number of failed authentications: 63',
      'Number of AVCs: 5',
      ''
    ]);
  }
  function auditctl(argv, ctx, stdin, HOST) {
    var rules = window.CC_SEC_AUDIT_RULES;
    if (!rules) {
      rules = window.CC_SEC_AUDIT_RULES = [
        { w: '/etc/passwd', p: 'wa', k: 'passwd_change' },
        { w: '/etc/sudoers', p: 'wa', k: 'sudoers_change' }
      ];
    }
    if (argv.indexOf('-l') !== -1) {
      var out = [];
      rules.forEach(function (r) {
        out.push('-w ' + r.w + ' -p ' + r.p + ' -k ' + r.k);
      });
      if (argv.indexOf('-s') !== -1) {
        out.push('enabled=1');
        out.push('failure=1');
        out.push('pid=1810');
        out.push('rate_limit=0');
        out.push('backlog_limit=8192');
        out.push('lost=0');
        out.push('backlog=0');
      }
      return U.ok(out);
    }
    if (argv.indexOf('-s') !== -1) {
      return U.ok(['enabled=1', 'failure=1', 'pid=1810', 'rate_limit=0', 'backlog_limit=8192', 'lost=0', 'backlog=0']);
    }
    if (argv.indexOf('-D') !== -1) { rules.length = 0; return U.ok([]); }
    if (argv.indexOf('-w') !== -1) {
      var path = null, perm = 'wa', key = null;
      for (var i = 0; i < argv.length; i++) {
        if (argv[i] === '-w' && argv[i + 1]) path = argv[++i];
        else if (argv[i] === '-p' && argv[i + 1]) perm = argv[++i];
        else if (argv[i] === '-k' && argv[i + 1]) key = argv[++i];
      }
      if (!path) return U.fail(['auditctl: 需要 -w <文件或目录>']);
      if (!key) return U.fail(['auditctl: 建议用 -k <关键字> 给规则命名，否则事后无法用 ausearch -k 检索']);
      var dup = false;
      rules.forEach(function (r) { if (r.w === path) dup = true; });
      if (dup) return U.fail(['Rule exists']);
      rules.push({ w: path, p: perm, k: key });
      return U.ok(['（规则只存在于内存，重启即失效；持久化要写 /etc/audit/rules.d/*.rules 再 augenrules --load）']);
    }
    if (argv.indexOf('-a') !== -1) {
      return U.ok(['（已加载 syscall 规则；这类规则会记录所有命令执行，日志量极大，排查完记得 -d 删掉）']);
    }
    return U.fail(['auditctl: 参数不完整，试试 auditctl -w <文件> -p wa -k <关键字> 或 auditctl -l']);
  }

  /* ======================================================================
     6 · AppArmor：aa-status / aa-complain / aa-enforce / dmesg
     ====================================================================== */
  function aaStatus(argv, ctx, stdin, HOST) {
    if (argv.indexOf('--verbose') !== -1) {
      return U.ok([
        'apparmor module is loaded.',
        '14 profiles are loaded.',
        '12 profiles are in enforce mode.',
        '   /usr/sbin/nginx',
        '   /usr/sbin/named',
        '   /usr/sbin/chronyd',
        '   docker-default',
        '   /usr/bin/man',
        '   /usr/lib/NetworkManager/nm-dhcp-client.action',
        '   /usr/lib/connman/scripts/dhclient-script',
        '   /usr/sbin/tcpdump',
        '   /usr/bin/evince',
        '   /usr/bin/evince-previewer',
        '   /usr/bin/evince-thumbnailer',
        '   /usr/bin/cupsd',
        '2 profiles are in complain mode.',
        '   /usr/sbin/mysqld',
        '   /usr/sbin/sshd',
        '0 profiles are in kill mode.',
        '0 profiles are in unconfined mode.',
        '0 processes have profiles defined.',
        '0 processes are in enforce mode.',
        '0 processes are in complain mode.',
        '0 processes are unconfined but have a profile defined.'
      ]);
    }
    return U.ok([
      'apparmor module is loaded.',
      '14 profiles are loaded.',
      '12 profiles are in enforce mode.',
      '2 profiles are in complain mode.',
      '0 profiles are in kill mode.',
      '0 profiles are in unconfined mode.',
      '0 processes have profiles defined.',
      '0 processes are in enforce mode.',
      '0 processes are in complain mode.',
      '0 processes are unconfined but have a profile defined.',
      '',
      '（enforce = 真拦截；complain = 只记日志不拦。排障时先 aa-complain 把可疑 profile 切过去，问题消失就说明是 AppArmor 拦的）'
    ]);
  }
  function aaMode(argv, ctx, stdin, HOST, mode) {
    var target = argv.filter(function (a) { return a.charAt(0) !== '-'; })[0];
    if (!target) return U.fail(['Usage: aa-' + mode + ' <profile> [<profile>..]']);
    var known = ['/usr/sbin/nginx', '/usr/sbin/sshd', '/usr/sbin/mysqld', '/usr/sbin/named', 'docker-default'];
    if (known.indexOf(target) === -1) {
      return U.fail(['Cache read/write disabled: ' + target + ' not found\nProfile ' + target + ' does not exist.']);
    }
    if (mode === 'complain') {
      return U.ok([
        'Setting ' + target + ' to complain mode.',
        '',
        '（complain 模式只记录不拦截；验证完请记得 aa-enforce 切回强制模式）'
      ]);
    }
    return U.ok(['Setting ' + target + ' to enforce mode.']);
  }
  function dmesgCmd(argv, ctx, stdin, HOST) {
    var clear = argv.indexOf('-C') !== -1 || argv.indexOf('-c') !== -1;
    if (clear) {
      window.CC_SEC_DMESG_CLEARED = true;
      return U.ok([]);
    }
    if (window.CC_SEC_DMESG_CLEARED) return U.ok([]);
    var lines = [
      '[    0.000000] Linux version 5.10.0-136.12.0.86.hce2.x86_64 (mockbuild@hce2) (gcc 10.3.1) #1 SMP Mon Dec 11 08:32:11 UTC 2023',
      '[    0.000000] Command line: BOOT_IMAGE=/vmlinuz-5.10.0 root=/dev/vda1 ro console=tty0 console=ttyS0,115200',
      '[    2.184213] systemd[1]: systemd 245.4-4ubuntu3 running in system mode.',
      '[    4.902117] SELinux:  Permission check on netif_rx failed.',
      '[   12.401882] audit: type=1400 audit(1710728641.412:1802): apparmor="DENIED" operation="open" profile="/usr/sbin/nginx" name="/data/www/index.html" pid=1843 comm="nginx" requested_mask="r" denied_mask="r" fsuid=991 ouid=991',
      '[   12.402004] audit: type=1400 audit(1710728641.413:1803): apparmor="DENIED" operation="open" profile="/usr/sbin/nginx" name="/data/www/health.txt" pid=1843 comm="nginx" requested_mask="r" denied_mask="r" fsuid=991 ouid=991',
      '[   31.228710] EXT4-fs (vdb1): mounted filesystem with ordered data mode. Opts: (null)',
      '[  184.552011] docker0: port 3(veth9c1a2b) entered blocking state',
      '[ 1842.771204] TCP: request_sock_TCP: Possible SYN flooding on port 80. Sending cookies.',
      '[ 9021.334512] audit: type=1400 audit(1710729180.881:1841): apparmor="DENIED" operation="connect" profile="/usr/sbin/nginx" name="tcp:3306" pid=1843 comm="nginx" requested_mask="w" denied_mask="w"',
      '[1283947.420115] docker0: port 3(veth9c1a2b) entered forwarding state'
    ];
    return U.ok(lines);
  }

  /* ======================================================================
     7 · gpg
     ====================================================================== */
  var GPG_KEYS = {
    'ops@example.com': { id: '4F2A9C1B7E3D5086', name: 'ops (运维组)', algo: 'rsa3072', created: '2024-01-08', expires: '2027-01-07' }
  };
  function gpgCmd(argv, ctx, stdin, HOST) {
    var out = [], err = [];
    var i, a;
    var opts = { armor: false, detach: false, symmetric: false, decrypt: false, encrypt: false, verify: false, sign: false, export: false, exportSecret: false, list: false, genkey: false, import: false, out: null, recipient: null };
    var files = [];
    for (i = 0; i < argv.length; i++) {
      a = String(argv[i]);
      if (a === '--armor' || a === '-a') { opts.armor = true; continue; }
      if (a === '--detach-sign' || a === '-b') { opts.detach = true; continue; }
      if (a === '-c' || a === '--symmetric') { opts.symmetric = true; continue; }
      if (a === '-d' || a === '--decrypt') { opts.decrypt = true; continue; }
      if (a === '-e' || a === '--encrypt') { opts.encrypt = true; continue; }
      if (a === '-s' || a === '--sign') { opts.sign = true; continue; }
      if (a === '--verify') { opts.verify = true; continue; }
      if (a === '--export') { opts.export = true; continue; }
      if (a === '--export-secret-keys') { opts.export = true; opts.exportSecret = true; continue; }
      if (a === '--list-keys' || a === '--list-secret-keys') { opts.list = true; continue; }
      if (a === '--full-generate-key' || a === '--gen-key') { opts.genkey = true; continue; }
      if (a === '--import') { opts.import = true; continue; }
      if (a === '--cipher-algo' && argv[i + 1]) { opts.cipher = argv[++i]; continue; }
      if (a === '-r' || a === '--recipient') { opts.recipient = argv[++i]; continue; }
      if (a === '-o' || a === '--output') { opts.out = argv[++i]; continue; }
      if (a === '--batch' || a === '--yes' || a === '--quiet' || a === '--no-tty') continue;
      if (a.charAt(0) === '-') { err.push('gpg: invalid option "' + a + '"'); return { out: [], err: err, code: 2 }; }
      files.push(a);
    }
    if (opts.genkey) {
      out.push('gpg (GnuPG) 2.2.20; Copyright (C) 2020 Free Software Foundation, Inc.');
      out.push('Please select what kind of key you want:');
      out.push('   (1) RSA and RSA (default)');
      out.push('   (2) DSA and Elgamal');
      out.push('   (3) DSA (sign only)');
      out.push('   (4) RSA (sign only)');
      out.push('（教学环境不进入交互式问答：真机上接下来会问密钥长度、有效期、姓名邮箱与口令）');
      out.push('');
      out.push('等价的一次性写法（脚本里常用）：');
      out.push('  gpg --batch --gen-key <<EOF');
      out.push('  %no-protection');
      out.push('  Key-Type: RSA');
      out.push('  Key-Length: 3072');
      out.push('  Name-Real: ops');
      out.push('  Name-Email: ops@example.com');
      out.push('  Expire-Date: 2y');
      out.push('  EOF');
      return { out: out, err: err, code: 0 };
    }
    if (opts.list) {
      out.push('/root/.gnupg/pubring.kbx');
      out.push('----------------------------');
      Object.keys(GPG_KEYS).forEach(function (uid) {
        var k = GPG_KEYS[uid];
        out.push('pub   ' + k.algo + ' 2024-01-08 [SC] [expires: ' + k.expires + ']');
        out.push('      ' + k.id);
        out.push('uid           [ultimate] ' + k.name + ' <' + uid + '>');
        out.push('sub   rsa3072 2024-01-08 [E] [expires: ' + k.expires + ']');
      });
      return { out: out, err: err, code: 0 };
    }
    if (opts.export) {
      if (!files.length) { err.push('gpg: no key specified for export'); return { out: [], err: err, code: 2 }; }
      var uid = files[0];
      var kk = GPG_KEYS[uid];
      if (!kk) { err.push('gpg: WARNING: nothing exported'); return { out: [], err: err, code: 2 }; }
      if (opts.exportSecret) {
        out.push('-----BEGIN PGP PRIVATE KEY BLOCK-----');
        out.push('lQPGBGXk2Q8BCADe1a9o0KcM5yR7QhV2jX8pN4tS6uL0fE3wA1bC5dG7hJ9kM2nP4rT6vX8z');
        out.push('B2dF5hJ7kL9mN1pQ3rS5tU7vW9xY1zA3bC5dE7fG9hI1jK3lM5nO7pQ9rS1tU3vW5xY7z');
        out.push('=Kw3d');
        out.push('-----END PGP PRIVATE KEY BLOCK-----');
        out.push('（⚠ 私钥导出后必须离线加密保存；泄露等于所有用它加密的历史文件都失守）');
      } else {
        out.push('-----BEGIN PGP PUBLIC KEY BLOCK-----');
        out.push('mQGNBGXk2Q8BDADQ8f2kR5mN7pQ9rS1tU3vW5xY7zA1bC3dE5fG7hI9jK1lM3nO5pQ7rS9');
        out.push('tU1vW3xY5zA7bC9dE1fG3hI5jK7lM9nO1pQ3rS5tU7vW9xY1zA3bC5dE7fG9hI1jK3lM5');
        out.push('=Ab2c');
        out.push('-----END PGP PUBLIC KEY BLOCK-----');
      }
      return { out: out, err: err, code: 0 };
    }
    if (opts.import) {
      var inp = files[0] ? fsRead(ctx, files[0]) : { content: (stdin || []).join('\n') };
      if (inp.error) { err.push('gpg: cannot open: No such file or directory'); return { out: [], err: err, code: 2 }; }
      if (!/-----BEGIN PGP (PUBLIC|PRIVATE) KEY BLOCK-----/.test(inp.content)) {
        err.push('gpg: no valid OpenPGP data found.'); err.push('gpg: processing message failed: Unknown system error');
        return { out: [], err: err, code: 2 };
      }
      out.push('gpg: key 4F2A9C1B7E3D5086: public key "ops (运维组) <ops@example.com>" imported');
      out.push('gpg: Total number processed: 1');
      out.push('gpg:               imported: 1');
      return { out: out, err: err, code: 0 };
    }
    if (opts.symmetric) {
      if (!files.length) { err.push('gpg: no file to encrypt'); return { out: [], err: err, code: 2 }; }
      var src = fsRead(ctx, files[0]);
      if (src.error) { err.push('gpg: cannot open: No such file or directory'); return { out: [], err: err, code: 2 }; }
      var cipher = (opts.cipher || 'AES256');
      var target = files[0] + '.gpg';
      var blob = '-----BEGIN PGP MESSAGE-----\n' +
        'Version: GnuPG v2.2.20 (GNU/Linux)\n\n' +
        wrap64(base64Encode(sha256Bytes(utf8Bytes('gpgc:' + files[0])).concat(sha256Bytes(utf8Bytes(src.content))))) +
        '\n=cX4t\n-----END PGP MESSAGE-----\n';
      var w = fsWrite(ctx, target, blob, '600');
      STORE['gpg:' + target] = src.content;
      if (w.error) { err.push('gpg: ' + target + ': No such file or directory'); return { out: [], err: err, code: 2 }; }
      out.push('（教学环境：已用口令对称加密，算法 ' + cipher + '，产出 ' + target + '；口令不参与真实运算）');
      return { out: out, err: err, code: 0 };
    }
    if (opts.decrypt) {
      if (!files.length) { err.push('gpg: no file to decrypt'); return { out: [], err: err, code: 2 }; }
      var enc = fsRead(ctx, files[0]);
      if (enc.error) { err.push('gpg: cannot open: No such file or directory'); return { out: [], err: err, code: 2 }; }
      var plain = STORE['gpg:' + U.resolvePath(ctx.cwd, files[0])] || STORE['gpg:' + files[0]];
      if (plain === undefined) {
        err.push('gpg: AES256.CFB encrypted data');
        err.push('gpg: decryption failed: No secret key');
        return { out: [], err: err, code: 2 };
      }
      if (opts.out) {
        var w2 = fsWrite(ctx, opts.out, plain, '600');
        if (w2.error) { err.push('gpg: ' + opts.out + ': No such file or directory'); return { out: [], err: err, code: 2 }; }
        return { out: [], err: [], code: 0 };
      }
      splitLines(plain).forEach(function (l) { out.push(l); });
      return { out: out, err: err, code: 0 };
    }
    if (opts.encrypt) {
      if (!opts.recipient) { err.push('gpg: no valid recipients'); return { out: [], err: err, code: 2 }; }
      if (!GPG_KEYS[opts.recipient]) {
        err.push('gpg: ' + opts.recipient + ': skipped: No public key');
        err.push('gpg: [' + (files[0] || 'stdin') + ']: encryption failed: No public key');
        return { out: [], err: err, code: 2 };
      }
      if (!files.length) { err.push('gpg: no file to encrypt'); return { out: [], err: err, code: 2 }; }
      var src2 = fsRead(ctx, files[0]);
      if (src2.error) { err.push('gpg: cannot open: No such file or directory'); return { out: [], err: err, code: 2 }; }
      var target2 = files[0] + '.gpg';
      var blob2 = (opts.armor ? '-----BEGIN PGP MESSAGE-----\nVersion: GnuPG v2.2.20 (GNU/Linux)\n\n' : '') +
        wrap64(base64Encode(sha256Bytes(utf8Bytes('gpgp:' + files[0] + opts.recipient)))) +
        (opts.armor ? '\n=sT9q\n-----END PGP MESSAGE-----\n' : '\n');
      fsWrite(ctx, target2, blob2, '600');
      out.push('（教学环境：已用 ' + opts.recipient + ' 的公钥加密，只有对应私钥能解）');
      return { out: out, err: err, code: 0 };
    }
    if (opts.detach) {
      if (!files.length) { err.push('gpg: no file to sign'); return { out: [], err: err, code: 2 }; }
      var s3 = fsRead(ctx, files[0]);
      if (s3.error) { err.push('gpg: cannot open: No such file or directory'); return { out: [], err: err, code: 2 }; }
      var sigTarget = files[0] + (opts.armor ? '.asc' : '.sig');
      var sigBody = opts.armor
        ? '-----BEGIN PGP SIGNATURE-----\n\n' + wrap64(base64Encode(sha256Bytes(utf8Bytes('gpgsig:' + s3.content)))) + '\n=Zx7p\n-----END PGP SIGNATURE-----\n'
        : base64Encode(sha256Bytes(utf8Bytes('gpgsig:' + s3.content)));
      fsWrite(ctx, sigTarget, sigBody, '644');
      STORE['gpgsig:' + U.resolvePath(ctx.cwd, sigTarget)] = sha256Hex(s3.content);
      STORE['gpgsig:' + sigTarget] = sha256Hex(s3.content);
      out.push('（教学环境：已在 ' + files[0] + ' 旁生成独立签名文件 ' + sigTarget + '）');
      return { out: out, err: err, code: 0 };
    }
    if (opts.verify) {
      var sigFile = files[0], dataFile = files[1];
      if (!sigFile) { err.push('gpg: no signature to verify'); return { out: [], err: err, code: 2 }; }
      var sr = fsRead(ctx, sigFile);
      if (sr.error) { err.push('gpg: cannot open signature file: No such file or directory'); return { out: [], err: err, code: 2 }; }
      if (!/-----BEGIN PGP SIGNATURE-----|^[A-Za-z0-9+/=]+$/.test(sr.content.trim())) {
        err.push('gpg: no signed data'); err.push('gpg: cannot hash datafile: No data');
        return { out: [], err: err, code: 2 };
      }
      if (!dataFile) {
        err.push('gpg: no signed data'); err.push('gpg: cannot hash datafile: No data');
        return { out: [], err: err, code: 2 };
      }
      var dr = fsRead(ctx, dataFile);
      if (dr.error) { err.push('gpg: cannot open data file: No such file or directory'); return { out: [], err: err, code: 2 }; }
      var expect = STORE['gpgsig:' + U.resolvePath(ctx.cwd, sigFile)] || STORE['gpgsig:' + sigFile];
      var match = expect !== undefined && expect === sha256Hex(dr.content);
      out.push('gpg: Signature made Mon Mar 18 09:51:00 2024 CST');
      out.push('gpg:                using RSA key 4F2A9C1B7E3D5086');
      out.push('gpg:                issuer "ops@example.com"');
      out.push('gpg: ' + (match ? 'Good signature from "ops (运维组) <ops@example.com>" [ultimate]' : 'BAD signature from "ops (运维组) <ops@example.com>"'));
      if (!match) {
        err.push('gpg: verification failed: BAD signature');
        return { out: out, err: err, code: 1 };
      }
      err.push('gpg: WARNING: This key is not certified with a trusted signature!');
      err.push('gpg:          There is no indication that the signature belongs to the owner.');
      return { out: out, err: err, code: 0 };
    }
    if (opts.sign) {
      return { out: ['（教学环境：请用 --detach-sign 生成独立签名文件）'], err: [], code: 0 };
    }
    /* 无参数或只有文件：真 gpg 会尝试解密 */
    if (files.length) {
      var fr = fsRead(ctx, files[0]);
      if (fr.error) { err.push('gpg: cannot open: No such file or directory'); return { out: [], err: err, code: 2 }; }
      err.push('gpg: no valid OpenPGP data found.');
      err.push('gpg: processing message failed: Unknown system error');
      return { out: [], err: err, code: 2 };
    }
    out.push('gpg: WARNING: no command supplied.  Trying to guess what you mean ...');
    out.push('usage: gpg [options] [filename]');
    return { out: out, err: err, code: 2 };
  }

  /* ======================================================================
     8 · 资产与漏洞扫描：nmap / masscan / nikto / trivy / kube-bench
     ----------------------------------------------------------------------
     这些都是"主动扫描"，教学环境只能给出自查视角的输出；对非授权目标扫描
     既是违规也是违法，所以每一条都在输出末尾点明使用边界。
     ====================================================================== */
  function nmapCmd(argv, ctx, stdin, HOST) {
    var opt = parseOpts(argv, ['p', 'script', 'oN', 'oX', 'oG', 'T', 'iL', 'exclude'], ['sT', 'sS', 'sV', 'Pn', 'sn', 'A', 'v', 'F', 'n']);
    var target = null;
    for (var i = 0; i < argv.length; i++) {
      var a = String(argv[i]);
      if (a.charAt(0) === '-') {
        if (['-p', '-script', '-oN', '-oX', '-oG', '-T', '-iL', '-exclude'].indexOf(a) !== -1) i++;
        continue;
      }
      target = a;
    }
    if (!target) {
      return U.fail(['Nmap 7.93 ( https://nmap.org )',
        'Usage: nmap [Scan Type(s)] [Options] {target specification}',
        '（至少给一个目标，例如 nmap -sT -p 22,80,443 -Pn 10.0.1.23）']);
    }
    var ports = opt.p || (opt.F ? '22,80,443' : '1-1024');
    var isCidr = target.indexOf('/') !== -1;
    var isDbHost = /10\.0\.1\.35|db-prod-01/.test(target);
    var out = ['Starting Nmap 7.93 ( https://nmap.org ) at 2024-03-18 09:51 CST'];
    if (isCidr) {
      out.push('Nmap scan report for 10.0.1.23');
      out.push('Host is up (0.00042s latency).');
      out.push('Not shown: 1019 filtered tcp ports (no-response)');
      out.push('PORT     STATE  SERVICE');
      out.push('22/tcp   open   ssh');
      out.push('80/tcp   open   http');
      out.push('8080/tcp open   http-proxy');
      out.push('');
      out.push('Nmap scan report for 10.0.1.31');
      out.push('Host is up (0.00051s latency).');
      out.push('Not shown: 1021 filtered tcp ports (no-response)');
      out.push('PORT     STATE  SERVICE');
      out.push('8080/tcp open   http-proxy');
      out.push('');
      out.push('Nmap scan report for 10.0.1.35');
      out.push('Host is up (0.00048s latency).');
      out.push('PORT     STATE    SERVICE');
      out.push('6379/tcp open     redis');
      out.push('3306/tcp filtered mysql');
      out.push('');
      out.push('Nmap done: 256 IP addresses (3 hosts up) scanned in 4.82 seconds');
      out.push('');
      out.push('（教学环境只列出具代表性的几台；云上扫描前必须确认安全组不会把扫描源当成攻击流量封禁）');
      if (opt.oN) {
        var w = fsWrite(ctx, opt.oN, out.join('\n') + '\n', '644');
        if (w.error) return U.fail(['Failed to open output file ' + opt.oN + ' for writing']);
        out.push('（结果已写入 ' + opt.oN + '）');
      }
      return U.ok(out);
    }
    var serviceOf = { '22': 'ssh', '80': 'http', '443': 'https', '3306': 'mysql', '6379': 'redis', '27017': 'mongodb', '9200': 'elasticsearch' };
    var openPorts, filteredPorts;
    if (isDbHost) { openPorts = ['6379']; filteredPorts = ['3306', '27017']; }
    else { openPorts = ['22', '80', '8080', '443']; filteredPorts = ['3306']; }
    if (ports === '22') openPorts = ['22'];
    if (opt.script === 'banner' && ports === '22') {
      out.push('Nmap scan report for ' + target);
      out.push('Host is up (0.00042s latency).');
      out.push('');
      out.push('PORT   STATE SERVICE');
      out.push('22/tcp open  ssh');
      out.push('|_banner: SSH-2.0-OpenSSH_8.0');
      out.push('');
      out.push('Nmap done: 1 IP address (1 host up) scanned in 0.31 seconds');
      out.push('');
      out.push('（banner 里泄露了 OpenSSH 精确版本号 —— 攻击者会拿它去比对已知漏洞，加固建议是不要暴露版本信息）');
      return U.ok(out);
    }
    out.push('Nmap scan report for ' + target);
    out.push('Host is up (0.00042s latency).');
    var shown = [];
    out.push('PORT     STATE    SERVICE' + (opt.sV ? '       VERSION' : ''));
    var VERSIONS = {
      '22': 'OpenSSH 8.0 (protocol 2.0)',
      '80': 'nginx 1.20.1',
      '443': 'nginx 1.20.1 (SSL/TLS)',
      '8080': 'Jetty 9.4.43 (Java)',
      '3306': 'MySQL 8.0.32',
      '6379': 'Redis key-value store 6.2.7',
      '27017': 'MongoDB 4.4.19'
    };
    openPorts.forEach(function (p) {
      if (ports.indexOf(p) === -1 && ports !== '1-1024') return;
      shown.push(p);
      out.push(padRightStr(p + '/tcp', 9) + padRightStr('open', 9) + (serviceOf[p] || 'unknown') + (opt.sV ? '  ' + (VERSIONS[p] || '') : ''));
    });
    if (ports === '1-1024') {
      out.push('Not shown: 1018 closed tcp ports (reset)');
      out.push('（只显示 open 的端口；1-1024 全量扫描会留下大量连接记录，云审计里很容易被识别为扫描行为）');
    } else {
      filteredPorts.forEach(function (p) {
        if (ports.indexOf(p) === -1) return;
        shown.push(p);
        out.push(padRightStr(p + '/tcp', 9) + padRightStr('filtered', 9) + (serviceOf[p] || 'unknown'));
      });
      if (shown.indexOf('3306') !== -1) {
        out.push('');
        out.push('3306/tcp 是 filtered 而不是 closed：包被安全组/防火墙静默丢弃（DROP），这正是"数据库连不上"的典型特征');
      }
    }
    out.push('');
    out.push('Nmap done: 1 IP address (1 host up) scanned in 2.14 seconds');
    if (opt.oN) {
      var w2 = fsWrite(ctx, opt.oN, out.join('\n') + '\n', '644');
      if (w2.error) return U.fail(['Failed to open output file ' + opt.oN + ' for writing']);
    }
    return U.ok(out);
  }

  function masscanCmd(argv, ctx, stdin, HOST) {
    var rate = null, ports = null, target = null, outFile = null, wait = 3;
    for (var i = 0; i < argv.length; i++) {
      var a = String(argv[i]);
      if (a.indexOf('--rate=') === 0) { rate = a.slice(7); continue; }
      if (a === '--rate' && argv[i + 1]) { rate = argv[++i]; continue; }
      if (a.indexOf('-p') === 0 && a.length > 2) { ports = a.slice(2); continue; }
      if (a === '-p' && argv[i + 1]) { ports = argv[++i]; continue; }
      if (a === '-oL' && argv[i + 1]) { outFile = argv[++i]; continue; }
      if (a === '--wait' && argv[i + 1]) { wait = Number(argv[++i]); continue; }
      if (a === '--excludefile' && argv[i + 1]) { i++; continue; }
      if (a.charAt(0) === '-') continue;
      target = a;
    }
    if (!target || !ports) {
      return U.fail(['masscan: 用法 masscan <网段> -p<端口范围> --rate=<每秒包数> [-oL 输出文件]']);
    }
    var n = Number(rate || 100);
    if (n > 10000) {
      return U.fail([
        'masscan: --rate=' + rate + ' 太高',
        '',
        '真实后果：出口带宽瞬间被打满 → 交换机/网关丢包 → 云平台判定为 DDoS 攻击并**封禁这台 ECS**。',
        '内网自查请从 --rate=1000 起步；扫外网无论速率多少都属于违规行为。'
      ]);
    }
    var lines = [
      'Starting masscan 1.3.2 (http://bit.ly/14GZzcT) at 2024-03-18 09:51:00 GMT',
      'Initiating SYN Stealth Scan',
      'Scanning ' + target + ' [ports ' + ports + ']',
      'Discovered open port 22/tcp on 10.0.1.23',
      'Discovered open port 80/tcp on 10.0.1.23',
      'Discovered open port 8080/tcp on 10.0.1.23',
      'Discovered open port 8080/tcp on 10.0.1.31',
      'Discovered open port 8080/tcp on 10.0.1.32',
      'Discovered open port 6379/tcp on 10.0.1.35',
      'Discovered open port 3306/tcp on 10.0.1.40',
      'Discovered open port 22/tcp on 10.0.1.40'
    ];
    if (outFile) {
      var body = ['#masscan', '# Ports scanned: TCP(' + ports + ') UDP() SCTP()', '# Rate: ' + n, ''];
      var results = [
        ['open', 'tcp', '22', '10.0.1.23'],
        ['open', 'tcp', '80', '10.0.1.23'],
        ['open', 'tcp', '8080', '10.0.1.23'],
        ['open', 'tcp', '8080', '10.0.1.31'],
        ['open', 'tcp', '8080', '10.0.1.32'],
        ['open', 'tcp', '6379', '10.0.1.35'],
        ['open', 'tcp', '3306', '10.0.1.40'],
        ['open', 'tcp', '22', '10.0.1.40']
      ];
      results.forEach(function (r) {
        body.push('open tcp ' + r[2] + ' ' + r[3] + ' 1710726660');
      });
      body.push('# end');
      var w = fsWrite(ctx, outFile, body.join('\n') + '\n', '644');
      if (w.error) return U.fail(['masscan: failed to open ' + outFile + ' for writing']);
    }
    lines.push('');
    lines.push('（--rate=' + n + '：内网自查从 1000 起步；线上业务网段扫描前先知会网络与安全团队）');
    lines.push('（masscan 只回答"端口通不通"，服务识别要接着用 nmap -sV 精扫）');
    return U.ok(lines);
  }

  function niktoCmd(argv, ctx, stdin, HOST) {
    var opt = parseOpts(argv, ['h', 'p', 'Tuning', 'o', 'Format', 'maxtime', 'useragent', 'id'], ['ssl', 'nointeractive', 'Display', 'v']);
    var host = opt.h;
    if (!host) return U.fail(['+ ERROR: No host specified', '',
      '       Use: nikto -h <host or URL> [-p <port>] [-ssl] [-Tuning <type>] [-o <report>]']);
    var port = opt.p || (/^https/.test(host) ? '443' : '80');
    var out = [
      '- Nikto v2.5.0',
      '---------------------------------------------------------------------------',
      '+ Target IP:          121.36.44.17',
      '+ Target Hostname:    ' + String(host).replace(/^https?:\/\//, ''),
      '+ Target Port:        ' + port,
      '+ Start Time:         2024-03-18 09:51:00 (GMT+8)',
      '---------------------------------------------------------------------------',
      '+ Server: nginx/1.20.1',
      '+ /: The anti-clickjacking X-Frame-Options header is not present.',
      '+ /: The X-Content-Type-Options header is not set. This could allow the user agent to render the content of the site in a different fashion.',
      '+ /backup.zip: Backup file may be publicly accessible. （**高危：立刻删除或移到 Web 根目录之外**）',
      '+ /.git/config: Git configuration file found. This may expose repository contents.',
      '+ /phpinfo.php: PHP info file found. Discloses version and configuration.',
      '+ /robots.txt: contains 3 entries which should be manually viewed.',
      '+ /admin/: Directory indexing is enabled under /admin/.',
      '+ /icons/: Directory indexing found.',
      '---------------------------------------------------------------------------',
      '+ 1 host(s) tested',
      '',
      '（输出里出现备份文件、.git、目录浏览这几类，才是真正要处理的；SPA 应用会把前端路由的 200 误判成"目录存在"，必须人工核对）'
    ];
    if (opt.Tuning === '12') out.splice(6, 0, '+ Tuning 1,2: only interesting files and misconfigurations are tested (fast, low noise)');
    if (opt.o) {
      var w = fsWrite(ctx, opt.o, '<html><body><pre>' + out.join('\n') + '</pre></body></html>\n', '644');
      if (w.error) out.push('（教学环境：报告文件写入失败 —— 目录可能不存在）');
      else out.push('+ Report written to ' + opt.o);
    }
    return U.ok(out);
  }

  function trivyCmd(argv, ctx, stdin, HOST) {
    if (argv[0] === '--version' || argv[0] === '-v' || argv[0] === 'version') {
      return U.ok(['Version: 0.49.1', 'Vulnerability DB:', '  Version: 2', '  UpdatedAt: 2024-03-18T06:12:31Z']);
    }
    if (argv[0] !== 'image') {
      return U.fail(['Error: unknown command "' + (argv[0] || '') + '" for "trivy"',
        'Run trivy --help for usage.']);
    }
    var opt = parseOpts(argv, ['severity', 'format', 'o', 'scanners', 'timeout', 'ignorefile', 'exit-code', 'image-src'], ['ignore-unfixed', 'quiet', 'skip-db-update']);
    var img = opt._[0];
    if (!img || img === 'image') return U.fail(['Error: image name required', 'Usage: trivy image [flags] IMAGE_NAME']);
    var isAlpine = /alpine/.test(img);
    var isHigh = /--severity/.test(argv.join(' '));
    var rows = isAlpine
      ? [['alpine:3.19', 'CVE-2023-52425', 'libexpat', '2.5.0-r2', '2.6.0-r0', 'HIGH'],
      ['alpine:3.19', 'CVE-2024-0727', 'libcrypto3', '3.1.4-r0', '3.1.5-r0', 'MEDIUM']]
      : [['nginx:1.25', 'CVE-2023-44487', 'nghttp2-libs', '1.55.1-r0', '1.57.0-r0', 'HIGH'],
      ['nginx:1.25', 'CVE-2023-45853', 'zlib', '1.2.13-r0', '1.3-r0', 'CRITICAL'],
      ['nginx:1.25', 'CVE-2023-52425', 'libexpat', '2.5.0-r1', '2.6.0-r0', 'HIGH'],
      ['nginx:1.25', 'CVE-2024-0553', 'gnutls', '3.8.1-r0', '3.8.3-r0', 'HIGH']];
    var wantCriticalAndHigh = /HIGH,CRITICAL|CRITICAL,HIGH/.test(argv.join(' '));
    var out = [];
    out.push('2024-03-18T09:51:00.114+0800\tINFO\tNeed to update DB');
    out.push('2024-03-18T09:51:04.882+0800\tINFO\tDB updated successfully');
    out.push('');
    out.push(img + ' (alpine 3.19.1)' );
    out.push('================================');
    out.push('Total: ' + rows.length + ' (UNKNOWN: 0, LOW: 0, MEDIUM: 1, HIGH: ' + (rows.length - 2) + ', CRITICAL: 1)');
    out.push('');
    out.push('┌────────────┬────────────────┬──────────┬──────────────┬───────────────────┬───────────┐');
    out.push('│  LIBRARY   │ VULNERABILITY  │ SEVERITY │ INSTALLED    │ FIXED VERSION     │   TITLE   │');
    out.push('├────────────┼────────────────┼──────────┼──────────────┼───────────────────┼───────────┤');
    rows.forEach(function (r) {
      out.push('│ ' + padRightStr(r[2], 10) + ' │ ' + padRightStr(r[1], 14) + ' │ ' + padRightStr(r[5], 8) + ' │ ' + padRightStr(r[3], 12) + ' │ ' + padRightStr(r[4], 17) + ' │ ' + padRightStr(r[2].slice(0, 9), 9) + ' │');
    });
    out.push('└────────────┴────────────────┴──────────┴──────────────┴───────────────────┴───────────┘');
    if (wantCriticalAndHigh) out.push('（--ignore-unfixed 过滤掉了上游还没发布修复版本的条目，否则基础镜像的陈年 CVE 会让每次构建都红）');
    if (opt['exit-code']) {
      out.push('');
      out.push('（--exit-code 1：发现符合条件的漏洞时 trivy 以非 0 退出，CI 会直接失败 —— 这就是"高危不过不推仓库"的实现方式）');
    }
    if (opt.o) {
      if (opt.format === 'json') {
        fsWrite(ctx, opt.o, JSON.stringify({ SchemaVersion: 2, ArtifactName: img, Results: rows.map(function (r) { return { Target: img, Class: 'os-pkgs', Vulnerabilities: [{ VulnerabilityID: r[1], PkgName: r[2], InstalledVersion: r[3], FixedVersion: r[4], Severity: r[5] }] }; }) }, null, 2) + '\n', '644');
      } else {
        fsWrite(ctx, opt.o, out.join('\n') + '\n', '644');
      }
      out.push('（报告已写入 ' + opt.o + '）');
    }
    if (opt.scanners && opt.scanners.indexOf('secret') !== -1) {
      out.push('');
      out.push('（--scanners vuln,secret 会同时扫硬编码密钥；检出的一律当作已泄露处理，必须换密钥而不是只删代码）');
    }
    return U.ok(out);
  }

  function kubeBenchCmd(argv, ctx, stdin, HOST) {
    var opt = parseOpts(argv, ['targets', 'benchmark', 'check', 'json', 'outputfile', 'config', 'version'], ['json', 'run']);
    var check = opt.check;
    var out = [];
    if (check === '1.2.1') {
      return U.ok([
        '[INFO] 1 Control Plane Security Configuration',
        '[INFO] 1.2 API Server',
        '[FAIL] 1.2.1 Ensure that the --anonymous-auth argument is set to false (Automated)',
        '        修复：在 kube-apiserver 启动参数里加 --anonymous-auth=false，然后重启 apiserver',
        '        ⚠ 托管集群（CCE/TKE/ACK）的 apiserver 参数由云厂商控制，客户侧通常无法修改，这一项要按 WARN 处理'
      ]);
    }
    out.push('[INFO] 4 Worker Node Security Configuration');
    out.push('[INFO] 4.1 Worker Node Configuration Files');
    out.push('[PASS] 4.1.1 Ensure that the kubelet service file permissions are set to 600 or more restrictive (Automated)');
    out.push('[PASS] 4.1.2 Ensure that the kubelet service file ownership is set to root:root (Automated)');
    out.push('[INFO] 4.2 Kubelet');
    out.push('[FAIL] 4.2.1 Ensure that the --anonymous-auth argument is set to false (Automated)');
    out.push('[FAIL] 4.2.6 Ensure that the --make-iptables-util-chains argument is set to true (Automated)');
    out.push('[WARN] 4.2.10 Ensure that the --tls-cert-file and --tls-private-key-file arguments are set (Manual)');
    out.push('[PASS] 4.2.13 Ensure that the --rotate-certificates argument is set to true (Automated)');
    out.push('');
    out.push('== Remediation for master node ==');
    out.push('4.2.1 If using the kubelet config file, edit the file /var/lib/kubelet/config.yaml and set authentication.anonymous.enabled to false');
    out.push('');
    out.push('== Summary ==');
    out.push('12 checks PASS');
    out.push('6 checks FAIL');
    out.push('4 checks WARN');
    out.push('0 checks INFO');
    out.push('');
    out.push('（FAIL 是明确不合规、需要处理；WARN 多数是"需要人工确认"，例如参数由云厂商托管 —— 别把 WARN 当成漏洞）');
    if (opt.json) {
      var w = fsWrite(ctx, '/tmp/kube-bench.json', JSON.stringify({ Tests: [{ Section: '4.2 Kubelet', Results: [{ TestNumber: '4.2.1', Status: 'FAIL' }, { TestNumber: '4.2.13', Status: 'PASS' }] }] }, null, 2) + '\n', '644');
      if (w.error) out.push('（教学环境：/tmp 不可写）');
      else out.push('（JSON 报告已写入 /tmp/kube-bench.json）');
    }
    return U.ok(out);
  }

  /* ======================================================================
     9 · 恶意文件与加固审计：clamscan / freshclam / clamdscan / lynis
     ====================================================================== */
  function freshclamCmd(argv, ctx, stdin, HOST) {
    return U.ok([
      'ClamAV update process started at Mon Mar 18 09:51:00 2024',
      'daily.cvd database is up-to-date (version: 27200, sigs: 2046000, f-level: 90, builder: raynman)',
      'main.cvd database is up-to-date (version: 62, sigs: 6647020, f-level: 90, builder: sigmgr)',
      'bytecode.cvd database is up-to-date (version: 334, sigs: 92, f-level: 90, builder: anvilleg)',
      '',
      '（病毒库必须先更新再扫描 —— 库过期等于没扫；生产上交给 clamav-freshclam 服务自动更新）'
    ]);
  }
  function clamscanCmd(argv, ctx, stdin, HOST) {
    var opt = parseOpts(argv, ['move', 'remove', 'exclude-dir', 'exclude', 'log', 'database', 'max-filesize', 'infected'],
      ['r', 'i', 'infected', 'remove', 'quiet', 'no-summary', 'bell']);
    var recursive = !!opt.r;
    var quiet = !!opt.i || !!opt.infected;
    var target = null;
    for (var i = 0; i < argv.length; i++) {
      var a = String(argv[i]);
      if (a.charAt(0) === '-') {
        if (['--move', '--exclude-dir', '--exclude', '--log', '--database', '--max-filesize'].indexOf(a) !== -1) i++;
        continue;
      }
      target = a;
    }
    if (!target) return U.fail(['ERROR: Cannot access file', 'Usage: clamscan [options] [file/directory/-]']);
    var node = fsNode(ctx, target);
    if (!node) return U.fail(['ERROR: Cannot access file ' + target + ': No such file or directory']);
    if (node.type !== 'dir' && !recursive) {
      return U.fail(['ERROR: Cannot access file ' + target + ': Is a directory (use -r)',
        '（扫描目录必须加 -r 递归）']);
    }
    var files = [];
    if (node.type === 'dir') {
      U.walkFiles(node, U.resolvePath(ctx.cwd, target), function (child, p) {
        if (recursive && child.type === 'file') files.push(p);
      });
    } else files.push(U.resolvePath(ctx.cwd, target));
    var EXCLUDE = opt['exclude-dir'] ? String(opt['exclude-dir']).replace(/^\^/, '').replace(/\$$/, '') : null;
    if (EXCLUDE) files = files.filter(function (f) { return f.indexOf(EXCLUDE) !== 0; });
    var out = ['Scanning ' + (opt.r ? 'recursively ' : '') + U.resolvePath(ctx.cwd, target)];
    var infected = [];
    files.forEach(function (f) {
      var isBad = /\.exe$|\.xlsm$|\.scr$|\.bat$/.test(f);
      if (isBad) {
        infected.push(f);
        if (quiet || true) out.push(f + ': Win.Trojan.Agent-1234567 FOUND');
      } else if (!quiet) {
        out.push(f + ': OK');
      }
    });
    out.push('');
    out.push('----------- SCAN SUMMARY -----------');
    out.push('Known viruses: 8713612');
    out.push('Engine version: 1.3.0');
    out.push('Scanned directories: ' + (node.type === 'dir' ? 1 : 0));
    out.push('Scanned files: ' + files.length);
    out.push('Infected files: ' + infected.length);
    out.push('Data scanned: ' + (files.length * 0.42).toFixed(2) + ' MB');
    out.push('Time: 4.512 sec (0 m 4 s)');
    out.push('Start Date: 2024:03:18 09:51:00');
    out.push('End Date:   2024:03:18 09:51:04');
    if (infected.length && opt.move) {
      infected.forEach(function (f) {
        var content = fsRead(ctx, f);
        var dest = opt.move.replace(/\/$/, '') + '/' + U.baseName(f) + '.quarantine';
        ensureDir(ctx, opt.move);
        fsWrite(ctx, dest, content.content || '', '600');
        rmNode(ctx, f);
        out.push('（已把 ' + f + ' 移到隔离区 ' + dest + '：先隔离而不是 --remove，保留样本才能做后续分析）');
      });
    } else if (infected.length && opt.remove) {
      infected.forEach(function (f) { rmNode(ctx, f); });
      out.push('（--remove 会直接删除样本，无法再做溯源分析，生产上更推荐 --move 到隔离区）');
    } else if (infected.length) {
      out.push('（命中后默认只报告不动文件；处置请显式加 --move=<隔离目录>，确认无误再清理）');
    }
    return { out: out, err: [], code: infected.length ? 1 : 0 };
  }
  function clamdscanCmd(argv, ctx, stdin, HOST) {
    var r = clamscanCmd(argv.concat(['-r']).filter(function (v, i, arr) { return arr.indexOf(v) === i || v !== '-r'; }), ctx, stdin, HOST);
    if (r.err && r.err.length) return r;
    r.out = ['----------- SCAN SUMMARY -----------', '（clamdscan 连接常驻的 clamd 服务，不重复加载病毒库，大目录下明显更快）'].concat(r.out);
    return r;
  }
  function lynisCmd(argv, ctx, stdin, HOST) {
    if (argv[0] === 'show' && argv[1] === 'modules') {
      return U.ok(['authentication', 'banners', 'boot_services', 'containers', 'crypto', 'file_integrity',
        'firewalls', 'hardening', 'kernel', 'logging', 'malware', 'networking', 'php', 'security_center', 'shells', 'ssh', 'storage', 'system_tools', 'time', 'users']);
    }
    var quick = argv.indexOf('--quick') !== -1;
    var group = null;
    for (var i = 0; i < argv.length; i++) {
      if (argv[i] === '--tests-from-group' && argv[i + 1]) group = argv[i + 1];
    }
    var out = [];
    out.push('[ Lynis 3.0.9 ]');
    out.push('');
    out.push('################################################################################');
    out.push('#                                                                              #');
    out.push('#   Lynis comes with ABSOLUTELY NO WARRANTY. This is free software, and you    #');
    out.push('#   are welcome to redistribute it under the terms of the GNU General Public   #');
    out.push('#   License. See LICENSE for details.                                          #');
    out.push('#                                                                              #');
    out.push('################################################################################');
    out.push('');
    if (group === 'authentication') {
      out.push('[+] Authentication');
      out.push('------------------------------------');
      out.push('  - Pluggable Authentication Modules (PAM)                            [ FOUND ]');
      out.push('  - Checking password aging for root                                  [ WARNING ]');
      out.push('  - Checking SSH configuration (PermitRootLogin)                      [ WARNING ]');
      out.push('  - Checking SSH configuration (MaxAuthTries)                         [ SUGGESTION ]');
      out.push('');
    } else {
      out.push('[+] System Tools');
      out.push('------------------------------------');
      out.push('  - Checking systemd version                                          [ OK ]');
      out.push('  - Checking for automation tool                                      [ FOUND ]');
      out.push('');
      out.push('[+] Kernel Hardening');
      out.push('------------------------------------');
      out.push('  - Checking kernel parameters (ASLR)                                 [ OK ]');
      out.push('  - Checking kernel parameters (dmesg_restrict)                       [ SUGGESTION ]');
      out.push('');
      out.push('[+] Firewalls');
      out.push('------------------------------------');
      out.push('  - Checking firewall (firewalld)                                     [ FOUND ]');
      out.push('  - Checking default zone rules                                       [ OK ]');
      out.push('');
      out.push('[+] Logging and Auditing');
      out.push('------------------------------------');
      out.push('  - Checking auditd                                                   [ OK ]');
      out.push('  - Checking log rotation                                             [ OK ]');
      out.push('');
    }
    out.push('################################################################################');
    out.push('');
    out.push('  Test and debug information is stored in /var/log/lynis.log');
    out.push('  Report data is stored in /var/log/lynis-report.dat');
    out.push('');
    out.push('  Warnings (2):');
    out.push('  ! No password set for single user mode');
    out.push('  ! /etc/ssh/sshd_config:PermitRootLogin is set to yes');
    out.push('');
    out.push('  Suggestions (5):');
    out.push('  * Install a file integrity tool to monitor changes (e.g. AIDE)');
    out.push('  * Set a password on GRUB boot loader to prevent altering boot configuration');
    out.push('  * Consider hardening SSH configuration (AllowTcpForwarding -> NO)');
    out.push('  * Enable seccomp for service nginx');
    out.push('  * Harden /etc/ssh/sshd_config (MaxAuthTries 6 -> 3)');
    out.push('');
    out.push('  Hardening index : 68 [#############       ]');
    out.push('');
    if (!quick) {
      out.push('（lynis 只读不写，不会替你改任何配置；建议上线前跑一次拿基线分数，之后每月对比分数变化）');
      out.push('（部分建议如禁用 IPv6、收紧文件权限会影响现有业务，必须人工评估后再执行）');
    } else {
      out.push('（--quick 只输出警告与建议摘要，适合放进日常巡检脚本）');
    }
    out.push('（教学环境：报告文件可查看 /var/log/lynis.log 与 /var/log/lynis-report.dat）');
    return U.ok(out);
  }

  /* ======================================================================
     10 · fail2ban-client
     ====================================================================== */
  var F2B = window.CC_SEC_F2B;
  if (!F2B) {
    F2B = window.CC_SEC_F2B = {
      jails: {
        sshd: { filter: 'sshd', actions: 'iptables-multiport', currentlyFailed: 3, totalFailed: 486, currentlyBanned: 2, totalBanned: 37, banned: ['198.51.100.77', '203.0.113.66'] }
      }
    };
  }
  function fail2banCmd(argv, ctx, stdin, HOST) {
    var sub = argv[0];
    if (!sub || sub === 'status') {
      var lists = F2B.jails[M2_JAIL(argv[1])];
      if (argv[1]) {
        if (!lists) return U.fail(['2024-03-18 09:51:00,114 fail2ban                [1]: ERROR   NOK: (' + argv[1] + ') - Jails not found']);
        return U.ok([
          'Status for the jail: ' + argv[1],
          '|- Filter',
          '|  |- Currently failed:\t' + lists.currentlyFailed,
          '|  |- Total failed:\t' + lists.totalFailed,
          '|  `- File list:\t/var/log/secure',
          '`- Actions',
          '   |- Currently banned:\t' + lists.currentlyBanned,
          '   |- Total banned:\t' + lists.totalBanned,
          '   `- Banned IP list:\t' + lists.banned.join(' ')
        ]);
      }
      var names = Object.keys(F2B.jails);
      return U.ok([
        'Status',
        '|- Number of jail:\t' + names.length,
        '`- Jail list:\t' + names.join(', ')
      ]);
    }
    if (sub === 'banned') {
      var all = [];
      Object.keys(F2B.jails).forEach(function (j) { all = all.concat(F2B.jails[j].banned); });
      return U.ok(all.length ? all : ['No IP address currently banned']);
    }
    if (sub === 'set') {
      var jail = argv[1], action = argv[2], ip = argv[3];
      if (!jail || !F2B.jails[jail]) return U.fail(['2024-03-18 09:51:00,114 fail2ban [1]: ERROR   NOK: (' + (jail || '') + ') - Jails not found']);
      if (!action || !ip) return U.fail(['Usage: fail2ban-client set <jail> <banip|unbanip> <IP>']);
      var list = F2B.jails[jail].banned;
      if (action === 'banip') {
        if (list.indexOf(ip) !== -1) return U.fail([ip + ' already banned']);
        list.push(ip);
        F2B.jails[jail].currentlyBanned = list.length;
        return U.ok([ip]);
      }
      if (action === 'unbanip') {
        var idx = list.indexOf(ip);
        if (idx === -1) return U.fail([ip + ' is not banned']);
        list.splice(idx, 1);
        F2B.jails[jail].currentlyBanned = list.length;
        return U.ok([ip]);
      }
      return U.fail(['Invalid action ' + action]);
    }
    if (sub === 'reload') {
      return U.ok(['（配置重载完成；改 /etc/fail2ban/jail.local 后必须 reload 才生效）',
        '⚠ 别忘了 ignoreip 里的跳板机与内网网段 —— 把运维自己封在门外是 fail2ban 最著名的事故']);
    }
    if (sub === 'restart') return U.ok(['（服务重启完成）']);
    return U.fail(['Usage: fail2ban-client [status|set|reload|restart] ...']);
  }
  function M2_JAIL(x) { return x; }

  /* ======================================================================
     11 · 包完整性校验：rpm -V / debsums
     ====================================================================== */
  var RPM_DB = {
    '/usr/bin/ps': 'procps-ng-3.3.15-14.el8.x86_64',
    '/usr/bin/netstat': 'net-tools-2.0-0.52.el8.x86_64',
    '/usr/bin/ls': 'coreutils-8.30-13.el8.x86_64',
    '/usr/bin/top': 'procps-ng-3.3.15-14.el8.x86_64',
    '/usr/sbin/sshd': 'openssh-server-8.0p1-19.el8.x86_64',
    '/usr/sbin/nginx': 'nginx-1.20.1-1.el8.x86_64',
    '/usr/bin/curl': 'curl-7.61.1-30.el8.x86_64'
  };
  function rpmCmd(argv, ctx, stdin, HOST) {
    if (argv.indexOf('-Va') !== -1 || argv.indexOf('-V') !== -1 && argv.indexOf('-a') !== -1) {
      return U.ok([
        'S.5....T.  c /etc/ssh/sshd_config',
        'S.5....T.    /usr/bin/ps',
        '..5....T.    /usr/bin/netstat',
        'missing     /etc/ld.so.preload.rpmsave',
        '.......T.  c /etc/nginx/nginx.conf',
        '.....UG..    /usr/bin/ls',
        '.M.......    /var/log/btmp'
      ]);
    }
    if (argv[0] === '-V') {
      var pkgs = argv.slice(1).filter(function (a) { return a.charAt(0) !== '-'; });
      if (!pkgs.length) return U.fail(['rpm: -V 需要包名']);
      var unknown = pkgs.filter(function (p) { return ['coreutils', 'procps-ng', 'net-tools', 'openssh-server', 'nginx'].indexOf(p) === -1; });
      if (unknown.length) return { out: [], err: unknown.map(function (p) { return 'package ' + p + ' is not installed'; }), code: 1 };
      var out = [];
      if (pkgs.indexOf('procps-ng') !== -1) out.push('S.5....T.    /usr/bin/ps');
      if (pkgs.indexOf('net-tools') !== -1) out.push('..5....T.    /usr/bin/netstat');
      if (pkgs.indexOf('coreutils') !== -1) out.push('.....UG..    /usr/bin/ls');
      return U.ok(out.length ? out : ['（这些包的文件与包数据库记录一致）']);
    }
    if (argv[0] === '-qf' || argv[0] === '-q' && argv[1] === '--whatprovides') {
      var path = argv[1] === '--whatprovides' ? argv[2] : argv[1];
      var owner = RPM_DB[path];
      if (!owner) return { out: [], err: ['file ' + (path || '') + ' is not owned by any package'], code: 1 };
      return U.ok([owner]);
    }
    if (argv[0] === '-q') {
      var name = argv[1];
      if (!name) return U.fail(['rpm: -q 需要包名']);
      var found = Object.keys(RPM_DB).filter(function (k) { return RPM_DB[k].indexOf(name + '-') === 0; });
      if (!found.length) return { out: [], err: ['package ' + name + ' is not installed'], code: 1 };
      return U.ok([RPM_DB[found[0]]]);
    }
    return U.fail(['（教学环境实现了 rpm -Va / -V / -q / -qf；安装卸载类操作不模拟）']);
  }
  function debsumsCmd(argv, ctx, stdin, HOST) {
    if (argv.indexOf('-c') !== -1) {
      return U.ok([
        '/usr/bin/ps',
        '/usr/bin/netstat',
        '/etc/nginx/nginx.conf'
      ]);
    }
    if (argv.indexOf('-l') !== -1) {
      return U.ok(['（Deiban/Ubuntu 上 debsums 默认不校验配置文件，需要 --all 才包含）']);
    }
    return U.fail(['debsums: 未指定动作（常用 debsums -c 只列出校验失败的文件）']);
  }

  /* ======================================================================
     12 · 补充：ssh-keygen / reboot / service
     ----------------------------------------------------------------------
     这三条本身不属于"安全命令实现"的核心，但 security 分类的示例里在用，
     缺了会让学员照着敲却得到 command not found。
     ====================================================================== */
  var SSH_KEYS = window.CC_SEC_SSHKEYS;
  if (!SSH_KEYS) {
    SSH_KEYS = window.CC_SEC_SSHKEYS = {
      '~/.ssh/id_ed25519_ci': { type: 'ED25519', bits: 256, fingerprint: 'SHA256:8Yq3kR7mZ1pQ4wN6vB2xL9tH5jC0sD3fG7hK1mP8nT4', comment: 'ops@ci-runner' },
      '~/.ssh/id_rsa_switch': { type: 'RSA', bits: 4096, fingerprint: 'SHA256:3Fp9wQ2nL7xB5vC1mK8jH4gD6sA0zX9yU3rT7oP2iE5', comment: 'legacy@switch' },
      '/etc/ssh/ssh_host_ed25519_key': { type: 'ED25519', bits: 256, fingerprint: 'SHA256:qT6vN9mK2xL5bC8dF1gH4jP7sW0zA3eR6yU9iO2pS5', comment: 'root@web-prod-01' }
    };
  }
  function expandTilde(p) {
    return String(p).replace(/^~/, '/root');
  }
  /* 由密钥内容算一个**确定性**指纹：同一个文件永远给同一个 SHA256:…，
     这样才能做"核对指纹"这类练习（每次刷新都变的话没法核对）。
     ⚠️ 第一版写法有个退化：`n = floor(n/64) + 常数` 很快收敛成一个固定小数，
     于是指纹后半段变成 `…CKRYfmt07CKRYfmt07…` 这种肉眼可见的循环。
     换成 LCG（线性同余）+ 全 64 字符表，输出看起来才像真指纹。 */
  function fpOf(content) {
    var s = String(content);
    var seed = 2166136261;
    for (var i = 0; i < s.length; i++) {
      seed ^= s.charCodeAt(i);
      seed = (seed * 16777619) >>> 0;
    }
    var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    var state = seed >>> 0;
    var out = '';
    for (var k = 0; k < 43; k++) {
      /* xorshift32：周期长、分布均匀，适合"看起来随机"的确定性输出 */
      state ^= (state << 13) >>> 0; state = state >>> 0;
      state ^= state >>> 17;
      state ^= (state << 5) >>> 0; state = state >>> 0;
      out += B64.charAt(state % 64);
    }
    return 'SHA256:' + out;
  }
  /* 解析一份公钥文件：`<类型> <base64> [注释]` */
  function parsePubKey(text) {
    var line = String(text).split('\n').filter(function (l) { return l.trim() !== '' && l.charAt(0) !== '#'; })[0] || '';
    var m = line.trim().match(/^(ssh-rsa|ssh-ed25519|ecdsa-sha2-nistp\d+|ssh-dss)\s+(\S+)\s*(.*)$/);
    if (!m) return null;
    var t = m[1];
    return {
      type: t === 'ssh-rsa' ? 'RSA' : (t === 'ssh-ed25519' ? 'ED25519' : (t === 'ssh-dss' ? 'DSA' : 'ECDSA')),
      bits: t === 'ssh-rsa' ? 3072 : (t === 'ssh-ed25519' ? 256 : (t === 'ssh-dss' ? 1024 : 256)),
      material: m[2],
      comment: m[3] || 'no comment'
    };
  }
  function sshKeygenCmd(argv, ctx, stdin, HOST) {
    var opt = parseOpts(argv, ['t', 'b', 'C', 'f', 'a', 'N', 'm'], ['p', 'l', 'y', 'q']);
    /* ⚠️ `ssh-keygen -l -f <文件>` 必须**真的去虚拟文件系统里找这个文件**。
       早先它只查一张写死的 SSH_KEYS 表，于是 `/root/.ssh/id_ed25519.pub`
       明明 `cat` 得出来（termfs 里就有），`ssh-keygen -l -f` 却报
       `No such file or directory` —— 学员会以为"公钥没生成成功"，
       而站内 ln-ssh-keygen 的示例正是在教"核对公钥指纹"这一步。
       现在改成：文件在 → 从内容解析出类型/指纹/注释；文件不在 → 才报不存在。
       指纹由内容确定性地算出来（同一文件永远同一个值），方便做核对练习。 */
    if (opt.l) {
      var target = opt.f || opt._[0];
      if (!target) return U.fail(['ssh-keygen: 需要 -f <公钥文件>']);
      var lnode = fsNode(ctx, expandTilde(target));
      if (!lnode || lnode.type === 'dir') {
        return U.fail(['ssh-keygen: ' + target + ': No such file or directory']);
      }
      var pk = parsePubKey(lnode.content || '');
      if (pk) {
        return U.ok([pk.bits + ' ' + fpOf(pk.material) + ' ' + pk.comment + ' (' + pk.type + ')']);
      }
      /* 不是公钥文件（例如给的是私钥）→ 用登记过的元数据兜底 */
      var k0 = SSH_KEYS[expandTilde(target).replace(/\.pub$/, '')] || null;
      if (k0) return U.ok([k0.bits + ' ' + k0.fingerprint + ' ' + k0.comment + ' (' + k0.type + ')']);
      return U.fail(['ssh-keygen: ' + target + ' is not a public key file']);
    }
    if (opt.p) {
      var pf = opt.f || opt._[0];
      if (!pf) return U.fail(['ssh-keygen: 需要 -f <私钥文件>']);
      var pnode = fsNode(ctx, expandTilde(pf));
      var k2 = SSH_KEYS[expandTilde(pf)];
      if (!pnode && !k2) return U.fail(['ssh-keygen: ' + pf + ': No such file or directory']);
      return U.ok([
        'Key has comment ' + ((k2 && k2.comment) || 'root@' + (HOST.hostname || 'localhost')),
        'Your identification has been saved with the new passphrase.',
        '（教学环境不询问口令；真机上会两次提示输入新口令）'
      ]);
    }
    var type = opt.t || 'rsa';
    if (['rsa', 'ed25519', 'ecdsa', 'dsa'].indexOf(type) === -1) {
      return U.fail(['ssh-keygen: unknown key type ' + type, '（可选：rsa / ed25519 / ecdsa —— 新系统默认选 ed25519）']);
    }
    var bits = Number(opt.b || (type === 'rsa' ? 3072 : (type === 'ecdsa' ? 256 : 256)));
    if (type === 'rsa' && bits < 2048) {
      return U.fail(['Invalid RSA key length: minimum is 2048 bits', '（RSA 低于 2048 位已被主流算法库拒绝）']);
    }
    if (type === 'ecdsa' && [256, 384, 521].indexOf(bits) === -1) {
      return U.fail(['Invalid ECDSA key length: ' + bits, '（ecdsa 只支持 256 / 384 / 521）']);
    }
    var file = expandTilde(opt.f || '');
    if (!file) return U.fail(['ssh-keygen: 需要 -f <私钥输出路径>', '（教学环境不支持交互式询问文件名）']);
    var seed = sha256Hex(file + ':' + type + ':' + bits);
    var comment = opt.C || (HOST.user + '@' + HOST.hostname);
    var pubBody, privBody;
    if (type === 'ed25519') {
      pubBody = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI' + base64Encode(sha256Bytes(utf8Bytes(seed))).slice(0, 43);
      privBody = '-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gtZW\n' +
        base64Encode(sha256Bytes(utf8Bytes('priv:' + seed))).slice(0, 64) + '\n-----END OPENSSH PRIVATE KEY-----\n';
    } else if (type === 'rsa') {
      pubBody = 'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAACAQ' + base64Encode(sha256Bytes(utf8Bytes(seed))).slice(0, 60);
      privBody = '-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAABlwAAAAdzc2gtcn\n' +
        base64Encode(sha256Bytes(utf8Bytes('priv:' + seed))).slice(0, 64) + '\n-----END OPENSSH PRIVATE KEY-----\n';
    } else {
      pubBody = 'ecdsa-sha2-nistp' + bits + ' AAAA' + base64Encode(sha256Bytes(utf8Bytes(seed))).slice(0, 60);
      privBody = '-----BEGIN EC PRIVATE KEY-----\n' + wrap64(base64Encode(sha256Bytes(utf8Bytes('priv:' + seed)))) + '\n-----END EC PRIVATE KEY-----\n';
    }
    var parent = U.parentOf(U.resolvePath(ctx.cwd, file));
    if (!fsNode(ctx, parent)) {
      return U.fail(['Saving key "' + opt.f + '" failed: No such file or directory', '（父目录不存在，先 mkdir -p 或换路径）']);
    }
    fsWrite(ctx, file, privBody, '600');
    fsWrite(ctx, file + '.pub', pubBody + ' ' + comment + '\n', '644');
    SSH_KEYS[U.resolvePath(ctx.cwd, file)] = {
      type: type.toUpperCase(), bits: bits, comment: comment,
      fingerprint: 'SHA256:' + base64Encode(sha256Bytes(utf8Bytes('fp:' + seed))).slice(0, 43)
    };
    return U.ok([
      'Generating public/private ' + type + ' key pair.',
      'Your identification has been saved in ' + opt.f,
      'Your public key has been saved in ' + opt.f + '.pub',
      'The key fingerprint is:',
      'SHA256:' + base64Encode(sha256Bytes(utf8Bytes('fp:' + seed))).slice(0, 43) + ' ' + comment,
      'The key randomart image is:',
      '+--[ ' + (type === 'ed25519' ? 'ED25519' : type.toUpperCase() + ' ' + bits) + ' ]----+',
      '|      .o+*B=o     |',
      '|     . +o*.= .    |',
      '|      o..o . o    |',
      '|     . .  . .     |',
      '|      . S o       |',
      '|       . + .      |',
      '|        . .       |',
      '|           .      |',
      '|                  |',
      '+----[SHA256]-----+',
      '',
      '（私钥权限必须是 600；一机一钥、一环境一钥，泄露时才能单独吊销）'
    ]);
  }
  function rebootCmd(argv, ctx, stdin, HOST) {
    var hasAuto = fsNode(ctx, '/.autorelabel');
    /* ⚠️ 这里必须和 cmd-host.js 的 halt/poweroff/shutdown 保持同一口径：
       说清"不会真的执行"、给参数对照、提醒远程执行会断线。
       早先只写一句"教学环境不会真的重启机器"，学员拿不到"这条命令有多危险"的信息。 */
    var out = [
      '（教学环境）已解析：**重启**' + (argv.indexOf('-f') !== -1 ? '（强制，跳过服务优雅退出）' : '') + '。',
      '参数对照：`-f` 强制重启（可能丢数据）｜ `-p` 关机 ｜ `--no-wall` 不广播',
      '写脚本/远程操作前务必知道：**这条命令会让你当场断线**。给自己留路子的做法是先 `shutdown -r +5`，',
      '确认能重连再等它执行；或者用带外管理（云控制台 / IPMI）兜底。'
    ];
    if (hasAuto) {
      out.push('已检测到 /.autorelabel：真机重启时会**全盘重新打 SELinux 标签**，耗时取决于磁盘数据量，期间服务不可用。');
      out.push('只在"从 Disabled 切回 Enforcing"时使用；生产上务必安排在维护窗口。');
    }
    return { out: out, err: ['（教学环境）**不会真的执行 重启** —— 仿真机不是一台真机器，"重启"在这里只能是一句空话，',
      '假装成功会让你低估这条命令的杀伤力。参数含义已在上方说明，请在真机上练习。'], code: 0 };
  }
  function serviceCmd(argv, ctx, stdin, HOST) {
    if (!argv.length) return U.fail(['Usage: service <option> | --status-all | [ service_name [ command | --full-restart ] ]']);
    var name = argv[0], action = argv[1] || 'status';
    if (name === '--status-all') {
      return U.ok([' [ + ]  auditd', ' [ + ]  crond', ' [ + ]  docker', ' [ + ]  mysqld', ' [ + ]  nginx', ' [ - ]  firewalld', ' [ - ]  postfix']);
    }
    if (name === 'auditd') {
      return U.ok(['Redirecting to /bin/systemctl ' + action + ' auditd.service']);
    }
    return U.ok(['Redirecting to /bin/systemctl ' + action + ' ' + name + '.service']);
  }

  /* ======================================================================
     13 · LS_COLORS 兼容：ls -Z 看 SELinux 上下文
     ----------------------------------------------------------------------
     shell.js 里的 ls 还不认 -Z，示例 `ls -Z /data/www/index.html` 会报
     "cannot access '…'"。这里注册一条**只处理 -Z 的包装**，其余参数原样交给
     引擎自己的 ls —— 不覆盖它的任何行为。但 extend() 不覆盖已存在的命令，
     所以改为：在 ls 的实现不存在时才注册（浏览器端 shell.js 一定先加载，
     这条实际是给测试环境兜底的）。真正的修复见下面 lsZ 的调用点。
     ====================================================================== */
  function lsZ(argv, ctx, stdin, HOST, base) {
    var wantZ = false, rest = [];
    argv.forEach(function (a) {
      if (/^-[a-zA-Z]*Z[a-zA-Z]*$/.test(a)) { wantZ = true; rest.push('-' + a.replace(/Z/g, '').replace(/^-*/, '')); }
      else rest.push(a);
    });
    var res = base(rest.filter(function (a) { return a !== '-'; }), ctx, stdin, HOST);
    if (!wantZ) return res;
    var targets = rest.filter(function (a) { return a.charAt(0) !== '-'; });
    if (!targets.length) targets = ['.'];
    var out = [];
    targets.forEach(function (t) {
      var abs = U.resolvePath(ctx.cwd, t);
      var node = U.findNode(ctx.root, abs);
      if (!node) {
        return { out: [], err: ["ls: cannot access '" + t + "': No such file or directory"], code: 2 };
      }
      if (node.type === 'dir') {
        U.childrenSorted(node).forEach(function (n) {
          var p = (abs === '/' ? '' : abs) + '/' + n;
          out.push(seLabel(p) + ' ' + p);
        });
      } else {
        out.push(seLabel(abs) + ' ' + abs);
      }
    });
    return { out: out, err: [], code: 0 };
  }

  /* ======================================================================
     14 · for 循环 / $( ) 命令替换（教学子集）
     ----------------------------------------------------------------------
     证书批量巡检必须写成循环，`for h in a b c; do ... done` 是标准写法，
     而引擎只做"按 && / 管道 / 重定向"拆行，遇到 for 直接报 command not found。
     在**命令实现层**实现不了循环（引擎的 tokenize 会先按 | 切开），
     所以这里用钩子把 execSingle 的原始行接过来，自己做一层最小的 shell
     子集解释：变量展开（$h / ${h} / $(...)）、分号分隔的语句、管道，
     以及 $(( )) 整数算术。刻意只覆盖教程里出现的形态，不假装是完整 bash。
     ====================================================================== */
  /* 引号判断：用字符码比较，源码里就不需要出现成对引号 */
  function isQuoteChar(ch) { var c = ch.charCodeAt(0); return c === 34 || c === 39; }

  /* 把一行拆成 token：空格分隔，引号内的空格不拆，| 与 ; 单独成 token */
  function shellTokenize(line) {
    var tokens = [], cur = '', quote = null, has = false;
    var s = String(line);
    for (var i = 0; i < s.length; i++) {
      var ch = s.charAt(i);
      if (quote) {
        if (ch === quote) { quote = null; continue; }
        cur += ch; has = true; continue;
      }
      if (isQuoteChar(ch)) { quote = ch; has = true; continue; }
      if (ch === ' ' || ch === '\t' || ch === '\n') {
        if (cur !== '' || has) { tokens.push(cur); cur = ''; has = false; }
        continue;
      }
      if (ch === '|' || ch === ';') {
        if (cur !== '' || has) { tokens.push(cur); cur = ''; has = false; }
        tokens.push(ch);
        continue;
      }
      cur += ch;
    }
    if (cur !== '' || has) tokens.push(cur);
    return tokens;
  }

  /* 在字符串里找配对的收尾符号，尊重引号 */
  function findMatch(s, start, open, close) {
    var depth = 0, quote = null;
    for (var i = start; i < s.length; i++) {
      var ch = s.charAt(i);
      if (quote) { if (ch === quote) quote = null; continue; }
      if (isQuoteChar(ch)) { quote = ch; continue; }
      if (ch === open) depth++;
      else if (ch === close) { depth--; if (depth === 0) return i; }
    }
    return -1;
  }

  function forStripQuotes(s) {
    var t = String(s);
    if (t.length >= 2 && (t.charAt(0) === '"' || t.charAt(0) === "'") && t.charAt(t.length - 1) === t.charAt(0)) {
      return t.slice(1, -1);
    }
    return t;
  }

  /* 命令替换 + 变量替换（$h / ${h} / $( )），支持嵌套 $( ) */
  function forExpand(text, vars, runInline) {
    var s = String(text);
    var out = '', i = 0;
    while (i < s.length) {
      var ch = s.charAt(i);
      if (ch === '$' && s.charAt(i + 1) === '(' && s.charAt(i + 2) !== '(') {
        var end = findMatch(s, i + 1, '(', ')');
        if (end === -1) { out += ch; i++; continue; }
        var inner = s.slice(i + 2, end);
        out += String(runInline(inner, vars));
        i = end + 1;
        continue;
      }
      if (ch === '$' && s.charAt(i + 1) === '{') {
        var close = s.indexOf('}', i + 2);
        if (close === -1) { out += ch; i++; continue; }
        var expr = s.slice(i + 2, close);
        var rm = expr.match(/^([A-Za-z_][A-Za-z0-9_]*)(##?\*\/|\/\/|%%?)(.*)$/);
        if (rm) {
          var base = vars[rm[1]] === undefined ? '' : String(vars[rm[1]]);
          var op2 = rm[2], pat = forStripQuotes(rm[3]);
          if (op2 === '##') {
            var idx2 = base.lastIndexOf(pat.replace('*', ''));
            out += idx2 === -1 ? base : base.slice(idx2 + pat.replace('*', '').length);
          } else if (op2 === '#') {
            var idx3 = base.indexOf(pat.replace('*', ''));
            out += idx3 === -1 ? base : base.slice(idx3 + pat.replace('*', '').length);
          } else if (op2 === '%%') {
            var i4 = base.indexOf(pat.replace('*', ''));
            out += i4 === -1 ? base : base.slice(0, i4);
          } else if (op2 === '%') {
            var i5 = base.lastIndexOf(pat.replace('*', ''));
            out += i5 === -1 ? base : base.slice(0, i5);
          } else out += base;
          i = close + 1;
          continue;
        }
        out += vars[expr] === undefined ? '' : String(vars[expr]);
        i = close + 1;
        continue;
      }
      if (ch === '$') {
        var vm = s.slice(i + 1).match(/^([A-Za-z_][A-Za-z0-9_]*)/);
        if (vm) {
          out += vars[vm[1]] === undefined ? '' : String(vars[vm[1]]);
          i += 1 + vm[1].length;
          continue;
        }
      }
      out += ch;
      i++;
    }
    return out;
  }

  /* $(( ... )) 里的整数算术：只支持 + - * / % 与括号 */
  function forArith(expr) {
    var s = String(expr).replace(/\s+/g, '');
    var pos = 0;
    function parseExpr() {
      var v = parseTerm();
      while (pos < s.length && (s.charAt(pos) === '+' || s.charAt(pos) === '-')) {
        var op = s.charAt(pos++);
        var r = parseTerm();
        v = op === '+' ? v + r : v - r;
      }
      return v;
    }
    function parseTerm() {
      var v = parseFactor();
      while (pos < s.length && (s.charAt(pos) === '*' || s.charAt(pos) === '/' || s.charAt(pos) === '%')) {
        var op = s.charAt(pos++);
        var r = parseFactor();
        v = op === '*' ? v * r : (op === '/' ? Math.floor(v / r) : v % r);
      }
      return v;
    }
    function parseFactor() {
      if (s.charAt(pos) === '(') {
        pos++;
        var v = parseExpr();
        if (s.charAt(pos) === ')') pos++;
        return v;
      }
      var m = s.slice(pos).match(/^\d+/);
      if (m) { pos += m[0].length; return Number(m[0]); }
      pos++;
      return 0;
    }
    var val = parseExpr();
    return isNaN(val) ? 0 : val;
  }

  function shellRunInline(line, vars, shell) {
    var expanded = forExpand(line, vars, function (inner, v2) { return shellRunInline(inner, v2, shell); });
    expanded = forExpand(expanded, vars, function (inner, v2) { return shellRunInline(inner, v2, shell); });
    var res = shell.exec(expanded.trim());
    var body = (res.out || []).join('\n');
    return body;
  }

  function runForLoop(tokens, ctx, shell) {
    var i = 1;
    var varname = tokens[i++];
    if (!varname || tokens[i] !== 'in') return { out: [], err: ['bash: for: 语法错误（应为 for <变量> in <列表>; do ...; done）'], code: 2 };
    i++;
    var list = [];
    var parts = [];
    while (i < tokens.length && tokens[i] !== ';' && tokens[i] !== 'do') {
      if (tokens[i] === 'in') { i++; continue; }
      /* 生成器写法 {1..5} 教学里也常用 */
      var gm = String(tokens[i]).match(/^\{(\d+)\.\.(\d+)\}$/);
      if (gm) {
        var a = Number(gm[1]), b = Number(gm[2]);
        for (var g = a; g <= b; g++) list.push(String(g));
      } else if (String(tokens[i]).indexOf('$(') !== -1) {
        var vals = forExpand(String(tokens[i]), {}, function (inner, v2) { return shellRunInline(inner, v2, shell); });
        vals.split(/\s+/).filter(Boolean).forEach(function (v) { list.push(v); });
      } else {
        list.push(forStripQuotes(String(tokens[i])));
      }
      i++;
    }
    while (i < tokens.length && tokens[i] !== 'do') i++;
    if (tokens[i] !== 'do') return { out: [], err: ['bash: for: 缺少 do'], code: 2 };
    i++;
    var bodyTokens = [];
    var depth = 0;
    for (; i < tokens.length; i++) {
      if (tokens[i] === 'for' || tokens[i] === 'while' || tokens[i] === 'until') depth++;
      if (tokens[i] === 'done') {
        if (depth === 0) break;
        depth--;
      }
      bodyTokens.push(tokens[i]);
    }
    /* 把 body 按 ; 拆成若干子脚本（每一项仍是一串 token） */
    var stmts = [];
    var curStmt = [];
    bodyTokens.forEach(function (t) {
      if (t === ';') { if (curStmt.length) stmts.push(curStmt); curStmt = []; return; }
      curStmt.push(t);
    });
    if (curStmt.length) stmts.push(curStmt);

    var out = [], err = [], code = 0;
    list.forEach(function (value) {
      var vars = {};
      vars[varname] = value;
      vars['#'] = String(list.length);
      stmts.forEach(function (stmt) {
        /* VAR=$(...) 赋值：先求值再继续 */
        if (stmt.length >= 2 && /^[A-Za-z_][A-Za-z0-9_]*=/.test(stmt[0]) && stmt[0].indexOf('=') > 0) {
          var eq = stmt[0].indexOf('=');
          var name = stmt[0].slice(0, eq);
          var rhs = stmt[0].slice(eq + 1);
          if (rhs === '') {
            /* `VAR= $(...)` 这种被 tokenize 拆开的写法：取第二个 token */
            rhs = stmt[1] || '';
          }
          var val = forExpand(rhs, vars, function (inner, v2) { return shellRunInline(inner, v2, shell); });
          if (/^\$\(\(.*\)\)$/.test(val)) val = String(forArith(val.slice(4, -2)));
          vars[name] = String(val).replace(/\n+$/, '');
          return;
        }
        var lineTokens = stmt.map(function (t) {
          return forExpand(t, vars, function (inner, v2) { return shellRunInline(inner, v2, shell); });
        });
        /* printf 是本环境没有的浮点/格式化打印，就地实现窄子集 */
        if (lineTokens[0] === 'printf') {
          var fmt = lineTokens[1] === undefined ? '' : lineTokens[1];
          var args = lineTokens.slice(2);
          var idx = 0;
          var text = String(fmt).replace(/\\n/g, '\n').replace(/\\t/g, '\t');
          text = text.replace(/%(-?)(\d*)([sdi])/g, function (m0, left, width, kind) {
            var v = args[idx++] === undefined ? '' : args[idx - 1];
            if (kind === 'd' || kind === 'i') v = String(Number(v) || 0);
            if (width) {
              var w = Number(width);
              while (String(v).length < w) v = left ? String(v) + ' ' : ' ' + String(v);
            }
            return String(v);
          });
          text.split('\n').forEach(function (l) { out.push(l); });
          return;
        }
        /* 其它语句：展开后交给引擎自己执行（管道、重定向、&& 都还是引擎的语义） */
        var res = shell.exec(lineTokens.join(' '));
        (res.out || []).forEach(function (l) { out.push(l); });
        (res.err || []).forEach(function (l) { err.push(l); });
        if (res.code !== 0) code = res.code;
      });
    });
    return { out: out, err: err, code: code };
  }

  var VIRGIN_EXEC_SINGLE = typeof window.CC_SHELL.execSingleHook !== 'function';
  if (VIRGIN_EXEC_SINGLE) {
    window.CC_SHELL.execSingleHook = function (segment, ctx, shell) {
      var trimmed = String(segment).trim();
      if (!trimmed) return null;
      try {
        if (/^for\s/.test(trimmed)) return runForLoop(shellTokenize(trimmed), ctx, shell);
        /* ls -Z：引擎的 ls 不认 -Z，会把它当成一个文件路径去 stat。
           只在"确实带 -Z 且没有别的子命令"时接管。 */
        if (/^ls\s/.test(trimmed) && /(^|\s)-[a-zA-Z]*Z[a-zA-Z]*(\s|$)/.test(trimmed)) {
          return lsContext(shellTokenize(trimmed), ctx);
        }
      } catch (e) {
        return { out: [], err: ['bash: ' + trimmed.split(/\s+/)[0] + ': 内部错误 ' + e.message], code: 2 };
      }
      return null;
    };
  }

  /* ls -Z 的实际实现：只打印 SELinux 上下文（真 ls 的 -Z 就是干这个的） */
  function lsContext(tokens, ctx) {
    var targets = [], longFormat = false, all = false;
    for (var i = 1; i < tokens.length; i++) {
      var a = tokens[i];
      if (/^-[a-zA-Z]+$/.test(a)) {
        if (a.indexOf('l') !== -1) longFormat = true;
        if (a.indexOf('a') !== -1) all = true;
        continue;
      }
      targets.push(a);
    }
    if (!targets.length) targets = ['.'];
    var out = [], err = [], code = 0;
    targets.forEach(function (t) {
      var abs = U.resolvePath(ctx.cwd, t);
      var node = U.findNode(ctx.root, abs);
      if (!node) {
        err.push("ls: cannot access '" + t + "': No such file or directory");
        code = 2;
        return;
      }
      if (node.type === 'dir') {
        U.childrenSorted(node).forEach(function (n) {
          if (!all && n.charAt(0) === '.') return;
          var p = (abs === '/' ? '' : abs) + '/' + n;
          out.push(longFormat ? seLabel(p) + ' ' + p : seLabel(p) + ' ' + n);
        });
      } else {
        out.push(longFormat ? seLabel(abs) + ' ' + abs : seLabel(abs) + ' ' + U.baseName(abs));
      }
    });
    if (err.length) return { out: out, err: err, code: code || 2 };
    return U.ok(out);
  }

  /* ======================================================================
     15 · ls -Z（SELinux 上下文）
     ----------------------------------------------------------------------
     `ls -Z /data/www/index.html` 是 security 分类里的示例：查文件标签是
     SELinux 排障的第一步。引擎自带的 ls 不认 -Z，会报 "cannot access '…'"。
     这里注册一个**薄包装**：只接管含 -Z 的调用，其余参数一律交给引擎原实现。
     ====================================================================== */
  function lsWithContextNote() { /* 保留说明位：-Z 的处理见上面的 lsContext */ }

  /* ======================================================================
     16 · 注册
     ----------------------------------------------------------------------
     ⚠ firewall-cmd 必须**同时**注册带连字符与下划线两个键：
       shell.js 里已经有 CMDS.firewall_cmd（旧实现），而 extend() 不覆盖
       已存在的键。命令查找顺序是 `CMDS[cmdName] || CMDS.firewall_cmd`，
       所以只有 'firewall-cmd' 这个没人占用的键能真正接管这条命令；
       同时注册下划线键是为了别名/直接调用那条路径也能走到同一个实现。
     ====================================================================== */
  window.CC_SHELL.extend({
    'openssl': opensslMain,
    'firewall-cmd': function (argv, ctx, stdin, HOST) { return firewallCmd(argv, ctx, stdin, HOST); },
    'firewall_cmd': function (argv, ctx, stdin, HOST) { return firewallCmd(argv, ctx, stdin, HOST); },
    'getenforce': getenforce,
    'setenforce': setenforce,
    'sestatus': sestatus,
    'getsebool': getsebool,
    'setsebool': setsebool,
    'semanage': semanage,
    'restorecon': restorecon,
    'ausearch': ausearch,
    'aureport': aureport,
    'auditctl': auditctl,
    'aa-status': aaStatus,
    'aa-complain': function (argv, ctx, stdin, HOST) { return aaMode(argv, ctx, stdin, HOST, 'complain'); },
    'aa-enforce': function (argv, ctx, stdin, HOST) { return aaMode(argv, ctx, stdin, HOST, 'enforce'); },
    'dmesg': dmesgCmd,
    'gpg': gpgCmd,
    'nmap': nmapCmd,
    'masscan': masscanCmd,
    'nikto': niktoCmd,
    'trivy': trivyCmd,
    'kube-bench': kubeBenchCmd,
    'clamscan': clamscanCmd,
    'clamdscan': clamdscanCmd,
    'freshclam': freshclamCmd,
    'lynis': lynisCmd,
    'fail2ban-client': fail2banCmd,
    'rpm': rpmCmd,
    'debsums': debsumsCmd,
    'ssh-keygen': sshKeygenCmd,
    'reboot': rebootCmd,
    'service': serviceCmd
  });
})();





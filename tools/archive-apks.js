#!/usr/bin/env node
/* Move older local installers out of the served project root. Never overwrite. */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const BACKUP = path.join(ROOT, 'backup');
const current = process.argv.find(arg => arg.startsWith('--current='));
if (!current || !/^CloudCmd-[0-9]+(?:\.[0-9]+){1,3}\.apk$/i.test(current.slice(10))) {
  console.error('Usage: node tools/archive-apks.js --current=CloudCmd-0.0.1.apk');
  process.exit(2);
}
const keep = current.slice(10).toLowerCase();
fs.mkdirSync(BACKUP, { recursive: true });
function digest(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}
for (const name of fs.readdirSync(ROOT).filter(name => /^CloudCmd-.*\.apk$/i.test(name) && name.toLowerCase() !== keep)) {
  const source = path.join(ROOT, name);
  if (!fs.statSync(source).isFile()) continue;
  const sha = digest(source);
  let target = path.join(BACKUP, name);
  if (fs.existsSync(target)) {
    if (digest(target) === sha) {
      fs.unlinkSync(source);
      console.log('Already archived: ' + name);
      continue;
    }
    target = path.join(BACKUP, name.replace(/\.apk$/i, '-' + sha.slice(0, 12) + '.apk'));
    if (fs.existsSync(target)) {
      if (digest(target) !== sha) throw new Error('Archive collision: ' + target);
      fs.unlinkSync(source);
      console.log('Already archived: ' + path.basename(target));
      continue;
    }
  }
  fs.renameSync(source, target);
  console.log('Archived: ' + name + ' -> backup/' + path.basename(target));
}

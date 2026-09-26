// tools/regression-shell-fixes.js
// Focused regressions for shell filesystem, redirection, glob, and symlink behavior.
'use strict';

const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

global.window = { CC_DATA: {}, CC_CATS: {} };
global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
global.document = {
  documentElement: { setAttribute() {}, getAttribute() { return 'light'; } },
  addEventListener() {}, getElementById: () => null, querySelectorAll: () => []
};

function load(rel) {
  (0, eval)(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
}

load('data/termfs.js');
load('assets/js/store.js');
load('assets/js/shell.js');

const shell = window.CC_SHELL.create();
const failures = [];

function run(command) {
  try {
    const result = shell.exec(command);
    return {
      out: result.out || [],
      err: result.err || [],
      code: typeof result.code === 'number' ? result.code : 0
    };
  } catch (error) {
    return { out: [], err: [error.message], code: -1 };
  }
}

function check(name, fn) {
  try {
    if (!fn()) failures.push(name);
  } catch (error) {
    failures.push(name + ': ' + error.message);
  }
}

check('redirect-to-directory-fails-and-preserves-directory', () => {
  const result = run('echo changed > /etc');
  const node = window.CC_SHELL.util.findNode(shell.root, '/etc');
  return result.code !== 0 && node && node.type === 'dir';
});

check('input-redirect-feeds-command', () => {
  const result = run("printf 'a\\nb\\n' > /tmp/input-regression.txt && wc -l < /tmp/input-regression.txt");
  return result.code === 0 && result.out.join('\n').trim().startsWith('2');
});

check('quoted-glob-stays-literal', () => {
  const result = run("echo '/etc/*.conf'");
  return result.code === 0 && result.out.join('\n').trim() === '/etc/*.conf';
});

check('relative-symlink-resolves-from-link-directory', () => {
  const result = run("mkdir -p /tmp/real-regression && echo ok > /tmp/real-regression/a && ln -s real-regression /tmp/link-regression && cat /tmp/link-regression/a");
  return result.code === 0 && result.out.join('\n').trim() === 'ok';
});

check('symlink-cycle-terminates-with-error', () => {
  const result = run("ln -s /tmp/cycle-b /tmp/cycle-a && ln -s /tmp/cycle-a /tmp/cycle-b && cat /tmp/cycle-a/file");
  return result.code !== 0 && result.err.join('\n').length > 0;
});

if (failures.length) {
  console.error('Shell regression failures:');
  failures.forEach(name => console.error('  - ' + name));
  process.exit(1);
}

console.log('Shell regression checks: 5 passed / 0 failed');
